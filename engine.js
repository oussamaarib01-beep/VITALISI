/* =====================================================================
   Astronaut Health Monitor — rules engine (front end only, in memory)
   Implements the backend algorithm: master loop (4), validation (5),
   modes (6), baselines (7), detection rules (8), timing (9),
   emergencies (10, 11), patterns (12), symptoms and Crew Aid (13),
   events (14), reminders (15), records (16), with the agreed fixes.
   Data is append-only inside the page; a reload starts fresh.
   ===================================================================== */
(function (global) {
  'use strict';
  const C = global.CONTENT;
  const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN, DAY = 24 * HOUR, STEP = 30 * SEC;
  const START_T = 112 * DAY + (14 * 60 + 32) * MIN;           // Day 112 · 14:32:00

  const CHEST = ['hr', 'ecg', 'pause', 'hrv', 'rr', 'apnea'];
  const WRIST = ['spo2', 'skin', 'act', 'sleeph'];
  const DOSI = ['rad', 'dose', 'spe'];
  const CABIN = ['o2', 'press', 'co2', 'cont', 'smoke'];
  const CONT = CHEST.concat(WRIST, DOSI, CABIN);
  const MANUAL = ['sys', 'dia', 'rest', 'core', 'fspo2', 'mass', 'visl', 'visr', 'urine', 'fluid', 'mood', 'stress', 'ecg12', 'us'];
  const PLAUSIBLE = {
    hr: [20, 250], pause: [0, 60], hrv: [5, 250], rr: [3, 70], apnea: [0, 600], spo2: [40, 100], skin: [20, 42], act: [0, 3], sleeph: [0, 24],
    rad: [0, 1000], dose: [0, 100000], o2: [5, 50], press: [30, 120], co2: [0, 30], cont: [0, 1000],
    sys: [50, 260], dia: [30, 160], core: [30, 43], fspo2: [40, 100], mass: [30, 200], visl: [-0.3, 2], visr: [-0.3, 2], fluid: [0, 10], mood: [0, 10], stress: [0, 10]
  };
  const UNITS = { hr: 'bpm', pause: 's', hrv: 'ms', rr: '/min', apnea: 's', spo2: '%', skin: '°C', act: '', sleeph: 'h', rad: 'mSv/h', dose: 'mSv', o2: '%', press: 'kPa', co2: 'mmHg', cont: '× limit', sys: 'mmHg', dia: 'mmHg', core: '°C', fspo2: '%', mass: 'kg', visl: 'logMAR', visr: 'logMAR', fluid: 'L', mood: '/10', stress: '/10' };
  const NAMES = {}; C.SIM_ROWS.forEach((r) => { NAMES[r.id] = r.name; });
  const DEVICE_OF = {}; C.SIM_ROWS.forEach((r) => { DEVICE_OF[r.id] = C.DEVICES[r.dev - 1].name; });

  const store = {};           // astronaut id -> state (kept while the page is open); write only through claimSerial
  const SERIAL_RE = new RegExp('^[0-9]{' + C.SERIAL_DIGITS + '}$');
  const normName = (n) => String(n || '').trim().replace(/\s+/g, ' ').toLowerCase();
  function serialError(id) {
    id = String(id == null ? '' : id);
    if (!id) return 'Enter your ' + C.SERIAL_DIGITS + '-digit serial number.';
    if (/[^0-9]/.test(id)) return 'Invalid Serial Number. Please enter numbers only (' + C.SERIAL_DIGITS + ' digits).';
    if (!SERIAL_RE.test(id)) return 'The serial number must be exactly ' + C.SERIAL_DIGITS + ' digits. You entered ' + id.length + '.';
    return null;
  }
  // uniqueness: one serial number belongs to one astronaut (the store's key is the unique constraint)
  function claimSerial(id, name) {
    const err = serialError(id); if (err) return { ok: false, msg: err };
    const have = store[id];
    if (have && normName(have.name) !== normName(name)) return { ok: false, msg: 'Serial number ' + id + ' is already registered to another astronaut. Enter your own serial number.' };
    if (!have) store[id] = newState(id, String(name).trim());
    return { ok: true, state: store[id] };
  }
  let S = null;               // state of the logged-in astronaut
  const listeners = [];
  let inRun = false, stopFlag = null, idSeq = 1;

  /* ---------------- helpers ---------------- */
  const nowReal = () => Date.now();
  const uid = (p) => (p || 'id') + '-' + (idSeq++).toString(36);
  const pad = (n) => String(n).padStart(2, '0');
  const dayOf = (t) => Math.floor(t / DAY);
  const tod = (t) => ((t % DAY) + DAY) % DAY;
  const fmtHM = (t) => pad(Math.floor(tod(t) / HOUR)) + ':' + pad(Math.floor(tod(t) % HOUR / MIN));
  const fmtHMS = (t) => fmtHM(t) + ':' + pad(Math.floor(tod(t) % MIN / SEC));
  const fmtDay = (t) => 'Day ' + dayOf(t) + ' · ' + fmtHM(t);
  const parseHM = (s) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(s || '').trim()); return m ? (+m[1] * 60 + +m[2]) * MIN : null; };
  const num = (v) => { if (v === null || v === undefined) return null; const s = String(v).trim().replace(',', '.'); if (s === '') return null; const n = Number(s); return Number.isFinite(n) ? n : NaN; };
  const r1 = (n) => Math.round(n * 10) / 10;
  function emit(type, data) { listeners.forEach((f) => { try { f(type, data); } catch (e) { console.error(e); } }); }

  /* ---------------- thresholds ---------------- */
  function defaultThresholds() { const th = {}; C.THRESHOLDS.forEach(([, list]) => list.forEach(([k, , v]) => { th[k] = v; })); return th; }
  const th = (k) => S.th[k];

  /* ---------------- state creation ---------------- */
  function parseCase(mode) {
    const src = C.CASE_NORMAL[mode]; const cur = {};
    CONT.forEach((k) => { cur[k] = parseField(k, src[k]).value; });
    cur.quality = 100;
    return cur;
  }

  function newState(id, name) {
    const st = {
      id, name,
      profile: { age: 40, sex: 'male', fitness: 'average', mass: 70.0, bedtime: '22:00', wake: '06:00', fluidPlan: 2.5, testedMaxHr: null, spacewalks: false, careerDose: 0 },
      base: { rest_hr: 65, sleep_hr: 56, sleep_low: 50, rest_hrv: 55, sleep_hrv: 65, rest_rr: 14, sleep_rr: 12, rest_spo2: 98, sleep_spo2: 96, rest_skin: 33.5, sleep_skin: 34.2, core: 36.8, sys: 118, dia: 76, mass: 70.0, visl: 0, visr: 0, usual_sleep: 7.5, aerobic_load_hr: 105 },
      th: defaultThresholds(),
      counters: {},
      controls: { crewResponds: false, crewAfter: 10, responsive: true, chest: 'working', wrist: 'working' },
      clock: { t: START_T, paused: false, nextStep: START_T + STEP, lastReal: nowReal() },
      mode: { mode: 'regular', since: START_T, ex: null, sleepStart: null, exEnd: null, wakeAt: null, onsetMode: null },
      cur: parseCase('regular'),
      man: {},
      since: {}, samples: [], radLog: [], sensorSince: {}, ctxHold: null, sleepLow: 0,
      run: { active: false, started: null, log: [] },
      events: [], episode: null, symptoms: {}, pending: {}, manualSigns: {},
      reminders: [], exAlerts: [], toasts: [],
      trend: { poorNights: 0, fluidLowDays: 0, fluidToday: 1.2, urineToday: null, lastDay: dayOf(START_T), moodHigh: 0 },
      crewAid: { entry: 'crew', answers: {}, result: null, codes: [], text: '' },
      db: { logins: [], profile: [], measurements: [], sent: [], modes: [], symptoms: [], mental: [], eventLog: [], steps: [], calls: [], responses: [], checks: [], crewAid: [], messages: [], reminderActions: [], thresholdChanges: [], counters: [], hourly: [], sleep: [] }
    };
    seedHistory(st);
    seedReminders(st);
    return st;
  }

  // Demo history matching the design's Records screen (Day 98-112).
  function seedHistory(st) {
    const add = (t, key, value, by, extra) => st.db.measurements.push(Object.assign({ id: uid('m'), t, key, value, unit: UNITS[key] || '', by: by || 'You', reason: 'routine', flags: [], demo: true }, extra || {}));
    add(98 * DAY + 6.5 * HOUR, 'mass', 70.0, 'You', { note: 'avg of 3' });
    add(105 * DAY + 6.5 * HOUR, 'mass', 70.1, 'You', { note: 'avg of 3' });
    add(108 * DAY + 7 * HOUR, 'visl', 0.0); add(108 * DAY + 7 * HOUR, 'visr', 0.0);
    st.db.modes.push({ t: 111 * DAY + 18 * HOUR + 10 * MIN, mode: 'exercise', by: 'astronaut', label: 'Workout started', value: 'Aerobic · Moderate · 30 min', demo: true });
    st.db.modes.push({ t: 111 * DAY + 18 * HOUR + 40 * MIN, mode: 'regular', by: 'astronaut', label: 'Workout ended', value: 'Aerobic · 30 min', demo: true });
    st.db.modes.push({ t: 111 * DAY + 22 * HOUR + 14 * MIN, mode: 'sleep', by: 'astronaut', label: 'Regular → Sleep', value: '', demo: true });
    st.db.modes.push({ t: 112 * DAY + 6 * HOUR + 2 * MIN, mode: 'regular', by: 'astronaut', label: 'Sleep → Regular', value: '7 h 48 min', demo: true });
    add(112 * DAY + 7 * HOUR + 5 * MIN, 'core', 36.8);
    st.db.measurements.push({ id: uid('m'), t: 112 * DAY + 7 * HOUR + 10 * MIN, key: 'bp', value: '118/76', unit: 'mmHg', by: 'You', reason: 'routine', flags: [], demo: true, sys: 118, dia: 76 });
    add(112 * DAY + 9 * HOUR, 'fluid', 0.5, 'You', { note: 'drink' });
    add(112 * DAY + 12 * HOUR, 'fluid', 0.7, 'You', { note: 'drink' });
  }

  function seedReminders(st) {
    const plan = st.profile.fluidPlan;
    const ml = Math.round(plan * 1000 / 8 / 10) * 10;
    const R = (o) => st.reminders.push(Object.assign({ id: uid('r'), done: {}, snooze: {}, deleted: false, important: false, created: START_T }, o));
    R({ type: 'daily', text: 'Drink water · ' + ml + ' mL', sched: { kind: 'times', times: [8, 10, 12, 14, 15, 16, 18, 20].map((h) => h * HOUR) } });
    R({ type: 'daily', text: 'Exercise today', rotate: true, sched: { kind: 'times', times: [16 * HOUR + 30 * MIN] } });
    R({ type: 'daily', text: 'Daily Check-Up · after 5 minutes of rest', sched: { kind: 'times', times: [6 * HOUR + 30 * MIN] } });
    R({ type: 'daily', text: 'Two minutes of slow breathing', sched: { kind: 'times', times: [12 * HOUR + 30 * MIN] } });
    R({ type: 'daily', text: 'How is your mood today?', sched: { kind: 'times', times: [20 * HOUR] } });
    R({ type: 'daily', text: 'Get ready for sleep · dim the lights and screens', sched: { kind: 'times', times: [(parseHM(st.profile.bedtime) - HOUR + DAY) % DAY] } });
    R({ type: 'daily', text: 'Body mass with SLAMMD · weekly, before eating', sched: { kind: 'weekly', first: 105 * DAY + 6.5 * HOUR } });
    R({ type: 'daily', text: 'Eye test · weekly, each eye', sched: { kind: 'weekly', first: 108 * DAY + 7 * HOUR } });
    R({ type: 'mine', text: 'Call family · weekly', sched: { kind: 'weekly', first: 105 * DAY + 19.5 * HOUR } });
  }

  /* ---------------- parsing of typed values ---------------- */
  function parseField(key, raw) {
    const s = raw === undefined || raw === null ? '' : String(raw).trim();
    if (s === '') return { empty: true, value: null };
    const low = s.toLowerCase();
    if (key === 'ecg') { if (/^n/.test(low)) return { value: 'normal' }; if (/^i/.test(low)) return { value: 'irregular' }; return { invalid: true }; }
    if (key === 'spe' || key === 'smoke' || key === 'rest') { if (/^(y|yes|1|true)$/.test(low)) return { value: true }; if (/^(n|no|0|false)$/.test(low)) return { value: false }; return { invalid: true }; }
    if (key === 'urine') { if (/^n/.test(low)) return { value: 'normal' }; if (/^d/.test(low)) return { value: 'dark' }; if (/^l/.test(low)) return { value: 'low' }; return { invalid: true }; }
    if (key === 'ecg12' || key === 'us') { if (/^n/.test(low)) return { value: 'normal' }; if (/^a/.test(low)) return { value: 'abnormal' }; return { invalid: true }; }
    const n = num(s); if (Number.isNaN(n)) return { invalid: true };
    return { value: n };
  }

  /* ---------------- baselines & derived numbers ---------------- */
  function hrMax() {
    const p = S.profile;
    if (p.testedMaxHr) return p.testedMaxHr;
    return p.sex === 'female' ? Math.round(206 - 0.88 * p.age) : Math.round(208 - 0.7 * p.age);
  }
  function zoneCeilingPct() {
    const ex = S.mode.ex; if (!ex) return null;
    if (ex.type === 'resistance') return null;
    if (ex.type === 'high_intensity' || ex.intensity === 'vigorous') return th('zone.vigorous');
    return ex.intensity === 'light' ? th('zone.light') : th('zone.moderate');
  }
  function fluidPlan() {
    const p = S.profile; if (p.fluidPlan) return p.fluidPlan;
    if (p.mass) return Math.min(3.5, Math.max(2.0, p.mass * 0.035));
    return 2.5;
  }
  function counter(key, computed) { const o = S.counters[key]; return (o !== undefined && o !== null && o !== '') ? Number(o) : (computed || 0); }

  /* ---------------- records ---------------- */
  function elog(ev, type, data) { S.db.eventLog.push(Object.assign({ id: uid('l'), event: ev.id, type, t: S.clock.t, real: nowReal() }, data || {})); }
  function message(target, ev, content, isPrivate) {
    S.db.messages.push({ id: uid('msg'), t: S.clock.t, target, event: ev ? ev.id : null, status: 'sent (simulated)', private: !!isPrivate, content });
  }
  function toast(text, tone) { const x = { id: uid('toast'), text, tone: tone || 'info', real: nowReal() }; S.toasts.push(x); emit('toast', x); }

  /* ---------------- validation (section 5) ---------------- */
  function buildCtx(t) {
    const m = S.mode.mode;
    const rm = m === 'emergency' ? 'regular' : m;
    const q = S.cur.quality == null ? 100 : S.cur.quality;
    const v = {}, val = {};
    CONT.forEach((k) => {
      let state = 'working';
      if (CHEST.includes(k)) state = S.controls.chest;
      if (WRIST.includes(k)) state = S.controls.wrist;
      const x = S.cur[k];
      let status = 'valid';
      if (state !== 'working') status = 'unavailable';
      else if (x === null || x === undefined || (typeof x === 'number' && Number.isNaN(x))) status = 'unavailable';
      else if (typeof x === 'number' && PLAUSIBLE[k] && (x < PLAUSIBLE[k][0] || x > PLAUSIBLE[k][1])) status = 'unavailable';
      else if (CHEST.includes(k) || WRIST.includes(k)) {
        if (q < th('quality.fair')) status = 'unavailable';
        else if (q < th('quality.good')) status = (k === 'spo2' && rm === 'exercise') ? 'unavailable' : 'caution';
      }
      val[k] = status; v[k] = status === 'unavailable' ? null : x;
    });
    // manual values: count only while fresh (agreed fix 1), never fingertip SpO2 in Sleep
    const fresh = {};
    Object.keys(S.man).forEach((k) => {
      const e = S.man[k];
      if (t - e.t <= th('manual.fresh.minutes') * MIN && t >= e.t) {
        if (k === 'fspo2' && rm === 'sleep') return;
        fresh[k] = e;
      }
    });
    const postEx = (rm === 'regular' && S.mode.exEnd != null && t - S.mode.exEnd <= 30 * MIN) ? (t - S.mode.exEnd) / MIN : null;
    const sym = new Set(Object.keys(S.symptoms));
    const prev = S.samples.length ? S.samples[S.samples.length - 1] : null; // previous reading (before this step is stored)
    return {
      t, m, rm, v, val, fresh, postEx, sym, prev, q,
      rest: v.act != null ? v.act <= 1 : false,
      hrmax: hrMax(),
      RB: { hr: S.base.rest_hr, hrv: S.base.rest_hrv, rr: S.base.rest_rr, spo2: S.base.rest_spo2, skin: S.base.rest_skin },
      SB: { hr: S.base.sleep_hr, low: S.base.sleep_low, hrv: S.base.sleep_hrv, rr: S.base.sleep_rr, spo2: S.base.sleep_spo2, skin: S.base.sleep_skin },
      woke: S.mode.wakeAt != null && t - S.mode.wakeAt <= 5 * MIN
    };
  }

  /* "since" window: true when cond held for ms on usable data (4 step 6) */
  function W(ctx, key, cond, ms, sigs, needValid) {
    for (const s of sigs || []) {
      const st = ctx.val[s];
      if (st === 'unavailable' || (needValid && st !== 'valid')) { delete S.since[key]; return false; }
    }
    if (!cond) { delete S.since[key]; return false; }
    if (S.since[key] == null) S.since[key] = ctx.t;
    return ctx.t - S.since[key] >= ms;
  }

  /* ---------------- emergency check (section 10) ---------------- */
  function checkEmergencies(ctx) {
    const out = []; const v = ctx.v; const sym = ctx.sym; const has = (c) => sym.has(c);
    const add = (code, o) => out.push(Object.assign({ code }, o));
    const meas = (code, signal, value, desc) => add(code, { signal, value, unit: UNITS[signal] || '', desc, measured: true });
    const symp = (code, list, desc) => { const found = list.filter(has); if (found.length) add(code, { symptoms: found, desc: desc || ('Reported: ' + found.map((c) => C.SYMPTOM_NAMES[c] || c).join(', ')) }); };
    const anySym = sym.size > 0;
    const rm = ctx.rm; const awake = rm !== 'sleep';
    const hr = v.hr, rr = v.rr, act = v.act;
    const spo2Dec = ctx.fresh.fspo2 ? ctx.fresh.fspo2.v : v.spo2;
    const spoSig = ctx.fresh.fspo2 ? 'fspo2' : 'spo2';
    const core = ctx.fresh.core ? ctx.fresh.core.v : null;
    const sys = ctx.fresh.sys ? ctx.fresh.sys.v : null;

    // E1 Astronaut cannot act
    symp('E1', ['not_responding', 'not_breathing', 'cannot_move', 'gasping']);
    if (S.episode && !S.controls.responsive) add('E1', { desc: 'Simulator: astronaut responsive = no' });
    if (awake && W(ctx, 'e1.apnea', v.apnea != null && v.apnea > th('apnea.l3.seconds'), 0, ['apnea'], true)) meas('E1', 'apnea', v.apnea, 'No breathing detected for over ' + th('apnea.l3.seconds') + ' seconds while awake');
    if (ctx.prev && act === 0 && ctx.prev.act >= 2 && ctx.t - ctx.prev.t <= STEP && hr != null && ctx.prev.hr != null && (ctx.prev.hr - hr >= 30 || (v.pause || 0) > th('ecg.pause.l1'))) meas('E1', 'hr', hr, 'Collapse pattern: activity fell to 0 and heart rate fell ' + Math.round(ctx.prev.hr - hr) + ' bpm');

    // E2 Heart attack signs
    symp('E2', ['chest_pain', 'pain_spreading']);
    const e2minor = ['cold_sweat', 'nausea', 'breathlessness', 'unusual_weakness'].filter(has);
    if (e2minor.length >= 2) add('E2', { symptoms: e2minor, desc: 'Reported: ' + e2minor.map((c) => C.SYMPTOM_NAMES[c]).join(', ') });

    // E3 Fainting, rhythm or clot signs
    const abnormalPulse = (hr != null && (hr > 120 || hr < 40)) || v.ecg === 'irregular' || (v.pause || 0) > th('ecg.pause.l1');
    if ((has('fainting') || has('near_fainting') || has('dizziness')) && abnormalPulse) add('E3', { signal: 'hr', value: hr, unit: 'bpm', desc: 'Near-fainting with an abnormal pulse', symptoms: ['near_fainting'] });
    if (has('severe_breathlessness') && has('chest_pain')) add('E3', { desc: 'Sudden severe breathlessness with chest pain', symptoms: ['severe_breathlessness', 'chest_pain'] });
    if (has('limb_swelling') && (has('breathlessness') || has('severe_breathlessness') || has('chest_pain'))) add('E3', { desc: 'One-sided limb swelling with breathlessness or chest pain', symptoms: ['limb_swelling'] });
    if (has('collapse') && rm === 'exercise') add('E3', { desc: 'Collapse during exercise', symptoms: ['collapse'] });
    if (W(ctx, 'e3.pause', (v.pause || 0) > th('ecg.pause.l3'), 0, ['pause'], true)) meas('E3', 'pause', v.pause, 'ECG pause over ' + th('ecg.pause.l3') + ' seconds');
    if (rm === 'regular' && W(ctx, 'e3.hr140', hr != null && hr > th('hr.regular.l3.above') && ctx.rest && !(ctx.postEx != null && ctx.postEx < 10), th('hr.regular.l3.minutes') * MIN, ['hr', 'act'], true)) meas('E3', 'hr', hr, 'Above ' + th('hr.regular.l3.above') + ' for ' + th('hr.regular.l3.minutes') + ' minutes with no exertion');
    if (rm === 'sleep') {
      if (W(ctx, 'e3.sleep130', hr != null && hr > th('hr.sleep.l3.above') && act === 0, 5 * MIN, ['hr', 'act'], true)) meas('E3', 'hr', hr, 'Above ' + th('hr.sleep.l3.above') + ' for 5 minutes during sleep');
      if (W(ctx, 'e3.sleep30', hr != null && hr < th('hr.sleep.l3.low'), 2 * MIN, ['hr'], true)) meas('E3', 'hr', hr, 'Below ' + th('hr.sleep.l3.low') + ' for 2 minutes during sleep');
      if (W(ctx, 'e1.sleep35', hr != null && hr < th('hr.sleep.l1.low') && hr >= th('hr.sleep.l3.low'), 2 * MIN, ['hr'], true) && !S.controls.responsive) meas('E1', 'hr', hr, 'Below ' + th('hr.sleep.l1.low') + ' for 2 minutes and no answer to "Are you OK?"');
    }
    if (rm === 'exercise') {
      if (S.profile.testedMaxHr && W(ctx, 'e3.max', hr != null && hr > S.profile.testedMaxHr, 30 * SEC, ['hr'], true)) meas('E3', 'hr', hr, 'Above your tested maximum for 30 seconds');
      if (ctx.prev && hr != null && ctx.prev.hr != null && ctx.t - ctx.prev.t <= STEP && ctx.prev.hr - hr >= th('hr.exercise.drop.bpm') && act >= 2 && (has('dizziness') || has('near_fainting'))) meas('E3', 'hr', hr, 'Sudden heart-rate drop with dizziness');
    }

    // E4 Stroke signs
    const e4 = ['face_droop', 'arm_weakness', 'speech_trouble', 'severe_headache', 'confusion'];
    symp('E4', e4);
    if (has('vision_change') && e4.some(has)) add('E4', { desc: 'Sudden vision change with another sign', symptoms: ['vision_change'] });

    // E5 Seizure or sudden loss of consciousness
    symp('E5', ['convulsion', 'collapse', 'fainting']);

    // E6 Severe breathing difficulty
    symp('E6', ['laboured_breathing', 'cannot_speak', 'severe_breathlessness']);
    if (rm === 'regular') {
      if (W(ctx, 'e6.rr30', rr != null && rr > th('rr.l3.above') && ctx.rest, 5 * MIN, ['rr', 'act'], true)) meas('E6', 'rr', rr, 'Breathing above ' + th('rr.l3.above') + ' at rest for 5 minutes');
      const sigs = spoSig === 'spo2' ? ['spo2'] : [];
      if (W(ctx, 'e6.spo2', spo2Dec != null && spo2Dec < th('spo2.regular.l3.below'), th('spo2.l3.minutes') * MIN, sigs, true)) meas('E6', spoSig, spo2Dec, 'SpO2 below ' + th('spo2.regular.l3.below') + '% for ' + th('spo2.l3.minutes') + ' minutes');
      if (ctx.postEx != null && W(ctx, 'e6.postex', spo2Dec != null && spo2Dec < th('spo2.exercise.l3.below'), 60 * SEC, sigs, true)) meas('E6', spoSig, spo2Dec, 'SpO2 below ' + th('spo2.exercise.l3.below') + '% for 60 seconds after stopping');
    }
    if (rm === 'sleep') {
      if (W(ctx, 'e6.sleepspo2', v.spo2 != null && v.spo2 < th('spo2.sleep.l3.below'), th('spo2.l3.minutes') * MIN, ['spo2'], true)) meas('E6', 'spo2', v.spo2, 'SpO2 below ' + th('spo2.sleep.l3.below') + '% for ' + th('spo2.l3.minutes') + ' minutes during sleep');
      if (ctx.val.spo2 === 'valid' && v.spo2 < th('spo2.sleep.l3.below') && ((rr != null && rr > 25) || (v.apnea || 0) > 0)) meas('E6', 'spo2', v.spo2, 'SpO2 below ' + th('spo2.sleep.l3.below') + '% with fast breathing or no breathing');
      if (W(ctx, 'e6.sleeprr', rr != null && rr > th('rr.l3.above'), 5 * MIN, ['rr'], true)) meas('E6', 'rr', rr, 'Breathing above ' + th('rr.l3.above') + ' for 5 minutes during sleep');
      if (W(ctx, 'e6.sleepapnea', v.apnea != null && v.apnea > th('apnea.l3.seconds'), 0, ['apnea'], true)) meas('E6', 'apnea', v.apnea, 'No breathing detected for over ' + th('apnea.l3.seconds') + ' seconds');
    }
    if (spo2Dec != null && spo2Dec < 90 && anySym) meas('E6', spoSig, spo2Dec, 'SpO2 below 90% with a symptom');

    // Cabin Level 3 rows (8.8) -> E10, and E6 with a breathing symptom
    const cabin = [];
    if (W(ctx, 'e10.co2', v.co2 != null && v.co2 >= th('co2.l3'), 10 * MIN, ['co2'])) cabin.push(['co2', v.co2, 'Cabin CO2 at or above ' + th('co2.l3') + ' mmHg for 10 minutes']);
    if (W(ctx, 'e10.o2', v.o2 != null && v.o2 < th('o2.l3.low'), 2 * MIN, ['o2'])) cabin.push(['o2', v.o2, 'Cabin oxygen below ' + th('o2.l3.low') + '% for 2 minutes']);
    if (W(ctx, 'e10.press', v.press != null && v.press < th('press.l3.low'), 2 * MIN, ['press'])) cabin.push(['press', v.press, 'Cabin pressure below ' + th('press.l3.low') + ' kPa for 2 minutes']);
    if (v.cont != null && v.cont >= th('cont.l3')) cabin.push(['cont', v.cont, 'Contaminant ratio ' + th('cont.l3') + ' or more']);
    if (v.smoke === true) cabin.push(['smoke', 'yes', 'Smoke or odour detected']);
    cabin.forEach(([s, x, d]) => meas('E10', s, x, d));
    if (cabin.length && ['breathlessness', 'severe_breathlessness', 'laboured_breathing', 'cough', 'headache', 'drowsiness'].some(has)) add('E6', { signal: cabin[0][0], value: cabin[0][1], unit: UNITS[cabin[0][0]] || '', desc: 'Cabin danger with a breathing symptom' });
    symp('E10', ['smoke_smell']);
    if (v.cont != null && v.cont >= 1 && anySym) meas('E10', 'cont', v.cont, 'Contaminant ratio 1.0 or more with symptoms');
    if (v.o2 != null && v.o2 < th('o2.l2.low') && anySym) meas('E10', 'o2', v.o2, 'Cabin oxygen below ' + th('o2.l2.low') + '% with symptoms');
    if (has('eye_skin_irritation') && (has('odour') || has('smoke_smell'))) add('E10', { desc: 'Eye or skin irritation with an odour', symptoms: ['eye_skin_irritation', 'odour'] });
    const co2Rising = (() => { const old = S.samples.find((s) => ctx.t - s.t <= 10 * MIN && s.co2 != null); return old && v.co2 != null && v.co2 > old.co2; })();
    if ((has('headache') || has('drowsiness') || has('breathlessness')) && v.co2 != null && v.co2 >= th('co2.l2') && co2Rising) meas('E10', 'co2', v.co2, 'CO2 at or above ' + th('co2.l2') + ' mmHg and rising, with symptoms');

    // E7 Severe allergic reaction
    symp('E7', ['throat_swelling']);
    const breathTrouble = ['laboured_breathing', 'breathlessness', 'severe_breathlessness'].some(has);
    if (has('hives') && (breathTrouble || has('near_fainting') || has('fainting') || has('collapse'))) add('E7', { desc: 'Widespread hives with breathing trouble or faintness', symptoms: ['hives'] });
    if (breathTrouble && has('allergen_exposure')) add('E7', { desc: 'Breathing trouble after a possible allergen or new medicine', symptoms: ['allergen_exposure'] });

    // E8 Severe bleeding or injury
    symp('E8', ['bleeding', 'deep_wound', 'head_injury', 'burn', 'crush_injury', 'eye_injury', 'shock_signs', 'leg_weakness', 'saddle_numbness', 'incontinence', 'severe_weakness', 'marked_pain']);

    // E9 Heat or cold danger (core: any mode, never waits)
    if (core != null && core >= th('core.l3.above')) meas('E9', 'core', core, 'Core temperature ' + th('core.l3.above') + ' °C or above');
    if (core != null && core < th('core.l3.below')) meas('E9', 'core', core, 'Core temperature below ' + th('core.l3.below') + ' °C');
    if ((has('confusion') || has('collapse') || has('laboured_breathing')) && (has('heat_exposure') || has('cold_exposure'))) add('E9', { desc: 'Confusion, collapse or abnormal breathing with heat or cold exposure', symptoms: ['heat_exposure', 'cold_exposure'].filter(has) });

    // E11, E12
    symp('E11', ['electric_shock']);
    if (S.profile.spacewalks && has('recent_pressure_change') && ['joint_pain', 'numbness_tingling', 'dizziness', 'severe_weakness', 'unusual_weakness', 'breathlessness', 'laboured_breathing'].some(has)) add('E12', { desc: 'Symptoms after a spacewalk or pressure change', symptoms: ['recent_pressure_change'] });

    // E13 Fever with deterioration
    if ((core != null && core >= th('core.l1.fever')) || has('suspected_infection')) {
      const why = [];
      if (rr != null && rr >= 22 && ctx.rest) why.push('breathing ' + rr + ' at rest');
      if (hr != null && hr > 100 && ctx.rest) why.push('heart rate ' + hr + ' at rest');
      if (has('confusion')) why.push('confusion');
      if (sys != null && sys <= 100) why.push('systolic ' + sys);
      if (has('severe_weakness')) why.push('severe weakness');
      if (why.length) add('E13', { signal: core != null ? 'core' : null, value: core, unit: '°C', desc: 'Fever with ' + why.join(', ') });
    }

    // E14 Severe stomach problem or dehydration
    symp('E14', ['cannot_keep_fluids', 'blood_vomit_stool', 'severe_abdominal_pain']);
    if (has('collapse') && (has('vomiting') || has('diarrhoea') || has('thirst'))) add('E14', { desc: 'Collapse with vomiting, diarrhoea or thirst', symptoms: ['collapse'] });
    const dehyd = [has('thirst'), has('dizziness'), S.trend.urineToday === 'dark' || S.trend.urineToday === 'low'].filter(Boolean).length;
    if (has('confusion') && dehyd >= 2) add('E14', { desc: 'Confusion with 2 dehydration signs', symptoms: ['confusion'] });

    // E15 Sudden vision loss or eye problem
    symp('E15', ['vision_loss', 'vision_change', 'eye_pain', 'eye_injury', 'chemical_eye']);

    // E16 Mental-health emergency (private)
    symp('E16', ['self_harm'], 'Cannot stay safe (private)');

    // E17 Radiation event
    if (v.spe === true) meas('E17', 'spe', 'yes', 'Solar particle event warning');
    if (W(ctx, 'e17.rate', v.rad != null && v.rad >= th('rad.l3'), 2 * MIN, ['rad'])) meas('E17', 'rad', v.rad, 'Dose rate at or above ' + th('rad.l3') + ' mSv/h for 2 minutes');
    const dose24 = S.radLog.filter((x) => ctx.t - x.t <= DAY).reduce((a, x) => a + x.rate * STEP / HOUR, 0);
    if (dose24 >= th('rad.l3.day')) meas('E17', 'rad', r1(dose24), th('rad.l3.day') + ' mSv or more in the last 24 hours');
    return out;
  }

  /* ---------------- non-emergency rules (section 8) ---------------- */
  function evalRules(ctx) {
    const F = [];
    const v = ctx.v, rm = ctx.rm, has = (c) => ctx.sym.has(c);
    const fire = (o) => F.push(Object.assign({ level: 1, recheck: 10 * MIN }, o));
    const hr = v.hr, rr = v.rr, act = v.act;

    // context hold: exertion without Exercise Mode (6.3, agreed "no answer" behaviour)
    if (rm === 'regular' && W(ctx, 'ctx.exertion', act != null && act >= 2 && hr != null && hr >= th('hr.context.pctmax') / 100 * ctx.hrmax, 3 * MIN, ['act', 'hr'])) {
      if (!S.ctxHold) { S.ctxHold = { from: ctx.t, until: ctx.t + th('hr.context.hold.minutes') * MIN }; S.db.eventLog.push({ id: uid('l'), t: ctx.t, type: 'note', text: 'Exertion without Exercise Mode: heart-rate Level 1–2 held 10 minutes, readings marked "unconfirmed context"' }); }
    }
    if (act != null && act < 2) S.ctxHold = null;
    const held = S.ctxHold && ctx.t < S.ctxHold.until;

    /* 8.1 heart rate */
    if (rm === 'sleep') {
      if ((v.pause || 0) > th('ecg.pause.l1') && (v.pause || 0) <= th('ecg.pause.l3')) fire({ id: 'hr.sleep.pause', pattern: 'P1', sign: 'ecg_irregular', signal: 'pause', value: v.pause, desc: 'ECG pause over ' + th('ecg.pause.l1') + ' seconds during sleep (logged for the morning)' });
      if (W(ctx, 'r.sleep.low', hr != null && hr < th('hr.sleep.l1.low') && hr >= th('hr.sleep.l3.low'), 2 * MIN, ['hr']) && S.controls.responsive) fire({ id: 'hr.sleep.low', pattern: 'P1', sign: 'hr_band', signal: 'hr', value: hr, desc: 'Below ' + th('hr.sleep.l1.low') + ' for 2 minutes, "Are you OK?" answered' });
      if (W(ctx, 'r.sleep.hr100', hr != null && hr > th('hr.sleep.l2.above') && act === 0, th('hr.sleep.l2.minutes') * MIN, ['hr', 'act'])) fire({ id: 'hr.sleep.l2', level: 2, pattern: 'P1', sign: 'hr_band', signal: 'hr', value: hr, desc: 'Above ' + th('hr.sleep.l2.above') + ' for ' + th('hr.sleep.l2.minutes') + ' minute with no movement during sleep' });
      const sl = S.samples.filter((s) => s.mode === 'sleep' && s.hr != null);
      if (sl.length && ctx.t - sl[0].t >= 60 * MIN && hr != null) {
        const first = sl.filter((s) => s.t - sl[0].t < 60 * MIN); const avg = first.reduce((a, s) => a + s.hr, 0) / first.length;
        if (hr >= avg * (1 + th('hr.sleep.climb.pct') / 100)) fire({ id: 'hr.sleep.climb', level: 2, pattern: 'P1', sign: 'hr_band', signal: 'hr', value: hr, desc: 'Heart rate climbed ' + th('hr.sleep.climb.pct') + '% or more over the night' });
      }
    } else if (rm === 'regular') {
      if (ctx.postEx != null) {
        if (ctx.postEx >= 30 - 0.01 && hr != null && hr > ctx.RB.hr * (1 + th('hr.postex.l1.pct') / 100)) fire({ id: 'hr.postex', pattern: 'P1', sign: 'hr_band', signal: 'hr', value: hr, desc: 'Still over ' + th('hr.postex.l1.pct') + '% above your resting baseline 30 minutes after exercise' });
      } else if (!held) {
        if (hr != null && hr > th('hr.regular.l1.above')) fire({ id: 'hr.reg.l1', pattern: 'P1', sign: 'hr_band', signal: 'hr', value: hr, escalate: true, desc: 'Above ' + th('hr.regular.l1.above') + (ctx.rest ? ' at rest' : ''), prompt: 'Rest and stay still. The app checks again in 10 minutes.' });
        if (W(ctx, 'r.reg.rb10', hr != null && ctx.rest && hr >= 50 && hr <= 100 && hr > ctx.RB.hr * (1 + th('hr.personal.pct') / 100), 10 * MIN, ['hr', 'act'])) fire({ id: 'hr.reg.rb', pattern: 'P1', sign: 'hr_band', signal: 'hr', value: hr, desc: 'More than ' + th('hr.personal.pct') + '% above your resting baseline for 10 minutes', prompt: 'Rest and stay still. The app keeps watching.' });
        const drop = hr != null && ctx.rest && hr <= ctx.RB.hr * (1 - th('hr.drop.pct') / 100);
        if (W(ctx, 'r.reg.drop', drop, 10 * MIN, ['hr', 'act'])) fire({ id: 'hr.reg.drop', pattern: 'P1', sign: 'hr_band', signal: 'hr', value: hr, desc: 'Clear unexplained drop: ' + th('hr.drop.pct') + '% or more below your resting baseline for 10 minutes', prompt: 'Tell the app if you feel dizzy, weak or faint.' });
        if (W(ctx, 'r.reg.drop20', drop, 20 * MIN, ['hr', 'act'])) fire({ id: 'hr.reg.drop2', level: 2, pattern: 'P1', sign: 'hr_band', signal: 'hr', value: hr, desc: 'Heart-rate drop still present at the repeat 10 minutes later' });
        if (drop && (has('dizziness') || has('unusual_weakness'))) fire({ id: 'hr.reg.dropsym', level: 2, pattern: 'P1', sign: 'hr_band', signal: 'hr', value: hr, desc: 'Heart-rate drop with dizziness or weakness' });
        if (W(ctx, 'r.reg.hr120', hr != null && hr > th('hr.regular.l2.above') && ctx.rest, th('hr.regular.l2.minutes') * MIN, ['hr', 'act'])) fire({ id: 'hr.reg.l2', level: 2, pattern: 'P1', sign: 'hr_band', signal: 'hr', value: hr, desc: 'Above ' + th('hr.regular.l2.above') + ' for ' + th('hr.regular.l2.minutes') + ' minutes while resting (activity ' + act + ').' });
      }
    } else if (rm === 'exercise') {
      const ceil = zoneCeilingPct();
      if (ceil && W(ctx, 'r.ex.ceiling', hr != null && hr > ceil / 100 * ctx.hrmax, 2 * MIN, ['hr'])) fire({ id: 'hr.ex.ceiling', pattern: 'P1', sign: 'hr_band', signal: 'hr', value: hr, recheck: 2 * MIN, desc: 'Heart rate above your zone ceiling for 2 minutes.', prompt: 'Slow down a little.' });
      const lim = Math.round(th('hr.exercise.l2.pctmax') / 100 * ctx.hrmax);
      if (W(ctx, 'r.ex.95', hr != null && hr > lim, th('hr.exercise.l2.seconds') * SEC, ['hr'])) fire({ id: 'hr.ex.l2', level: 2, pattern: 'P1', sign: 'hr_band', signal: 'hr', value: hr, desc: 'Above ' + th('hr.exercise.l2.pctmax') + '% of maximum (' + lim + ' bpm at age ' + S.profile.age + ') for ' + th('hr.exercise.l2.seconds') + ' seconds.', prompt: 'Ease off. Medical has been notified (simulated).' });
    }

    /* 8.2 HRV, counters */
    if (counter('hrv_nights') >= 3) fire({ id: 'hrv.nights', level: 2, pattern: 'P10', sign: 'sleep_hrv_down', signal: 'hrv', value: counter('hrv_nights'), unit: 'nights', desc: 'Sleep HRV over 20% below baseline for 3 nights in a row', trend: true });

    /* 8.3 respiratory rate */
    if (rm === 'sleep') {
      if (W(ctx, 'r.sleep.rr10', rr != null && rr > ctx.SB.rr * (1 + th('rr.sleep.l1.pct') / 100), 10 * MIN, ['rr'])) fire({ id: 'rr.sleep.l1', pattern: 'P5', sign: 'fast_breathing', signal: 'rr', value: rr, desc: 'Breathing more than ' + th('rr.sleep.l1.pct') + '% above your sleep baseline for 10 minutes' });
      if (W(ctx, 'r.sleep.rr20', rr != null && rr > th('rr.sleep.l2.above'), 10 * MIN, ['rr'])) fire({ id: 'rr.sleep.l2', level: 2, pattern: 'P5', sign: 'fast_breathing', signal: 'rr', value: rr, desc: 'Breathing above ' + th('rr.sleep.l2.above') + ' for 10 minutes during sleep' });
      const pauses = S.samples.filter((s) => ctx.t - s.t <= HOUR && (s.apnea || 0) >= 10).length;
      if (pauses >= 3) fire({ id: 'rr.sleep.pauses', level: 2, pattern: 'P5', sign: 'fast_breathing', signal: 'apnea', value: pauses, unit: 'pauses', desc: '3 or more breathing pauses of 10 seconds or longer within 1 hour' });
    } else if (rm === 'regular') {
      if (ctx.postEx == null) {
        if (W(ctx, 'r.reg.rr20', rr != null && rr > th('rr.regular.l1.above') && ctx.rest, 10 * MIN, ['rr', 'act'])) fire({ id: 'rr.reg.l1', pattern: 'P5', sign: 'fast_breathing', signal: 'rr', value: rr, desc: 'Breathing above ' + th('rr.regular.l1.above') + ' at rest for 10 minutes', prompt: 'Rest and breathe slowly. The app keeps watching.' });
        if (W(ctx, 'r.reg.rr25', rr != null && rr > th('rr.regular.l2.above') && ctx.rest, 10 * MIN, ['rr', 'act'])) fire({ id: 'rr.reg.l2', level: 2, pattern: 'P5', sign: 'fast_breathing', signal: 'rr', value: rr, desc: 'Breathing above ' + th('rr.regular.l2.above') + ' at rest for 10 minutes' });
      } else {
        if (ctx.postEx >= 10 && rr != null && rr >= th('rr.postex.above')) fire({ id: 'rr.postex.l1', pattern: 'P5', sign: 'fast_breathing', signal: 'rr', value: rr, desc: 'Breathing not below ' + th('rr.postex.above') + ' within 10 minutes after stopping' });
        if (ctx.postEx >= 20 && rr != null && rr >= th('rr.postex.above')) fire({ id: 'rr.postex.l2', level: 2, pattern: 'P5', sign: 'fast_breathing', signal: 'rr', value: rr, desc: 'Breathing not below ' + th('rr.postex.above') + ' within 20 minutes after stopping' });
      }
    }

    /* 8.4 SpO2 (a correct fingertip value decides, 5.8) */
    const f = ctx.fresh.fspo2 ? ctx.fresh.fspo2.v : null;
    const dec = f != null ? f : v.spo2; const decSig = f != null ? 'fspo2' : 'spo2';
    if (rm === 'regular' && dec != null) {
      if (dec < th('spo2.regular.l1.below')) fire({ id: 'spo2.reg.l1', pattern: 'P5', sign: 'low_spo2', signal: decSig, value: dec, recheck: 2 * MIN, escalate: true, desc: 'SpO2 below ' + th('spo2.regular.l1.below') + '%', prompt: 'Repeat with the fingertip oximeter: warm, still fingertip, no nail polish.' });
      if (f != null && f < th('spo2.regular.l1.below')) fire({ id: 'spo2.reg.confirm', level: 2, pattern: 'P5', sign: 'low_spo2', signal: 'fspo2', value: f, desc: 'Confirmed below ' + th('spo2.regular.l1.below') + '% on the fingertip repeat' });
      if (dec < th('spo2.regular.l2.below')) fire({ id: 'spo2.reg.l2', level: 2, pattern: 'P5', sign: 'low_spo2', signal: decSig, value: dec, desc: 'SpO2 below ' + th('spo2.regular.l2.below') + '%' });
      if (W(ctx, 'r.reg.spo90', dec < th('spo2.regular.urgent.below') && ctx.sym.size === 0, 2 * MIN, decSig === 'spo2' ? ['spo2'] : [])) fire({ id: 'spo2.reg.urgent', level: 2, pattern: 'P5', sign: 'low_spo2', signal: decSig, value: dec, desc: 'Below ' + th('spo2.regular.urgent.below') + '% for 2 minutes with no symptoms: urgent, recheck every 5 minutes and check the cabin' });
    } else if (rm === 'sleep' && v.spo2 != null) {
      if (S.sleepLow > th('spo2.sleep.l2.total') * MIN) fire({ id: 'spo2.sleep.l2', level: 2, pattern: 'P5', sign: 'low_spo2', signal: 'spo2', value: v.spo2, desc: 'Below ' + th('spo2.sleep.l2.below') + '% for more than ' + th('spo2.sleep.l2.total') + ' minutes in total tonight. Check cabin CO2.' });
    } else if (rm === 'exercise' && v.spo2 != null) {
      if (W(ctx, 'r.ex.spo92', v.spo2 < th('spo2.exercise.l1.below'), 30 * SEC, ['spo2'])) fire({ id: 'spo2.ex.l1', pattern: 'P5', sign: 'low_spo2', signal: 'spo2', value: v.spo2, recheck: 30 * SEC, desc: 'SpO2 below ' + th('spo2.exercise.l1.below') + '% for 30 seconds.', prompt: 'Slow down and breathe.' });
      if (W(ctx, 'r.ex.spo90', v.spo2 < th('spo2.exercise.l2.below'), 30 * SEC, ['spo2'])) fire({ id: 'spo2.ex.l2', level: 2, pattern: 'P5', sign: 'low_spo2', signal: 'spo2', value: v.spo2, desc: 'SpO2 below ' + th('spo2.exercise.l2.below') + '% for 30 seconds.', prompt: 'Stop the session.' });
    }
    if (counter('spo2_nights') >= 2) fire({ id: 'spo2.nights', level: 2, pattern: 'P1', sign: 'spo2_low_trend', signal: 'spo2', value: counter('spo2_nights'), unit: 'nights', desc: 'SpO2 below 93% for over 5 minutes on 2 or more of the last 7 nights. Check cabin CO2.', trend: true });

    /* 8.5 skin temperature */
    if (rm === 'exercise' && v.skin != null) {
      const old = S.samples.filter((s) => ctx.t - s.t <= 10 * MIN && s.skin != null);
      const mn = old.length ? Math.min.apply(null, old.map((s) => s.skin)) : v.skin;
      if (v.skin - mn >= th('skin.exercise.rise')) fire({ id: 'skin.ex', pattern: 'P9', sign: 'skin_temp_off', signal: 'skin', value: v.skin, recheck: 2 * MIN, desc: 'Skin temperature rose ' + r1(v.skin - mn) + ' °C within 10 minutes.', prompt: 'Cool down and drink.' });
    }
    if (rm === 'sleep' && v.skin != null && hr != null && rr != null && v.skin >= ctx.SB.skin + th('skin.sleep.rise') && hr > ctx.SB.hr * 1.1 && rr > ctx.SB.rr * 1.1) fire({ id: 'skin.sleep', pattern: 'P6', sign: 'sleep_drift', signal: 'skin', value: v.skin, desc: 'Skin temperature, heart rate and breathing all above your sleep baseline (morning review)' });

    /* 8.7 counters typed or computed */
    if (counter('rhr_days') >= 3) { fire({ id: 'hr.days', level: 2, pattern: 'P1', sign: 'hr_band', signal: 'hr', value: counter('rhr_days'), unit: 'days', desc: 'Resting heart rate over 10% above baseline for 3 or more days in a row', trend: true }); fire({ id: 'hr.days.p2', pattern: 'P2', sign: 'rhr_up_3days', signal: 'hr', value: counter('rhr_days'), unit: 'days', desc: 'Resting heart rate up 3 days', trend: true }); }
    if (counter('sleep_hr_nights') >= 3) fire({ id: 'hr.nights', level: 2, pattern: 'P1', sign: 'hr_band', signal: 'hr', value: counter('sleep_hr_nights'), unit: 'nights', desc: 'Sleep heart rate over 10% above baseline for 3 nights in a row', trend: true });
    if (counter('poor_nights', S.trend.poorNights) >= 3) fire({ id: 'sleep.poor', level: 2, pattern: 'P10', sign: 'poor_nights', signal: 'sleeph', value: counter('poor_nights', S.trend.poorNights), unit: 'nights', desc: '3 poor nights in a row', trend: true });
    const fd = counter('fluid_days', S.trend.fluidLowDays);
    if (fd >= 2) fire({ id: 'fluid.days', level: 2, pattern: 'P4', sign: 'low_fluid', signal: 'fluid', value: fd, unit: 'days', desc: 'Fluid intake under ' + th('fluid.l1.pct') + '% of the plan for 2 days in a row', trend: true });
    else if (fd === 1 && S.counters.fluid_days !== undefined && S.counters.fluid_days !== '') fire({ id: 'fluid.day', pattern: 'P4', sign: 'low_fluid', signal: 'fluid', value: fd, unit: 'day', desc: 'Fluid intake under ' + th('fluid.l1.pct') + '% of the plan at the end of the day', trend: true });
    if (counter('mood_checkins', S.trend.moodHigh) >= 3) fire({ id: 'mood.checkins', level: 2, pattern: 'P10', sign: 'high_stress', signal: 'mood', value: counter('mood_checkins', S.trend.moodHigh), unit: 'check-ins', desc: 'Mood or stress 7 or more at 3 check-ins in a row', trend: true });
    const mc = S.counters.mass_change_pct;
    if (mc !== undefined && mc !== '' && mc !== null && Number(mc) <= -th('mass.l1.pct')) fire({ id: 'mass.counter', level: Number(mc) <= -th('mass.l2.pct') ? 2 : 1, pattern: 'P12', sign: 'mass_loss', signal: 'mass', value: Number(mc), unit: '%', astronautOnly: true, desc: 'Body mass change ' + mc + '% over about 2 weeks', trend: true });
    const ms = counter('missed_sessions');
    if (ms >= 1) fire({ id: 'ex.missed', level: ms >= 3 ? 2 : 1, pattern: 'P2', sign: 'missed_sessions', signal: 'act', value: ms, unit: 'sessions', desc: ms >= 3 ? '3 missed prescribed sessions this week' : 'Missed a prescribed session this week', trend: true });

    /* 8.8 cabin and radiation (same limits in every mode) */
    const cab = (id, lvl, cond, ms, sig, desc) => { if (W(ctx, 'r.' + id, cond, ms, [sig])) fire({ id, level: lvl, pattern: 'P5', sign: 'cabin', signal: sig, value: v[sig], desc, recheck: 10 * MIN, prompt: 'Check the cabin readings on a second sensor.' }); };
    cab('co2.l1', 1, v.co2 != null && v.co2 > th('co2.l1'), 60 * MIN, 'co2', 'Cabin CO2 above ' + th('co2.l1') + ' mmHg for 60 minutes');
    cab('co2.l2', 2, v.co2 != null && v.co2 >= th('co2.l2'), 60 * MIN, 'co2', 'Cabin CO2 at or above ' + th('co2.l2') + ' mmHg for 60 minutes');
    cab('co2.l2b', 2, v.co2 != null && v.co2 >= th('co2.l2b'), 15 * MIN, 'co2', 'Cabin CO2 at or above ' + th('co2.l2b') + ' mmHg for 15 minutes');
    cab('o2.l1', 1, v.o2 != null && (v.o2 < th('o2.l1.low') || v.o2 > th('o2.l1.high')), 5 * MIN, 'o2', 'Cabin oxygen outside ' + th('o2.l1.low') + '–' + th('o2.l1.high') + '% for 5 minutes');
    cab('o2.l2', 2, v.o2 != null && (v.o2 < th('o2.l2.low') || v.o2 > th('o2.l2.high')), 5 * MIN, 'o2', 'Cabin oxygen outside ' + th('o2.l2.low') + '–' + th('o2.l2.high') + '% for 5 minutes');
    cab('press.l1', 1, v.press != null && (v.press < th('press.l1.low') || v.press > th('press.l1.high')), 5 * MIN, 'press', 'Cabin pressure outside ' + th('press.l1.low') + '–' + th('press.l1.high') + ' kPa for 5 minutes');
    cab('press.l2', 2, v.press != null && v.press < th('press.l2.low'), 5 * MIN, 'press', 'Cabin pressure below ' + th('press.l2.low') + ' kPa for 5 minutes');
    cab('cont.l1', 1, v.cont != null && v.cont >= th('cont.l1'), 10 * MIN, 'cont', 'Contaminant ratio ' + th('cont.l1') + ' or more for 10 minutes');
    cab('cont.l2', 2, v.cont != null && v.cont >= th('cont.l2'), 10 * MIN, 'cont', 'Contaminant ratio ' + th('cont.l2') + ' or more for 10 minutes');
    if (W(ctx, 'r.rad.l1', v.rad != null && v.rad >= th('rad.l1'), 60 * MIN, ['rad'])) fire({ id: 'rad.l1', pattern: 'P11', sign: 'radiation', signal: 'rad', value: v.rad, recheck: 10 * MIN, desc: 'Dose rate at or above ' + Math.round(th('rad.l1') * 1000) + ' µSv/h for 60 minutes' });
    if (W(ctx, 'r.rad.l2', v.rad != null && v.rad >= th('rad.l2'), 15 * MIN, ['rad'])) fire({ id: 'rad.l2', level: 2, pattern: 'P11', sign: 'radiation', signal: 'rad', value: v.rad, desc: 'Dose rate at or above ' + th('rad.l2') + ' mSv/h for 15 minutes' });
    if (v.dose != null) {
      const pct = (S.profile.careerDose + v.dose) / th('career.limit') * 100;
      if (pct >= th('career.l2.pct')) fire({ id: 'rad.career2', level: 2, pattern: 'P11', sign: 'radiation', signal: 'dose', value: Math.round(pct), unit: '% of career limit', desc: pct >= 100 ? 'Career limit reached' : pct >= th('career.urgent.pct') ? 'Career dose at or above ' + th('career.urgent.pct') + '% of the limit: urgent notice' : 'Career dose at or above ' + th('career.l2.pct') + '% of the limit', trend: true });
      else if (pct >= th('career.l1.pct')) fire({ id: 'rad.career1', pattern: 'P11', sign: 'radiation', signal: 'dose', value: Math.round(pct), unit: '% of career limit', desc: 'Career dose at or above ' + th('career.l1.pct') + '% of the limit', trend: true });
    }

    /* 5.5 missing data */
    [['chest', CHEST], ['wrist', WRIST]].forEach(([dev, sigs]) => {
      const missing = sigs.some((s) => ctx.val[s] === 'unavailable');
      if (missing) {
        if (S.sensorSince[dev] == null) S.sensorSince[dev] = ctx.t;
        const d = ctx.t - S.sensorSince[dev];
        const name = dev === 'chest' ? 'Chest patch' : 'Wrist device';
        if (d > th('sensor.l2.minutes') * MIN) fire({ id: 'sensor.' + dev + '.l2', level: 2, pattern: 'SENSOR', sign: dev, signal: 'sensor', value: 'No data', unit: '', desc: name + ': no data for more than ' + th('sensor.l2.minutes') + ' minutes. Medical notified (simulated).' });
        else if (d > th('sensor.l1.minutes') * MIN) fire({ id: 'sensor.' + dev + '.l1', pattern: 'SENSOR', sign: dev, signal: 'sensor', value: 'No data', unit: '', recheck: 8 * MIN, desc: name + ': no data for more than ' + th('sensor.l1.minutes') + ' minutes.', prompt: 'Check the sensor.' });
      } else delete S.sensorSince[dev];
    });

    /* manual values kept as signs until a normal repeat clears them */
    Object.values(S.manualSigns).forEach((m) => fire(Object.assign({}, m, { manual: true })));

    /* symptoms as pattern signs (12.1) */
    Object.keys(S.symptoms).forEach((c) => {
      (C.SYMPTOM_SIGNS[c] || []).forEach(([p, sign]) => fire({ id: 'sym.' + c + '.' + p, pattern: p, sign, symptom: c, signal: null, value: null, desc: 'Reported: ' + (C.SYMPTOM_NAMES[c] || c), trend: true }));
    });
    // extra mapping: near-fainting alone = Level 2 (dizziness treated as near-fainting); one E2 minor sign alone = Level 2
    if ((has('near_fainting') || has('dizziness')) && !has('fainting')) fire({ id: 'sym.nearfaint', level: 2, pattern: 'P1', sign: 'dizziness', desc: 'Near-fainting: measure heart rate and blood pressure again', trend: true });
    const e2m = ['cold_sweat', 'nausea', 'breathlessness', 'unusual_weakness'].filter(has);
    if (e2m.length === 1) fire({ id: 'sym.e2one', level: 2, pattern: 'P1', sign: 'hr_band', desc: 'Reported: ' + C.SYMPTOM_NAMES[e2m[0]] + '. Measure again and answer more questions.', trend: true });
    if (has('hives') && !has('throat_swelling')) fire({ id: 'sym.hives', level: 2, pattern: 'P6', sign: 'rash', desc: 'Widespread hives: answer more questions', trend: true });
    if (has('medication')) fire({ id: 'sym.med', level: 2, pattern: 'P7', sign: 'medication', desc: 'Medicine problem reported', trend: true });
    if (held) F.forEach((x) => { if (x.signal === 'hr') x.unconfirmed = true; });
    return F;
  }

  /* ---------------- events (section 14) ---------------- */
  function openEvents() { return S.events.filter((e) => e.state !== 'closed'); }
  function openEmergencyEvents() { return S.events.filter((e) => e.kind === 'emergency' && e.state === 'emergency'); }
  function categoryFor(code, signal) { return (signal && C.CATEGORY_BY_SIGNAL[signal]) || C.CATEGORY_BY_CODE[code] || 'your health'; }

  function setLevel(ev, level, state, why) {
    const changed = ev.level !== level || ev.state !== state;
    ev.level = level; ev.state = state;
    if (changed) {
      ev.levels.push({ t: S.clock.t, level, state, why });
      elog(ev, 'state', { level, state, why });
      if (S.run.active && state !== 'closed' && state !== 'monitoring') S.run.log.push({ t: S.clock.t, ev: ev.id, level });
    }
    return changed;
  }

  function newEvent(code, kind, info) {
    const ev = {
      id: uid('ev'), code, kind, level: 0, state: 'watch', about: categoryFor(code, info.signal),
      modeAtOnset: S.mode.mode === 'emergency' ? (S.mode.onsetMode || 'regular') : S.mode.mode, started: S.clock.t,
      trigger: { signal: info.signal || null, value: info.value, unit: info.unit != null ? info.unit : (UNITS[info.signal] || ''), desc: info.desc || '', device: info.signal ? (DEVICE_OF[info.signal] || '') : '' },
      first: { t: S.clock.t, value: info.value, signal: info.signal }, repeats: [], levels: [],
      private: code === 'E16' || code === 'P10', run: S.run.active, signs: [], stepsDone: {}, reminders: [], notified: false,
      astronautOnly: !!info.astronautOnly, closedAt: null, closedBy: null, closeReason: null, mergedInto: null, okCount: 0, nextCheck: null, recheckAt: null
    };
    S.events.push(ev);
    elog(ev, 'opened', { code, kind, trigger: ev.trigger });
    return ev;
  }

  function closeEvent(ev, reason, by) {
    if (ev.state === 'closed') return;
    ev.closedAt = S.clock.t; ev.closedBy = by || 'software'; ev.closeReason = reason;
    setLevel(ev, ev.level, 'closed', reason);
    elog(ev, 'closed', { reason, by: ev.closedBy });
  }

  /* ---- reminders from events (15.4) ---- */
  function addReminder(o) {
    const r = Object.assign({ id: uid('r'), done: {}, snooze: {}, deleted: false, important: false, created: S.clock.t }, o);
    S.reminders.push(r); return r;
  }
  function conditionReminders(ev) {
    const t = S.clock.t; const list = [];
    const every4 = (text, label) => list.push(addReminder({ type: 'condition', event: ev.id, text, label, sched: { kind: 'interval', first: t + 4 * HOUR, every: 4 * HOUR, until: t + 24 * HOUR } }));
    const feel = (label) => list.push(addReminder({ type: 'condition', event: ev.id, text: 'How do you feel now?', label: label || 'How do you feel now? · in 60 min', sched: { kind: 'interval', first: t + 60 * MIN, every: 3 * HOUR, until: t + 4 * HOUR } }));
    const nextMorning = (text) => { const d = dayOf(t) + 1; list.push(addReminder({ type: 'condition', event: ev.id, text, label: text + ' · next morning', sched: { kind: 'interval', first: d * DAY + 6.5 * HOUR, every: null, until: null } })); };
    switch (ev.code) {
      case 'P1': case 'E1': case 'E2': case 'E3': case 'E4': case 'E5': case 'E11':
        every4('Measure your heart rate and blood pressure · every 4 h until the alert closes', 'Measure heart rate and blood pressure · every 4 h for 24 h'); feel(); break;
      case 'P6': case 'P9': case 'E9': case 'E13':
        every4('Take your temperature · every 4 h until the alert closes', 'Take your temperature · every 4 h for 24 h'); feel(); break;
      case 'P3': case 'E15': nextMorning('Do the eye test'); feel(); break;
      case 'P4': case 'E14': list.push(addReminder({ type: 'condition', event: ev.id, text: 'Drink one small cup (250 mL) and write it down', label: 'Drink one small cup and write it down · every 30 min', sched: { kind: 'interval', first: t + 30 * MIN, every: 30 * MIN, until: t + 4 * HOUR } })); feel(); break;
      case 'P5': case 'E6': case 'E7': case 'E10': list.push(addReminder({ type: 'condition', event: ev.id, text: 'Check the cabin readings and your SpO2', label: 'Check the cabin readings and your SpO2 · every 30 min', sched: { kind: 'interval', first: t + 30 * MIN, every: 30 * MIN, until: t + 4 * HOUR } })); feel(); break;
      case 'P10': case 'E16': list.push(addReminder({ type: 'condition', event: ev.id, text: 'How is your mood today? (private)', label: 'Private check-in · daily for 7 days', sched: { kind: 'interval', first: t + DAY, every: DAY, until: t + 7 * DAY } })); break;
      case 'P11': case 'E17': list.push(addReminder({ type: 'condition', event: ev.id, text: 'Look at your radiation dose and how you feel', label: 'Radiation and symptom check · daily for 7 days', sched: { kind: 'interval', first: t + DAY, every: DAY, until: t + 7 * DAY } })); break;
      case 'E18': list.push(addReminder({ type: 'condition', event: ev.id, text: 'How do you feel now?', label: 'How do you feel now? · every 4 h for 24 h', sched: { kind: 'interval', first: t + 4 * HOUR, every: 4 * HOUR, until: t + 24 * HOUR } })); break;
      default: feel('How do you feel now? · in 60 min and 4 h');
    }
    list.forEach((r) => { r.important = ['P1', 'P5', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E10'].includes(ev.code); });
    ev.reminders = ev.reminders.concat(list.map((r) => r.id));
    return list;
  }

  /* ---- pattern grouping (12.1) ---- */
  function groupPatterns(ctx, fired) {
    const by = {};
    fired.forEach((f) => { (by[f.pattern] = by[f.pattern] || []).push(f); });
    const emergencyOpen = openEmergencyEvents().length > 0;
    Object.keys(by).forEach((p) => {
      const list = by[p];
      const signs = Array.from(new Set(list.map((f) => f.sign)));
      const def = C.PATTERNS[p];
      let level = Math.max.apply(null, list.map((f) => f.level));
      if (def && def.signs.length >= 3 && signs.length > def.signs.length / 2) level = 2;
      if (level < 1) level = 1;
      const top = list.slice().sort((a, b) => (b.level - a.level) || ((b.signal ? 1 : 0) - (a.signal ? 1 : 0)))[0];
      let ev = S.events.find((e) => e.code === p && e.state !== 'closed');
      const kind = p === 'SENSOR' ? 'sensor' : 'pattern';
      if (!ev) {
        ev = newEvent(p, kind, { signal: top.signal, value: top.value, unit: top.unit, desc: top.desc, astronautOnly: list.every((f) => f.astronautOnly) });
        ev.signs = signs;
        if (level === 1) { setLevel(ev, 1, 'watch', top.desc); ev.recheckAt = ctx.t + (top.recheck || 10 * MIN); elog(ev, 'recheck', { due: ev.recheckAt }); }
        announceLevel1(ev, top, ctx);
      } else {
        ev.signs = Array.from(new Set(ev.signs.concat(signs)));
        if (ev.state === 'monitoring' && level >= 1 && list.some((f) => !f.trend)) { /* ongoing pattern in monitoring: new sign re-opens it */ }
      }
      ev.astronautOnly = ev.astronautOnly && list.every((f) => f.astronautOnly);
      ev.lastSeen = ctx.t; ev.presentNow = true;
      if (top.unconfirmed) ev.unconfirmed = true;
      if (level === 2 && (ev.level < 2 || ev.state === 'monitoring' || ev.state === 'watch')) escalateToAct(ev, top, ctx, emergencyOpen);
      else if (ev.level === 2 && top.level === 2 && top.signal && ev.trigger.signal === top.signal) { ev.trigger.value = top.value; }
    });
  }

  function announceLevel1(ev, top, ctx) {
    if (ev.level !== 1) return;
    const text = (top.desc || '') + (top.prompt ? ' "' + top.prompt + '"' : '');
    if (ctx.rm === 'exercise') S.exAlerts.unshift({ t: ctx.t, level: 1, text, event: ev.id });
    if (ctx.rm !== 'sleep' && openEmergencyEvents().length === 0) toast('We noticed something · ' + ev.about + '. ' + (top.prompt || 'The app checks again soon.'), 'watch');
  }

  function escalateToAct(ev, top, ctx, emergencyOpen) {
    ev.trigger = { signal: top.signal || ev.trigger.signal, value: top.value, unit: top.unit != null ? top.unit : (UNITS[top.signal] || ''), desc: top.desc, device: top.signal ? (DEVICE_OF[top.signal] || '') : '' };
    if (top.signal) ev.about = categoryFor(ev.code, top.signal);
    if (ev.code === 'P10') ev.about = 'sleep and mood';
    const wasMonitoring = ev.state === 'monitoring';
    setLevel(ev, 2, 'act', top.desc);
    ev.okCount = 0; ev.nextCheck = ctx.t + 15 * MIN; ev.actSince = ctx.t; ev.recheckAt = null;
    if (!wasMonitoring && !ev.reminders.length) ev.addedReminders = conditionReminders(ev).map((r) => r.label);
    if (!ev.astronautOnly && !ev.notified) {
      ev.notified = true;
      message('medical', ev, { summary: 'Level 2 · ' + ev.about, trigger: ev.trigger, record: 'full record attached' }, ev.private);
      if (ev.code === 'P5' || ev.code === 'P11') message('environment', ev, { summary: 'Alert all crew and the environmental operator', trigger: ev.trigger });
      elog(ev, 'note', { text: 'Medical has been notified (simulated)' });
    }
    const mode = ctx.rm;
    if (mode === 'exercise') S.exAlerts.unshift({ t: ctx.t, level: 2, text: (top.desc || '') + (top.prompt ? ' "' + top.prompt + '"' : ''), event: ev.id });
    if (!emergencyOpen) emit(mode === 'sleep' ? 'logged' : mode === 'exercise' ? 'exalert' : 'alert', ev);
  }

  /* ---- rechecks and closing (9, 14.4) ---- */
  function rechecks(ctx, fired) {
    const present = {};
    fired.forEach((f) => { present[f.pattern] = present[f.pattern] || []; present[f.pattern].push(f); });
    openEvents().forEach((ev) => {
      if (ev.kind === 'emergency') return;
      const now = present[ev.code] || [];
      if (ev.state === 'watch') {
        if (ev.recheckAt != null && ctx.t >= ev.recheckAt) {
          const pend = Object.values(S.pending).some((p) => p.event === ev.id);
          if (pend) return;   // manual repeat decides
          if (now.length && now.some((f) => !f.trend)) {
            const top = now.slice().sort((a, b) => b.level - a.level)[0];
            elog(ev, 'recheck', { result: 'still abnormal' });
            escalateToAct(ev, Object.assign({}, top, { desc: top.desc + ' Still abnormal at the recheck.' }), ctx, openEmergencyEvents().length > 0);
          } else if (now.length) {
            ev.recheckAt = ctx.t + DAY;  // trend signs: next day
          } else {
            elog(ev, 'recheck', { result: 'normal' });
            closeEvent(ev, 'transient: normal at the recheck', 'software');
          }
        }
      } else if (ev.state === 'act') {
        if (ev.nextCheck != null && ctx.t >= ev.nextCheck) {
          const abnormal = now.length > 0;
          ev.okCount = abnormal ? 0 : ev.okCount + 1;
          elog(ev, 'recheck', { result: abnormal ? 'still abnormal' : 'in range', okCount: ev.okCount });
          const age = ctx.t - (ev.actSince || ev.started);
          const interval = age < HOUR ? 15 * MIN : age < 4 * HOUR ? HOUR : 4 * HOUR;
          ev.nextCheck = ctx.t + interval;
          if (ev.okCount >= 3) {
            const def = C.PATTERNS[ev.code];
            makeHandover(ev);
            if (def && def.duration === 'ongoing') { setLevel(ev, 2, 'monitoring', '3 checks in a row in range'); }
            else closeEvent(ev, '3 checks in a row in range', 'software');
          }
        }
      }
    });
  }

  function makeHandover(ev) {
    ev.handover = {
      astronaut: S.id, modeAtOnset: ev.modeAtOnset, about: ev.about,
      first: ev.first, trigger: ev.trigger, symptoms: Object.keys(S.symptoms).map((c) => C.SYMPTOM_NAMES[c] || c),
      levels: ev.levels.map((l) => fmtDay(l.t) + ' · Level ' + l.level + ' · ' + l.state),
      done: Object.keys(ev.stepsDone), next: 'Follow-up checks as scheduled; medical review (simulated).'
    };
    elog(ev, 'handover', { summary: ev.handover });
  }

  /* ---------------- emergency engine (section 11) ---------------- */
  function openEmergency(code, info, opts) {
    opts = opts || {};
    if (code === 'E18' && openEmergencyEvents().some((e) => e.code !== 'E18')) return null;
    let ev = S.events.find((e) => e.code === code && e.kind === 'emergency' && e.state !== 'closed');
    if (ev && ev.state === 'emergency') {
      if (info && info.desc && ev.trigger.desc !== info.desc && !ev.extraTriggers.includes(info.desc)) { ev.extraTriggers.push(info.desc); elog(ev, 'note', { text: 'Also: ' + info.desc }); }
      return ev;
    }
    const firstOfEpisode = !S.episode;
    if (ev && ev.state === 'monitoring') {
      elog(ev, 'reopened', { why: info.desc });
      ev.closedAt = null; ev.closedBy = null; ev.closeReason = null;
      setLevel(ev, 3, 'emergency', 'Opened again: ' + info.desc);
    } else {
      ev = newEvent(code, 'emergency', info);
      ev.extraTriggers = [];
      ev.responder = (code === 'E9' ? C.EMERGENCIES.E9.responder : C.EMERGENCIES[code].responder).slice();
      setLevel(ev, 3, 'emergency', info.desc);
    }
    if (code === 'E9') ev.variant = heatOrCold(info);
    // merge E18 into a named emergency (11.1 step 5)
    if (code !== 'E18') {
      const e18 = S.events.find((e) => e.code === 'E18' && e.state === 'emergency');
      if (e18) {
        e18.mergedInto = ev.id; elog(e18, 'merged_into', { into: ev.id, code });
        closeEvent(e18, 'merged into the named emergency', 'software');
        message('ground', ev, { text: 'New instructions for ' + S.id });
      }
    }
    if (firstOfEpisode) declareEpisode(ev, opts);
    else {
      ev.modeAtOnset = S.episode.modeAtOnset;
      elog(ev, 'note', { text: 'Crew already alerted for this emergency episode' });
      message('ground', ev, { text: 'New instructions for ' + S.id + ' (crew devices)' });
    }
    if (code === 'E16') message('medical', ev, { text: 'Private channel to medical opened (simulated)' }, true);
    if (code === 'E17') message('radiation', ev, { text: 'Radiation event: medical and radiation specialists told' });
    if (inRun && stopFlag === null) stopFlag = ev.id;
    emit('emergency', ev);
    return ev;
  }

  function heatOrCold(info) {
    const core = S.man.core ? S.man.core.v : null;
    if (core != null && core < th('core.l3.below')) return 'cold';
    if (core != null && core >= th('core.l3.above')) return 'hot';
    if (S.symptoms.cold_exposure || S.symptoms.feels_cold) return 'cold';
    return 'hot';
  }

  function declareEpisode(ev, opts) {
    const mode = S.mode.mode;
    const onset = mode === 'emergency' ? (S.mode.onsetMode || 'regular') : mode;
    ev.modeAtOnset = onset;
    if (mode !== 'emergency') setMode('emergency', 'software', 'Level 3 event: ' + ev.code, { onsetMode: onset });
    const real = nowReal();
    S.episode = {
      id: uid('ep'), startReal: real, startSim: S.clock.t, modeAtOnset: onset, calls: [], responded: false, respondedReal: null,
      arrived: false, againUsed: false, againNote: null, okAsk: null, lastTouchReal: real, aDeclaredNoted: false, done: {}, shownDone: {}, closing: false
    };
    crewCall(opts.via === 'sos_button' || opts.via === 'strong_tap' || opts.via === 'voice_command' ? opts.via : 'auto_alert', ev, opts.phrase);
    message('ground', ev, { text: 'Queued: emergency for ' + S.id + ' · continuous transmission of vitals and ECG (simulated)', status: 'queued' });
    message('medical', ev, { text: 'Queued: emergency for ' + S.id, status: 'queued' }, ev.private);
    askOk(ev);
  }

  function crewCall(type, ev, phrase, recordedOnly) {
    const call = { id: uid('call'), type, event: ev ? ev.id : null, t: S.clock.t, real: nowReal(), recordedOnly: !!recordedOnly, phrase: phrase || null, private: ev ? ev.private : false,
      text: ev && ev.code === 'E18' ? 'SOS from ' + S.id + ', cause not known' : 'Emergency for ' + S.id, module: 'Node 2', vitals: snapshot() };
    S.db.calls.push(call);
    if (!recordedOnly && S.episode) S.episode.calls.push(call);
    return call;
  }
  function snapshot() { const x = {}; ['hr', 'spo2', 'rr', 'skin'].forEach((k) => { x[k] = S.cur[k]; }); return x; }

  function askOk(ev) {
    const ep = S.episode; if (!ep) return;
    ep.okAsk = { askedReal: nowReal(), deadline: nowReal() + th('ok.timer.seconds') * SEC, answered: false };
    if (!S.controls.responsive) {
      S.db.checks.push({ t: S.clock.t, event: ev ? ev.id : null, answered: false, note: 'simulator: astronaut responsive = no' });
      ep.okAsk = null;
      openEmergency('E1', { desc: 'No answer to "Are you OK?" (astronaut responsive = no)' });
    }
  }

  function episodeTimers(real) {
    const ep = S.episode; if (!ep) return;
    const ems = openEmergencyEvents(); if (!ems.length) return;
    if (ep.okAsk && !ep.okAsk.answered && real >= ep.okAsk.deadline) {
      S.db.checks.push({ t: S.clock.t, event: ems[0].id, answered: false, note: 'no answer in ' + th('ok.timer.seconds') + ' seconds' });
      ep.okAsk = null;
      openEmergency('E1', { desc: 'No answer to "Are you OK?" within ' + th('ok.timer.seconds') + ' seconds' });
      emit('change');
    }
    if (!ep.okAsk && real - ep.lastTouchReal >= th('ok.reask.minutes') * MIN) { ep.lastTouchReal = real; askOk(ems[0]); emit('change'); }
    const call = ep.calls[ep.calls.length - 1];
    if (call && !ep.responded && !ep.arrived && S.controls.crewResponds && real >= call.real + S.controls.crewAfter * SEC) {
      ep.responded = true; ep.respondedReal = real;
      const secs = r1((real - call.real) / SEC);
      S.db.responses.push({ call: call.id, response: 'on_my_way', responder: 'Crew mate (simulated)', seconds: secs, t: S.clock.t });
      ems.forEach((e) => elog(e, 'note', { text: 'Crew answered "On my way" after ' + secs + ' s' }));
      emit('change');
    }
    if (call && !ep.responded && !ep.arrived && real - call.real >= th('crew.timer.seconds') * SEC && !ep.aDeclaredNoted) {
      ep.aDeclaredNoted = true;
      message('ground', ems[0], { text: 'Nobody answered in ' + th('crew.timer.seconds') + ' s: Display A on (astronaut on their own)', status: 'queued' });
      ems.forEach((e) => elog(e, 'note', { text: 'Display A turned on by itself' }));
      emit('change');
    }
  }

  function displayOf(ep, real) {
    if (!ep) return 'A';
    if (ep.arrived || ep.responded) return 'B';
    const call = ep.calls[ep.calls.length - 1];
    if (call && real - call.real < th('crew.timer.seconds') * SEC) return 'wait';
    return 'A';
  }

  function stepsFor(ev, display) {
    const d = display === 'B' ? 'B' : 'A';
    const def = ev.code === 'E9' ? C.EMERGENCIES.E9[ev.variant || 'hot'] : C.EMERGENCIES[ev.code];
    const list = def[d].map((text, i) => ({ id: ev.code + '.' + (i + 1), n: i + 1, text, ev }));
    if (ev.modeAtOnset === 'exercise') list.unshift({ id: ev.code + '.0', n: 0, text: 'Stop. Let the equipment stop safely.', ev });
    if (display === 'wait') return list.slice(0, ev.modeAtOnset === 'exercise' ? 2 : 1).concat(list.slice(ev.modeAtOnset === 'exercise' ? 2 : 1).map((s) => Object.assign({}, s, { waiting: true })));
    return list;
  }

  function sortedEmergencies() {
    const ems = openEmergencyEvents();
    return ems.sort((a, b) => C.EMERGENCY_ORDER.indexOf(a.code) - C.EMERGENCY_ORDER.indexOf(b.code));
  }

  /* ---------------- modes (6) ---------------- */
  function setMode(mode, by, reason, extra) {
    const prev = S.mode.mode; const t = S.clock.t;
    if (prev === mode && mode !== 'exercise') return;
    // leaving a mode
    if (prev === 'sleep') {
      const hours = S.cur.sleeph;
      if (hours != null) {
        const poor = hours < th('sleep.poor.hours') || hours < th('sleep.poor.pct') / 100 * S.base.usual_sleep;
        S.trend.poorNights = poor ? S.trend.poorNights + 1 : 0;
        S.db.eventLog.push({ id: uid('l'), t, type: 'note', text: 'Night evaluated at wake-up: ' + hours + ' h · ' + (poor ? 'poor night (recorded only)' : 'normal night') });
      }
      S.mode.wakeAt = t; S.sleepLow = 0;
    }
    if (prev === 'exercise') { S.mode.exEnd = t; S.mode.ex = null; }
    const label = { regular: 'Regular', sleep: 'Sleep', exercise: 'Exercise', emergency: 'Emergency' };
    S.mode.mode = mode; S.mode.since = t;
    if (extra && extra.onsetMode) S.mode.onsetMode = extra.onsetMode;
    if (mode === 'sleep') { S.mode.sleepStart = t; S.sleepLow = 0; }
    if (mode === 'exercise') { S.mode.ex = Object.assign({ type: 'aerobic', intensity: 'moderate', planned: 30, start: t, started: false }, extra || {}); S.exAlerts = []; }
    S.db.modes.push({ t, mode, by, reason: reason || '', label: label[prev] + ' → ' + label[mode], value: mode === 'exercise' ? 'Aerobic · Moderate · 30 min' : '' });
    // a mode change by the astronaut changes the body's expected values: use that mode's Normal case
    if (by === 'astronaut' && mode !== 'emergency') { S.cur = Object.assign(parseCase(mode), { quality: S.cur.quality }); S.since = {}; S.samples = []; }
    emit('mode', mode);
  }

  function modeSafetyNets(ctx) {
    if (S.mode.mode === 'exercise' && S.mode.ex) {
      const ex = S.mode.ex; const act = ctx.v.act;
      if (!ex.started && act != null && act >= 2) { ex.started = true; ex.startedAt = ctx.t; }
      if (ex.started && ctx.t - ex.start >= (ex.planned + 15) * MIN) { setMode('regular', 'software', 'planned + 15 min passed'); return; }
      if (ex.started && W(ctx, 'ex.idle', act === 0, 5 * MIN, ['act'])) { setMode('regular', 'software', 'activity 0 for 5 minutes'); return; }
      if (!ex.started && ctx.t - ex.start >= 11 * MIN) { setMode('regular', 'software', 'session never started; no answer to "Do you want to cancel Exercise Mode?"'); return; }
    }
    if (S.mode.mode === 'sleep') {
      if (ctx.t - S.mode.sleepStart > 12 * HOUR && !S.mode.longNoted) { S.mode.longNoted = true; S.db.eventLog.push({ id: uid('l'), t: ctx.t, type: 'note', text: 'Sleep Mode longer than 12 hours' }); }
      if (ctx.v.spo2 != null && ctx.v.spo2 < th('spo2.sleep.l2.below')) S.sleepLow += STEP;
    }
  }

  /* ---------------- master loop (section 4) ---------------- */
  function tick(t) {
    S.clock.t = t;
    const ctx = buildCtx(t);
    // store the reading of this step (16.4); a second loop at the same instant (an astronaut action) adds no new reading
    const dup = S.lastTickT === t; S.lastTickT = t;
    if (!dup) {
      const sample = { t, mode: S.mode.mode, q: ctx.q };
      CONT.forEach((k) => { sample[k] = ctx.v[k]; });
      sample.val = ctx.val;
      S.samples.push(sample); if (S.samples.length > 3000) S.samples.shift();
      S.db.hourly.push({ t, hr: ctx.v.hr, spo2: ctx.v.spo2, rr: ctx.v.rr, skin: ctx.v.skin });
      if (ctx.v.rad != null) S.radLog.push({ t, rate: ctx.v.rad });
    } else if (S.samples.length) {
      const last = S.samples[S.samples.length - 1]; CONT.forEach((k) => { last[k] = ctx.v[k]; }); last.val = ctx.val;
      ctx.prev = S.samples.length > 1 ? S.samples[S.samples.length - 2] : null;
    }
    if (!dup) modeSafetyNets(ctx);
    const ctx2 = buildCtx(t); ctx2.prev = ctx.prev;
    // 5.6: heart rate, breathing and SpO2 all unavailable for 2 minutes
    if (W(ctx2, 'resp.check', ['hr', 'rr', 'spo2'].every((k) => ctx2.val[k] === 'unavailable'), 2 * MIN, [])) {
      if (!S.respChecked) { S.respChecked = true; S.db.checks.push({ t, answered: S.controls.responsive, note: 'all body signals unavailable for 2 minutes' }); if (!S.controls.responsive) openEmergency('E1', { desc: 'No answer to "Are you OK?" after all body signals were lost' }); }
    } else S.respChecked = false;
    // 5: emergencies first
    const em = checkEmergencies(ctx2);
    const seen = {};
    em.forEach((e) => {
      if (seen[e.code]) return; seen[e.code] = true;
      if (e.code === 'E16' && !S.events.some((x) => x.code === 'E16' && x.state === 'emergency')) { /* private */ }
      openEmergency(e.code, e);
    });
    S.lastEmerg = em;
    // cause search while E18 is open (11.2)
    const e18 = S.events.find((x) => x.code === 'E18' && x.state === 'emergency');
    if (e18) { e18.findings = findings(ctx2); elog(e18, 'cause_search', { found: e18.findings }); }
    // 6-8: rules, grouping, levels
    const fired = evalRules(ctx2);
    S.lastFired = fired;
    openEvents().forEach((ev) => { ev.presentNow = false; });
    groupPatterns(ctx2, fired);
    rechecks(ctx2, fired);
    pendingRepeats(ctx2);
    // caution periods end -> closed (14.5)
    S.events.forEach((ev) => { if (ev.state === 'monitoring' && ev.kind === 'emergency' && ev.cautionUntil != null && t >= ev.cautionUntil) closeEvent(ev, 'caution period ended', 'software'); });
  }

  function findings(ctx) {
    const f = [];
    const v = ctx.v;
    if (v.spo2 != null && v.spo2 < 95) f.push('SpO2 ' + v.spo2 + ' %');
    if (v.rr != null && (v.rr > 20 || v.rr < 10)) f.push('breathing ' + v.rr + ' /min');
    if (v.hr != null && (v.hr > 100 || v.hr < 50)) f.push('heart rate ' + v.hr + ' bpm');
    if (v.ecg === 'irregular') f.push('ECG irregular');
    if ((v.pause || 0) > 3) f.push('ECG pause ' + v.pause + ' s');
    if (ctx.fresh.core) f.push('core ' + ctx.fresh.core.v + ' °C');
    if (v.co2 != null && v.co2 >= 3) f.push('cabin CO2 ' + v.co2 + ' mmHg');
    if (v.o2 != null && v.o2 < 19.5) f.push('cabin O2 ' + v.o2 + ' %');
    ['hr', 'rr', 'spo2'].forEach((k) => { if (ctx.val[k] === 'unavailable') f.push(NAMES[k] + ': no data'); });
    return f;
  }

  /* ---------------- clock ---------------- */
  function checkMidnight(t) {
    const d = dayOf(t);
    if (d === S.trend.lastDay) return;
    const prevDay = S.trend.lastDay; S.trend.lastDay = d;
    // fluids are judged at the end of the day (agreed fix)
    const pct = S.trend.fluidToday / fluidPlan() * 100;
    S.trend.fluidLowDays = pct < th('fluid.l1.pct') ? S.trend.fluidLowDays + 1 : 0;
    const urineBad = S.trend.urineToday === 'dark' || S.trend.urineToday === 'low';
    if (pct < th('fluid.l2.pct') && (urineBad || S.symptoms.thirst || S.symptoms.dizziness)) S.manualSigns.fluidDay = { id: 'fluid.end', level: 2, pattern: 'P4', sign: 'low_fluid', signal: 'fluid', value: r1(S.trend.fluidToday), unit: 'L', desc: 'Fluids under ' + th('fluid.l2.pct') + '% of the plan on Day ' + prevDay + ' with dark or low urine, thirst or dizziness', trend: true };
    else if (pct < th('fluid.l1.pct')) S.manualSigns.fluidDay = { id: 'fluid.end', level: S.trend.fluidLowDays >= 2 ? 2 : 1, pattern: 'P4', sign: 'low_fluid', signal: 'fluid', value: r1(S.trend.fluidToday), unit: 'L', desc: 'Fluid intake under ' + th('fluid.l1.pct') + '% of the plan on Day ' + prevDay, trend: true };
    else delete S.manualSigns.fluidDay;
    S.db.eventLog.push({ id: uid('l'), t, type: 'note', text: 'Day ' + prevDay + ' evaluated: fluids ' + r1(S.trend.fluidToday) + ' of ' + fluidPlan() + ' L (' + Math.round(pct) + '%)' });
    S.trend.fluidToday = 0; S.trend.urineToday = null;
  }

  function advanceTo(target, stopOnL3) {
    stopFlag = null;
    while (S.clock.nextStep <= target) {
      const t = S.clock.nextStep;
      checkMidnight(t);
      tick(t);
      S.clock.nextStep = t + STEP;
      if (stopOnL3 && stopFlag) { S.clock.t = t; return true; }
    }
    S.clock.t = Math.max(S.clock.t, target);
    return false;
  }

  /* ---------------- manual values (2.5, 5.7, 8.5-8.7, 18) ---------------- */
  function manualFlags(key, t, extra) {
    const flags = [];
    if (S.mode.exEnd != null && t - S.mode.exEnd <= 10 * MIN) flags.push('post_exercise');
    if (S.mode.wakeAt != null && t - S.mode.wakeAt <= 5 * MIN) flags.push('after_waking');
    if ((key === 'sys' || key === 'dia' || key === 'bp') && extra && extra.rested === false) flags.push('no_rest');
    if (S.mode.mode === 'exercise') flags.push('during_exercise');
    return flags;
  }

  function reasonFor(key) {
    const asks = {
      core: ['P6', 'P9', 'E9', 'E13'], bp: ['P1', 'E1', 'E2', 'E3'], fspo2: ['P5', 'E6'], vis: ['P3', 'E15'], mass: ['P4', 'P12']
    };
    const codes = asks[key] || [];
    if (codes.some((c) => S.events.some((e) => e.code === c && e.state !== 'closed'))) return 'detection';
    if (key === 'core' && (S.symptoms.feels_hot || S.symptoms.feels_cold || S.symptoms.suspected_infection)) return 'detection';
    return 'routine';
  }

  function storeManual(key, value, opts) {
    const t = S.clock.t;
    const row = Object.assign({ id: uid('m'), t, key, value, unit: UNITS[key] || '', by: opts.by || 'You', reason: opts.reason || 'routine', flags: opts.flags || [], mode: S.mode.mode, source: opts.source || 'check-up' }, opts.extra || {});
    S.db.measurements.push(row);
    return row;
  }

  function setPending(key, ev, wait, sign) { S.pending[key] = { firstT: S.clock.t, dueAt: S.clock.t + wait, event: ev ? ev.id : null, sign }; }

  function manualSign(key, o) { if (o) S.manualSigns[key] = o; else delete S.manualSigns[key]; }

  // Evaluate one saved manual value. Returns a short message for the screen.
  function evaluateManual(key, value, opts) {
    const t = S.clock.t; const flags = opts.flags || []; const flagged = flags.length > 0;
    const rm = S.mode.mode === 'emergency' ? 'regular' : S.mode.mode;
    let msg = 'Saved ' + fmtHM(t) + '.';
    const runNow = () => { tick(t); };
    if (key === 'core') {
      S.man.core = { v: value, t, reason: opts.reason, flags };
      if (value < th('core.l3.below') || value >= th('core.l3.above')) { runNow(); return msg + ' This value needs action now.'; }
      if (rm === 'exercise') { runNow(); return msg + ' In Exercise Mode only danger limits act on manual values.'; }
      if (flagged) { runNow(); return msg + ' Flagged (' + flags.join(', ') + '): stored, not judged.'; }
      const fever = value >= th('core.l1.fever'); const low = value >= th('core.l3.below') && value < th('core.l1.low');
      const p = S.pending.core;
      if (fever || low) {
        const sign = fever ? { pattern: 'P6', sign: 'fever' } : { pattern: 'P9', sign: 'core_off' };
        if (p && t >= p.dueAt) {
          manualSign('core', Object.assign({ id: 'core.l2', level: 2, signal: 'core', value, desc: (fever ? 'Core ' + value + ' °C, at or above ' + th('core.l1.fever') : 'Core ' + value + ' °C, below ' + th('core.l1.low')) + ' °C on the repeat', trend: true }, sign));
          delete S.pending.core; runNow(); return msg + ' Confirmed on the repeat.';
        }
        if (p) return msg + ' Repeat after ' + fmtHM(p.dueAt) + '.';
        const wait = (opts.reason === 'detection' ? th('core.repeat.detection') : th('core.repeat.routine')) * MIN;
        manualSign('core', Object.assign({ id: 'core.l1', level: 1, signal: 'core', value, desc: 'Core ' + value + ' °C on the first reading: repeat ' + (opts.reason === 'detection' ? 'after 20–30 minutes of rest' : 'after 1 minute'), trend: true, prompt: 'Repeat your temperature at ' + fmtHM(t + wait) + '.' }, sign));
        runNow();
        const ev = S.events.find((e) => e.code === sign.pattern && e.state !== 'closed');
        setPending('core', ev, wait, sign);
        if (ev) addReminder({ type: 'condition', event: ev.id, text: 'Repeat your core temperature', label: 'Repeat your core temperature · ' + fmtHM(t + wait), sched: { kind: 'interval', first: t + wait, every: null, until: null } });
        return msg + ' Repeat after ' + (opts.reason === 'detection' ? '20–30 minutes of rest' : '1 minute') + ' (' + fmtHM(t + wait) + ').';
      }
      if (S.manualSigns.core) { const ev = S.events.find((e) => e.state === 'watch' && (e.code === 'P6' || e.code === 'P9')); manualSign('core', null); delete S.pending.core; if (ev) closeEvent(ev, 'transient: normal on the repeat', 'software'); }
      runNow(); return msg;
    }
    if (key === 'bp') {
      const { sys, dia, rested } = value;
      S.man.sys = { v: sys, t, reason: opts.reason, flags }; S.man.dia = { v: dia, t, reason: opts.reason, flags };
      if (rm === 'sleep') return msg + ' Blood pressure is not judged in Sleep Mode.';
      if (rm === 'exercise') return msg + ' Not judged during the session. Measure after 5–10 minutes of rest.';
      const crisis = sys < th('bp.sys.low') || sys > th('bp.sys.high') || dia > th('bp.dia.high');
      const dangerSym = C.DANGEROUS.some((c) => S.symptoms[c]);
      if (flagged && !(crisis && dangerSym)) { runNow(); return msg + ' Flagged (' + flags.join(', ') + '): stored, not judged.'; }
      const p = S.pending.bp;
      if (crisis) {
        if (dangerSym) { manualSign('bp', { id: 'bp.l3', level: 2, pattern: 'P1', sign: 'bp', signal: 'sys', value: sys + '/' + dia, unit: 'mmHg', desc: 'Blood pressure ' + sys + '/' + dia + ' with symptoms', trend: true }); runNow(); return msg + ' Medical has been notified (simulated).'; }
        if (p && t >= p.dueAt) { manualSign('bp', { id: 'bp.l2', level: 2, pattern: 'P1', sign: 'bp', signal: 'sys', value: sys + '/' + dia, unit: 'mmHg', desc: 'Blood pressure ' + sys + '/' + dia + ' confirmed on the repeat', trend: true }); delete S.pending.bp; runNow(); return msg + ' Confirmed on the repeat.'; }
        if (p) return msg + ' Repeat after ' + fmtHM(p.dueAt) + '.';
        manualSign('bp', { id: 'bp.l1', level: 1, pattern: 'P1', sign: 'bp', signal: 'sys', value: sys + '/' + dia, unit: 'mmHg', desc: 'Blood pressure ' + sys + '/' + dia + ': repeat after 5 minutes of rest', trend: true, prompt: 'Rest 5 minutes, then measure again.' });
        runNow();
        const ev = S.events.find((e) => e.code === 'P1' && e.state !== 'closed');
        setPending('bp', ev, th('bp.repeat.minutes') * MIN, 'bp');
        return msg + ' Repeat after 5 minutes of rest (' + fmtHM(t + th('bp.repeat.minutes') * MIN) + ').';
      }
      const prev = S.db.measurements.filter((m) => m.key === 'bp' && m.t < t && m.sys);
      const trend = prev.length ? prev.slice(-3) : [{ sys: S.base.sys, dia: S.base.dia }];
      const ts = trend.reduce((a, m) => a + m.sys, 0) / trend.length, td = trend.reduce((a, m) => a + m.dia, 0) / trend.length;
      if (S.manualSigns.bp && S.pending.bp) { const ev = S.events.find((e) => e.code === 'P1' && e.state === 'watch'); manualSign('bp', null); delete S.pending.bp; if (ev && !S.lastFired.some((f) => f.pattern === 'P1' && !f.manual)) closeEvent(ev, 'transient: normal on the repeat', 'software'); }
      if (Math.abs(sys - ts) >= th('bp.shift') || Math.abs(dia - td) >= th('bp.shift')) manualSign('bpshift', { id: 'bp.shift', level: 1, pattern: 'P1', sign: 'bp', signal: 'sys', value: sys + '/' + dia, unit: 'mmHg', desc: 'A change of ' + th('bp.shift') + '–20 mmHg from your own trend (first time)', trend: true });
      else manualSign('bpshift', null);
      runNow(); return msg;
    }
    if (key === 'fspo2') { S.man.fspo2 = { v: value, t, reason: opts.reason, flags }; runNow(); return msg + (rm === 'sleep' ? ' Not used in Sleep Mode.' : ''); }
    if (key === 'mass') {
      S.man.mass = { v: value, t, reason: opts.reason, flags };
      const ref = S.db.measurements.filter((m) => m.key === 'mass' && t - m.t >= 10 * DAY && t - m.t <= 18 * DAY).pop();
      const refV = ref ? ref.value : S.base.mass;
      const pct = (value - refV) / refV * 100;
      if (pct <= -th('mass.l1.pct')) manualSign('mass', { id: 'mass', level: pct <= -th('mass.l2.pct') ? 2 : 1, pattern: 'P12', sign: 'mass_loss', signal: 'mass', value: r1(value), unit: 'kg', astronautOnly: true, desc: 'Loss of ' + r1(-pct) + '% over about 2 weeks (from ' + refV + ' kg)', trend: true });
      else manualSign('mass', null);
      runNow(); return msg + ' Change over about 2 weeks: ' + (pct >= 0 ? '+' : '') + r1(pct) + '%.';
    }
    if (key === 'vis') {
      const { l, r } = value;
      if (l != null) S.man.visl = { v: l, t }; if (r != null) S.man.visr = { v: r, t };
      const worse = Math.max(l != null ? l - S.base.visl : -9, r != null ? r - S.base.visr : -9);
      const headSym = ['headache', 'blurred_vision', 'vision_change', 'severe_headache'].some((c) => S.symptoms[c]);
      const p = S.pending.vis;
      if (worse >= th('acuity.l1') - 1e-9) {
        if (headSym || (p && t >= p.dueAt)) { manualSign('vis', { id: 'vis.l2', level: 2, pattern: 'P3', sign: 'acuity_worse', signal: null, value: '+' + r1(worse), unit: 'logMAR', desc: 'Acuity worse by ' + r1(worse) + ' logMAR, ' + (headSym ? 'with a head or vision symptom' : 'confirmed on the repeat'), trend: true }); delete S.pending.vis; runNow(); return msg + ' Confirmed.'; }
        if (p) return msg + ' Repeat after ' + fmtHM(p.dueAt) + '.';
        manualSign('vis', { id: 'vis.l1', level: 1, pattern: 'P3', sign: 'acuity_worse', signal: null, value: '+' + r1(worse), unit: 'logMAR', desc: 'One eye worse than its baseline by ' + r1(worse) + ' logMAR: repeat the test', trend: true, prompt: 'Repeat the eye test in 10 minutes, same eye.' });
        runNow();
        const ev = S.events.find((e) => e.code === 'P3' && e.state !== 'closed');
        setPending('vis', ev, 10 * MIN, 'acuity_worse');
        return msg + ' Repeat in 10 minutes, same eye (' + fmtHM(t + 10 * MIN) + ').';
      }
      if (S.manualSigns.vis) { const ev = S.events.find((e) => e.code === 'P3' && e.state === 'watch'); manualSign('vis', null); delete S.pending.vis; if (ev) closeEvent(ev, 'transient: normal on the repeat', 'software'); }
      runNow(); return msg;
    }
    if (key === 'urine') {
      S.trend.urineToday = value;
      if (value === 'dark' || value === 'low') manualSign('urine', { id: 'urine', level: 1, pattern: 'P4', sign: 'dark_urine', signal: null, value: value === 'dark' ? 'Dark' : 'Low amount', unit: '', desc: value === 'dark' ? 'Dark urine' : 'Low urine amount', trend: true, prompt: 'Drink as your fluid plan says.' });
      else manualSign('urine', null);
      runNow(); return msg;
    }
    if (key === 'fluid') { runNow(); return msg + ' Today: ' + r1(S.trend.fluidToday) + ' of ' + fluidPlan() + ' L.'; }
    if (key === 'ecg12' || key === 'us') {
      if (value === 'abnormal') manualSign(key, { id: key, level: 2, pattern: key === 'ecg12' ? 'P1' : 'P12', sign: key === 'ecg12' ? 'ecg12_abnormal' : 'test_abnormal', signal: key === 'ecg12' ? 'ecg' : null, value: 'Abnormal', unit: '', desc: (key === 'ecg12' ? '12-lead ECG' : 'Ultrasound') + ' result abnormal', trend: true });
      else manualSign(key, null);
      runNow(); return msg;
    }
    runNow(); return msg;
  }

  function pendingRepeats(ctx) {
    Object.keys(S.pending).forEach((k) => {
      const p = S.pending[k];
      if (ctx.t >= p.dueAt + th('repeat.missed.minutes') * MIN) {
        const m = S.manualSigns[k];
        if (m) manualSign(k, Object.assign({}, m, { id: k + '.missed', level: 2, desc: m.desc.split(':')[0] + ': the repeat was not taken (Level 2, unconfirmed)' }));
        delete S.pending[k];
        const ev = p.event && S.events.find((e) => e.id === p.event);
        if (ev) elog(ev, 'note', { text: 'Missed manual repeat: raised to Level 2 as "unconfirmed"' });
      }
    });
  }

  /* mental health (13.2) */
  function saveMental(mood, stress, option, unsafe, by) {
    const t = S.clock.t;
    const entry = { id: uid('mh'), t, mood, stress, options: option && option !== 'Nothing in particular' ? [option] : [], cannotStaySafe: !!unsafe, private: true, by: by || S.id, mode: S.mode.mode };
    S.db.mental.push(entry);
    if (unsafe) { addSymptoms(['self_harm'], by || S.id, 'check-up'); return 'Saved privately. A trusted crew member is being asked to come.'; }
    const rm = S.mode.mode;
    if (rm !== 'regular') { tick(t); return 'Saved privately. Scores are judged in Regular mode.'; }
    const score = Math.max(mood == null ? 0 : mood, stress == null ? 0 : stress);
    S.trend.moodHigh = score >= th('mood.l2') ? S.trend.moodHigh + 1 : 0;
    const opts = entry.options;
    if (score >= th('mood.l2')) manualSign('mood', { id: 'mood.l2', level: 2, pattern: 'P10', sign: 'high_stress', signal: 'mood', value: score, unit: '/10', desc: 'Mood or stress score ' + score + ' (7 or more)', trend: true });
    else if (score >= th('mood.l1') || opts.length >= 2) manualSign('mood', { id: 'mood.l1', level: 1, pattern: 'P10', sign: 'high_stress', signal: 'mood', value: score, unit: '/10', desc: 'Mood or stress score ' + score, trend: true, prompt: 'Protect your sleep. You can talk with a doctor in private. Call family.' });
    else manualSign('mood', null);
    if (opts.includes('Trouble concentrating')) manualSign('conc', { id: 'conc', level: 1, pattern: 'P10', sign: 'poor_concentration', signal: 'mood', value: score, unit: '/10', desc: 'Trouble concentrating', trend: true }); else manualSign('conc', null);
    tick(t);
    if (score >= th('mood.l2')) return 'Saved privately. Responsible crew and medical are told, privately.';
    if (score >= th('mood.l1')) return 'Saved privately. Protect your sleep. You can talk with a doctor in private. Call family.';
    return 'Saved privately. Breathe in for 4 seconds, out for 6, for 5 minutes. Talk to a crew mate or family.';
  }

  /* symptoms (10.1, 13.1, 13.3) */
  function addSymptoms(codes, by, via) {
    const t = S.clock.t; const added = [];
    codes.forEach((c) => {
      if (!S.symptoms[c]) { S.symptoms[c] = { t, by }; added.push(c); }
      S.db.symptoms.push({ id: uid('s'), t, code: c, action: 'reported', by, byCrewMate: by !== S.id, via, private: c === 'self_harm' });
    });
    tick(t);
    return added;
  }
  function clearSymptoms(codes, by) {
    codes.forEach((c) => { if (S.symptoms[c]) { delete S.symptoms[c]; S.db.symptoms.push({ id: uid('s'), t: S.clock.t, code: c, action: 'marked_gone', by: by || 'software', private: c === 'self_harm' }); } });
  }

  function matchText(text) {
    const tx = ' ' + String(text || '').toLowerCase().replace(/[’`]/g, "'") + ' ';
    const out = new Set();
    C.KEYWORDS.forEach(([re, codes]) => { if (re.test(tx)) codes.forEach((c) => out.add(c)); });
    if (out.has('eye_skin_irritation')) out.delete('burn');
    if (out.has('not_breathing')) out.delete('laboured_breathing');
    if (out.has('arm_weakness')) out.delete('unusual_weakness');
    if (out.has('severe_weakness')) out.delete('unusual_weakness');
    if (out.has('blood_vomit_stool')) out.delete('bleeding');
    if (out.has('severe_headache')) out.delete('headache');
    if (out.has('cannot_keep_fluids')) { /* vomiting kept as sign */ }
    if (out.has('chest_pain') && /heart (is )?racing/.test(tx)) { /* both */ }
    return Array.from(out);
  }

  /* ---------------- public API ---------------- */
  const API = {
    C, MIN, HOUR, DAY, STEP, fmtHM, fmtHMS, fmtDay, dayOf, UNITS, NAMES,
    on(fn) { listeners.push(fn); },
    get state() { return S; },
    serialError,

    login(id, name) {
      id = String(id == null ? '' : id); name = String(name || '').trim();
      const err = serialError(id); if (err) return { ok: false, msg: err };
      if (!name) return { ok: false, msg: 'Enter your first and last name.' };
      const c = claimSerial(id, name); if (!c.ok) return c;
      S = c.state;
      S.clock.lastReal = nowReal();
      S.db.logins.push({ action: 'login', t: S.clock.t, real: nowReal() });
      return { ok: true };
    },
    logout() { if (S) { S.db.logins.push({ action: 'logout', t: S.clock.t, real: nowReal() }); } S = null; },

    realTick() {
      if (!S) return;
      const real = nowReal();
      const dt = Math.min(real - S.clock.lastReal, 10 * MIN);
      S.clock.lastReal = real;
      if (!S.clock.paused && !inRun && dt > 0) advanceTo(S.clock.t + dt, false);
      episodeTimers(real);
    },
    advance(ms) { inRun = true; let stopped = false; try { stopped = advanceTo(S.clock.t + ms, true); } finally { inRun = false; } S.clock.lastReal = nowReal(); emit('change'); return stopped; },
    togglePause() { S.clock.paused = !S.clock.paused; S.clock.lastReal = nowReal(); emit('change'); },

    /* Simulation page RUN (1.3) */
    run(fields, holdText) {
      const missing = [];
      const cont = {}; const man = {};
      C.SIM_ROWS.forEach((r) => {
        const p = parseField(r.id, fields[r.id]);
        if (r.g === 'w' || r.g === 'c') {
          if (p.empty || p.invalid) missing.push(r.name + (p.invalid ? ' (invalid)' : ''));
          else cont[r.id] = p.value;
        } else {
          if (p.invalid) missing.push(r.name + ' (invalid)');
          else if (!p.empty) man[r.id] = p.value;
        }
      });
      if (man.sys != null && man.dia != null && man.sys <= man.dia) missing.push('Systolic must be above diastolic: repeat the blood pressure');
      const hold = num(holdText == null || holdText === '' ? '0' : holdText);
      if (Number.isNaN(hold) || hold < 0) missing.push('Hold time (minutes)');
      if (missing.length) return { ok: false, missing };
      if (!S.run.active) { S.run.active = true; S.run.started = S.clock.t; S.run.id = uid('run'); }
      S.run.log = [];
      const t0 = S.clock.t;
      // Send: store continuous values
      Object.keys(cont).forEach((k) => { S.cur[k] = cont[k]; });
      S.cur.quality = cont.quality;
      S.db.sent.push({ id: uid('send'), t: t0, values: Object.assign({}, cont), mode: S.mode.mode, run: S.run.id });
      // manual values: only those that changed are new readings
      const flags = (k) => manualFlags(k, t0, { rested: man.rest });
      S.lastSimManual = S.lastSimManual || {};
      const changed = (k, v) => !(k in S.lastSimManual) || S.lastSimManual[k].v !== v;
      const did = (k, v) => { S.lastSimManual[k] = { v }; };
      inRun = true; stopFlag = null;
      try {
        if (man.sys != null && man.dia != null && (changed('sys', man.sys) || changed('dia', man.dia))) {
          storeManual('bp', man.sys + '/' + man.dia, { reason: reasonFor('bp'), flags: flags('bp'), source: 'simulation', extra: { sys: man.sys, dia: man.dia, rested: man.rest !== false } });
          evaluateManual('bp', { sys: man.sys, dia: man.dia, rested: man.rest !== false }, { reason: reasonFor('bp'), flags: man.rest === false ? ['no_rest'].concat(flags('bp').filter((f) => f !== 'no_rest')) : flags('bp').filter((f) => f !== 'no_rest') });
          did('sys', man.sys); did('dia', man.dia);
        }
        ['core', 'fspo2', 'mass'].forEach((k) => { if (man[k] != null && changed(k, man[k])) { const rs = reasonFor(k); storeManual(k, man[k], { reason: rs, flags: flags(k), source: 'simulation' }); evaluateManual(k, man[k], { reason: rs, flags: k === 'core' ? flags(k) : [] }); did(k, man[k]); } });
        if ((man.visl != null && changed('visl', man.visl)) || (man.visr != null && changed('visr', man.visr))) { storeManual('vis', (man.visl ?? '–') + ' / ' + (man.visr ?? '–'), { source: 'simulation' }); evaluateManual('vis', { l: man.visl, r: man.visr }, {}); did('visl', man.visl); did('visr', man.visr); }
        if (man.urine != null && changed('urine', man.urine)) { storeManual('urine', man.urine, { source: 'simulation' }); evaluateManual('urine', man.urine, {}); did('urine', man.urine); }
        if (man.fluid != null && changed('fluid', man.fluid)) { S.trend.fluidToday = man.fluid; storeManual('fluid', man.fluid, { source: 'simulation', extra: { note: 'total today' } }); did('fluid', man.fluid); }
        ['ecg12', 'us'].forEach((k) => { if (man[k] != null && changed(k, man[k])) { storeManual(k, man[k], { source: 'simulation' }); evaluateManual(k, man[k], {}); did(k, man[k]); } });
        if ((man.mood != null || man.stress != null) && (changed('mood', man.mood) || changed('stress', man.stress))) { saveMental(man.mood, man.stress, null, false, S.id); did('mood', man.mood); did('stress', man.stress); }
        // Run: first loop now, then 30-second steps for the hold time; stop at a new Level 3
        if (!stopFlag) tick(t0);
        S.clock.nextStep = t0 + STEP;
        let stopped = !!stopFlag;
        if (!stopped) stopped = advanceTo(t0 + hold * MIN, true);
      } finally { inRun = false; }
      S.clock.lastReal = nowReal();
      const res = API.runResult(t0);
      emit('change');
      return Object.assign({ ok: true }, res);
    },

    runResult(t0) {
      const log = S.run.log;
      let best = null;
      log.forEach((x) => { if (!best || x.level > best.level) best = x; });
      const mode = S.episode ? S.episode.modeAtOnset : S.mode.mode;
      if (!best || best.level === 0) return { level: 0, title: 'Result: all normal', text: 'Every value is inside its band for this mode. Nothing happens. (' + fmtHM(t0) + ' → ' + fmtHM(S.clock.t) + ')' };
      const ev = S.events.find((e) => e.id === best.ev);
      const L = ev.levels.find((l) => l.level === best.level) || {};
      const at = ' at ' + fmtHM(best.t) + ' (+' + Math.round((best.t - t0) / MIN * 10) / 10 + ' min)';
      if (best.level === 3) {
        const extra = mode === 'sleep' ? 'Loudest alarm and lights, Sleep mode ends.' : mode === 'exercise' ? 'Session stops, crew called, emergency screen.' : 'Alarm, crew called, emergency screen.';
        return { level: 3, title: 'Result: EMERGENCY', text: 'This is about: ' + ev.about + '. ' + (L.why || ev.trigger.desc) + ' → emergency' + at + '. ' + extra, event: ev.id, screen: 'emergency' };
      }
      if (best.level === 2) {
        const extra = mode === 'sleep' ? 'No alert screen during sleep: logged in Records › Events.' : mode === 'exercise' ? 'Shown on the Exercise screen. Medical told (simulated).' : (ev.astronautOnly ? 'Steps shown to you only.' : 'Steps shown, reminders added, medical told (simulated).');
        return { level: 2, title: 'Result: Alert (Level 2)', text: 'This is about: ' + ev.about + '. ' + (L.why || ev.trigger.desc) + ' → Level 2' + at + '. ' + extra, event: ev.id, screen: mode === 'sleep' ? 'records' : mode === 'exercise' ? 'exercise' : 'alert' };
      }
      return { level: 1, title: 'Result: Watch (Level 1)', text: 'This is about: ' + ev.about + '. ' + (L.why || ev.trigger.desc) + at + '. One recheck is scheduled.', event: ev.id, screen: null };
    },

    endSimRun() {
      if (!S) return;
      const t = S.clock.t;
      openEvents().forEach((ev) => closeEvent(ev, 'run ended (simulated)', 'software'));
      if (S.run.active) S.db.eventLog.push({ id: uid('l'), t, type: 'note', text: 'Simulated run ended' });
      S.episode = null;
      if (S.mode.mode === 'emergency') setMode('regular', 'software', 'simulated run ended');
      clearSymptoms(Object.keys(S.symptoms), 'software (run ended)');
      S.since = {}; S.samples = []; S.pending = {}; S.manualSigns = {}; S.ctxHold = null; S.sensorSince = {}; S.sleepLow = 0;
      S.man = {}; S.lastSimManual = {};
      S.cur = Object.assign(parseCase(S.mode.mode === 'emergency' ? 'regular' : S.mode.mode), { quality: 100 });
      S.controls.chest = 'working'; S.controls.wrist = 'working';
      S.run = { active: false, started: null, log: [] };
      S.clock.paused = false; S.clock.lastReal = nowReal(); S.clock.nextStep = S.clock.t + STEP;
      S.exAlerts = [];
      emit('change');
    },

    setControl(k, v) {
      S.controls[k] = v; S.db.counters.push({ t: S.clock.t, control: k, value: v });
      if (k === 'responsive' && v === false && openEmergencyEvents().length) openEmergency('E1', { desc: 'Simulator: astronaut responsive = no' });
      emit('change');
    },
    setCounter(k, v) { S.counters[k] = v; S.db.counters.push({ t: S.clock.t, counter: k, value: v }); },
    setThreshold(k, v) { const n = num(v); if (n == null || Number.isNaN(n)) return false; S.th[k] = n; S.db.thresholdChanges.push({ t: S.clock.t, key: k, value: n }); return true; },
    setProfile(fields) {
      // panel A: "40 · male", "22:00 · 06:00", "56 · 50", "118/76" ...
      const P = S.profile, B = S.base; const errs = [];
      const two = (s) => String(s || '').split(/[·,/;]| - /).map((x) => x.trim()).filter(Boolean);
      const N = (x, name) => { const n = num(x); if (n == null || Number.isNaN(n)) { errs.push(name); return null; } return n; };
      if (fields.agesex != null) { const [a, s] = two(fields.agesex); const n = N(a, 'Age'); if (n != null) P.age = n; if (/^f/i.test(s || '')) P.sex = 'female'; else if (/^m/i.test(s || '')) P.sex = 'male'; else errs.push('Sex'); }
      if (fields.fitness != null) { const f = String(fields.fitness).trim().toLowerCase(); if (['untrained', 'average', 'trained', 'athlete'].includes(f)) P.fitness = f; else errs.push('Fitness'); }
      if (fields.mass != null) { const n = N(fields.mass, 'Body mass'); if (n != null) { P.mass = n; B.mass = n; } }
      if (fields.sleepwake != null) { const [b, w] = two(fields.sleepwake.replace(/·/g, ' · ')).filter((x) => /\d/.test(x)); if (parseHM(b) != null && parseHM(w) != null) { P.bedtime = b; P.wake = w; } else errs.push('Bedtime · wake'); }
      if (fields.fluid != null) { const n = N(fields.fluid, 'Fluid plan'); if (n != null) P.fluidPlan = n; }
      if (fields.resthr != null) { const n = N(fields.resthr, 'Resting heart rate'); if (n != null) B.rest_hr = n; }
      if (fields.sleephr != null) { const [a, b] = two(fields.sleephr); const x = N(a, 'Sleep average HR'), y = N(b, 'Sleep lowest HR'); if (x != null) B.sleep_hr = x; if (y != null) B.sleep_low = y; }
      if (fields.hrv != null) { const [a, b] = two(fields.hrv); const x = N(a, 'Resting HRV'), y = N(b, 'Sleep HRV'); if (x != null) B.rest_hrv = x; if (y != null) B.sleep_hrv = y; }
      if (fields.rr != null) { const [a, b] = two(fields.rr); const x = N(a, 'Resting breathing'), y = N(b, 'Sleep breathing'); if (x != null) B.rest_rr = x; if (y != null) B.sleep_rr = y; }
      if (fields.spo2 != null) { const [a, b] = two(fields.spo2); const x = N(a, 'Resting SpO2'), y = N(b, 'Sleep SpO2'); if (x != null) B.rest_spo2 = x; if (y != null) B.sleep_spo2 = y; }
      if (fields.bp != null) { const m = /(\d+)\s*\/\s*(\d+)/.exec(fields.bp); if (m && +m[1] > +m[2]) { B.sys = +m[1]; B.dia = +m[2]; } else errs.push('Blood pressure'); }
      if (fields.aerobic != null) { const n = N(fields.aerobic, 'Aerobic HR at usual load'); if (n != null) B.aerobic_load_hr = n; }
      S.db.profile.push({ t: S.clock.t, profile: Object.assign({}, P), base: Object.assign({}, B) });
      return errs;
    },

    sos(via, phrase) {
      const ems = openEmergencyEvents();
      if (ems.length) { API.crewNotArrived(via || 'sos_button', phrase); return 'again'; }
      openEmergency('E18', { desc: via === 'strong_tap' ? 'Strong tap on the wrist screen' : via === 'voice_command' ? 'Voice command "' + phrase + '"' : 'SOS button pressed' }, { via: via || 'sos_button', phrase });
      tick(S.clock.t);
      emit('change');
      return 'opened';
    },
    voice(phrase) {
      const p = String(phrase || '').trim().toLowerCase();
      if (['sos', 'call crew', 'emergency'].includes(p)) return API.sos('voice_command', phrase);
      return null;
    },
    crewNotArrived(via) {
      const ep = S.episode; const ems = openEmergencyEvents(); if (!ep || !ems.length) return;
      if (!ep.againUsed) {
        ep.againUsed = true; ep.responded = false; ep.aDeclaredNoted = false; ep.arrived = false;
        crewCall(via && via !== 'button' ? via : 'crew_not_arrived', ems[0]);
        ep.againNote = 'Crew called again.';
        ems.forEach((e) => elog(e, 'note', { text: 'The crew has not arrived: one new call to all crew' }));
      } else {
        crewCall(via && via !== 'button' ? via : 'crew_not_arrived', ems[0], null, true);
        ep.againNote = 'Crew was already called again. Stay secured.';
      }
      emit('change');
    },
    crewArrived() {
      const ep = S.episode; const ems = openEmergencyEvents(); if (!ep || !ems.length) return false;
      ep.arrived = true; ep.againNote = null;
      const call = ep.calls[ep.calls.length - 1];
      S.db.responses.push({ call: call ? call.id : null, response: 'arrived', responder: 'Crew mate (simulated)', seconds: call ? r1((nowReal() - call.real) / SEC) : null, t: S.clock.t });
      ems.forEach((e) => elog(e, 'note', { text: 'Crew arrived' }));
      emit('change'); return true;
    },
    // "YES, I'M OK" answers the check and ends the emergency
    imOk() {
      const ep = S.episode; if (!ep) return false;
      if (ep.okAsk) { ep.okAsk.answered = true; S.db.checks.push({ t: S.clock.t, answered: true, seconds: r1((nowReal() - ep.okAsk.askedReal) / SEC) }); ep.okAsk = null; }
      return API.endEmergency('astronaut', 'astronaut answered "I\'m OK"');
    },
    touch() { if (S && S.episode) S.episode.lastTouchReal = nowReal(); },

    emergencyStepDone() {
      const v = API.emergencyView(); if (!v || !v.current) return;
      const ep = S.episode; const id = v.current.id;
      ep.done[id] = true; ep.shownDone[id] = true;
      S.db.steps.push({ event: v.current.ev.id, step: id, display: v.display === 'wait' ? 'A' : v.display, by: S.id, t: S.clock.t });
      v.current.ev.stepsDone[id] = true;
      ep.lastTouchReal = nowReal();
      emit('change');
    },
    emergencyStepsAgain() { if (S.episode) { S.episode.shownDone = {}; S.episode.lastTouchReal = nowReal(); emit('change'); } },

    noEmergency(by) {
      const ems = openEmergencyEvents(); if (!ems.length) return;
      const t = S.clock.t;
      const still = new Set((S.lastEmerg || []).filter((e) => e.measured).map((e) => e.code));
      ems.forEach((ev) => {
        const inRange = !still.has(ev.code);
        const hours = th('caution.' + ev.code) != null ? th('caution.' + ev.code) : (C.CAUTION[ev.code] || [24])[0];
        ev.cautionUntil = t + hours * HOUR;
        ev.exerciseBlockedUntil = t + ((C.CAUTION[ev.code] || [0, 0])[1]) * HOUR;
        ev.closedBy = by || 'astronaut';
        ev.closeReason = (by && by !== 'astronaut' ? 'closed by crew mate' : 'closed by astronaut') + (inRange ? ' · values were back in range' : ' · "No emergency" (false alarm)');
        elog(ev, 'closed', { reason: ev.closeReason, by: ev.closedBy });
        setLevel(ev, 3, 'monitoring', ev.closeReason);
        makeHandover(ev);
        if (!ev.reminders.length) conditionReminders(ev);
      });
      // symptom-only triggers reopen only if reported again
      const trig = new Set(); ems.forEach((ev) => (S.lastEmerg || []).forEach((e) => { if (e.code === ev.code && e.symptoms) e.symptoms.forEach((c) => trig.add(c)); }));
      clearSymptoms(Array.from(trig), by || 'astronaut');
      S.episode = null;
      setMode('regular', 'software', 'emergency closed');
      emit('change');
    },

    /* End emergency: close it as handled, reset values to Normal so it does not reopen, go back to the mode at onset */
    endEmergency(by, why) {
      if (S.mode.mode !== 'emergency' && !openEmergencyEvents().length) return false;
      const onset = S.mode.onsetMode || 'regular'; const bed = S.mode.bedtime;
      const who = by || 'astronaut';
      openEmergencyEvents().forEach((ev) => { makeHandover(ev); closeEvent(ev, (why || 'emergency ended by ' + who) + ' · values reset to Normal', who); });
      API.endSimRun();
      if (onset === 'sleep') { API.startSleep(); if (bed) S.mode.bedtime = bed; } else if (onset === 'exercise') API.startExercise();
      S.mode.exEnd = null;
      emit('change');
      return true;
    },

    alertStepDone(evId, idx) {
      const ev = S.events.find((e) => e.id === evId); if (!ev) return;
      ev.stepsDone[idx] = true;
      S.db.steps.push({ event: ev.id, step: ev.code + '.' + (idx + 1), display: 'A', by: S.id, t: S.clock.t });
      emit('change');
    },

    startSleep() { if (S.mode.mode === 'emergency') return false; if (S.mode.mode !== 'sleep') { setMode('sleep', 'astronaut', 'Sleep tile'); S.mode.bedtime = nowReal(); } emit('change'); return true; },
    endSleep() {
      if (S.mode.mode === 'sleep') {
        const b = S.mode.bedtime; const end = nowReal();
        let rec = null;
        if (b) {
          rec = { id: uid('sl'), t: S.clock.t, start: b, end, ms: end - b, cycles: Math.floor((end - b) / (90 * MIN)), from: API.realHM(b), to: API.realHM(end), duration: API.realDuration(end - b) };
          (S.db.sleep = S.db.sleep || []).push(rec);
        }
        setMode('regular', 'astronaut', "I'm awake"); S.mode.bedtime = null;
        emit('change');
        return rec;
      }
      emit('change');
      return null;
    },
    /* bedtime entered by the astronaut (real local time, HH:MM); a time later than now means yesterday evening */
    setBedtime(hm) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '').trim());
      if (!m || +m[1] > 23 || +m[2] > 59) return { ok: false, msg: 'Enter the time as HH:MM, e.g. 22:30.' };
      if (S.mode.mode !== 'sleep') return { ok: false, msg: 'Start sleep mode first.' };
      const d = new Date(); d.setHours(+m[1], +m[2], 0, 0);
      if (d.getTime() > nowReal()) d.setDate(d.getDate() - 1);
      if (nowReal() - d.getTime() > 16 * HOUR) return { ok: false, msg: API.realHM(d.getTime()) + ' is later than now. Enter the time you went to sleep.' };
      S.mode.bedtime = d.getTime();
      S.db.modes.push({ t: S.clock.t, mode: 'sleep', by: 'astronaut', label: 'Bedtime entered', value: API.realHM(d.getTime()) });
      emit('change');
      return { ok: true, msg: 'Saved: you went to sleep at ' + API.realHM(d.getTime()) + '.' };
    },
    realHM(ms) { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); },
    realDuration(ms) { const m = Math.max(0, Math.floor(ms / MIN)); return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min'; },
    startExercise() { if (S.mode.mode === 'emergency') return false; if (S.mode.mode !== 'exercise') setMode('exercise', 'astronaut', 'Exercise tile', { type: 'aerobic', intensity: 'moderate', planned: 30 }); emit('change'); return true; },
    endExercise() { if (S.mode.mode === 'exercise') setMode('regular', 'astronaut', 'End exercise'); emit('change'); },

    /* Daily Check-Up save (18) */
    saveCheckup(id, vals) {
      const t = S.clock.t; const P = (x) => num(x);
      const bad = (k, x) => x == null || Number.isNaN(x) || (PLAUSIBLE[k] && (x < PLAUSIBLE[k][0] || x > PLAUSIBLE[k][1]));
      if (id === 'bp') {
        const r = [P(vals[0]), P(vals[1]), P(vals[2]), P(vals[3])];
        const pairs = []; if (r[0] != null && r[1] != null) pairs.push([r[0], r[1]]); if (r[2] != null && r[3] != null) pairs.push([r[2], r[3]]);
        if (!pairs.length) return { ok: false, msg: 'Enter reading 1 (systolic and diastolic).' };
        if (pairs.some(([s, d]) => bad('sys', s) || bad('dia', d))) return { ok: false, msg: 'A value is outside the possible range. Please measure again.' };
        if (pairs.some(([s, d]) => s <= d)) return { ok: false, msg: 'Systolic must be above diastolic. Please repeat the reading.' };
        const sys = Math.round(pairs.reduce((a, p) => a + p[0], 0) / pairs.length), dia = Math.round(pairs.reduce((a, p) => a + p[1], 0) / pairs.length);
        const rested = vals[4] !== 'No';
        const reason = reasonFor('bp'); const flags = manualFlags('bp', t, { rested });
        storeManual('bp', sys + '/' + dia, { reason, flags, extra: { sys, dia, rested, readings: pairs } });
        return { ok: true, msg: evaluateManual('bp', { sys, dia, rested }, { reason, flags }) + (pairs.length === 2 ? ' Average ' + sys + '/' + dia + '.' : '') };
      }
      if (id === 'core') { const x = P(vals[0]); if (bad('core', x)) return { ok: false, msg: 'Enter a temperature between 30 and 43 °C.' }; const reason = reasonFor('core'); const flags = manualFlags('core', t); storeManual('core', x, { reason, flags }); return { ok: true, msg: evaluateManual('core', x, { reason, flags }) }; }
      if (id === 'fspo2') { const x = P(vals[0]); if (bad('fspo2', x)) return { ok: false, msg: 'Enter SpO2 between 40 and 100 %.' }; storeManual('fspo2', x, { reason: reasonFor('fspo2'), flags: manualFlags('fspo2', t) }); return { ok: true, msg: evaluateManual('fspo2', x, { reason: reasonFor('fspo2'), flags: [] }) }; }
      if (id === 'mass') {
        const tr = [P(vals[0]), P(vals[1]), P(vals[2])].filter((x) => x != null);
        if (tr.length < 3 || tr.some((x) => bad('mass', x))) return { ok: false, msg: 'Enter the 3 trials to one decimal place.' };
        const sorted = tr.slice().sort((a, b) => a - b);
        if (sorted[2] - sorted[0] > 0.5) return { ok: false, msg: 'Two trials differ by more than 0.5 kg. Do one more trial and enter the last three.' };
        const avg = r1(tr.reduce((a, x) => a + x, 0) / 3);
        storeManual('mass', avg, { reason: reasonFor('mass'), flags: manualFlags('mass', t), extra: { trials: tr, note: 'avg of 3' } });
        return { ok: true, msg: evaluateManual('mass', avg, { reason: 'routine', flags: [] }) + ' Average ' + avg + ' kg.' };
      }
      if (id === 'vis') { const l = P(vals[0]), r = P(vals[1]); if ((l == null && r == null) || (l != null && bad('visl', l)) || (r != null && bad('visr', r))) return { ok: false, msg: 'Enter logMAR for each eye (−0.3 to 2).' }; storeManual('vis', (l ?? '–') + ' / ' + (r ?? '–'), { reason: reasonFor('vis') }); return { ok: true, msg: evaluateManual('vis', { l, r }, {}) }; }
      if (id === 'urine') { const m = { Normal: 'normal', Dark: 'dark', 'Low amount': 'low' }[vals[0]] || 'normal'; storeManual('urine', m, {}); return { ok: true, msg: evaluateManual('urine', m, {}) }; }
      if (id === 'fluid') { const x = P(vals[0]); if (bad('fluid', x) || x <= 0) return { ok: false, msg: 'Enter the drink in litres, e.g. 0.25.' }; S.trend.fluidToday = r1(S.trend.fluidToday + x); storeManual('fluid', x, { extra: { note: 'drink' } }); return { ok: true, msg: evaluateManual('fluid', x, {}) }; }
      if (id === 'mood') {
        const mood = P(vals[0]), stress = P(vals[1]);
        if ((mood != null && bad('mood', mood)) || (stress != null && bad('stress', stress)) || (mood == null && stress == null && vals[3] !== 'Yes')) return { ok: false, msg: 'Give a number from 0 to 10 for mood and stress.' };
        return { ok: true, msg: saveMental(mood, stress, vals[2], vals[3] === 'Yes', S.id), e16: vals[3] === 'Yes' };
      }
      if (id === 'ecg12' || id === 'us') { const m = vals[0] === 'Abnormal' ? 'abnormal' : 'normal'; storeManual(id, m, {}); return { ok: true, msg: evaluateManual(id, m, {}) }; }
      return { ok: false, msg: 'Unknown measurement.' };
    },

    /* Mental health self-help: choices are private and do not change any score or alert */
    mentalChoose(id) {
      const topic = C.MENTAL.find((m) => m.id === id); if (!topic) return null;
      S.db.mental.push({ id: uid('mh'), t: S.clock.t, kind: 'self-help', topic: topic.title, private: true, by: S.id, mode: S.mode.mode });
      return topic;
    },
    mentalTalk(topicId) {
      const topic = C.MENTAL.find((m) => m.id === topicId);
      message('medical', null, { text: 'Private talk requested by ' + S.id + (topic ? ' · about: ' + topic.title.toLowerCase() : ''), status: 'sent (simulated)' }, true);
      return 'Request sent privately to the flight doctor (simulated). Only medical can see it.';
    },
    mentalUnsafe() { return saveMental(null, null, null, true, S.id); },

    /* Crew Aid (13.3) */
    crewAidStart(entry) { S.crewAid = { entry: entry || 'crew', answers: {}, result: null, codes: [], text: '' }; },
    crewAidAnalyze(text) {
      const ca = S.crewAid; ca.text = text; ca.answers = {};
      const codes = matchText(text);
      const by = ca.entry === 'self' ? S.id : 'Crew mate (simulated)';
      S.db.crewAid.push({ id: uid('ca'), t: S.clock.t, helper: by, typed: text, matched: codes, private: codes.includes('self_harm') });
      if (!codes.length) { ca.result = 'ask'; ca.asked = true; ca.codes = []; emit('change'); return API.crewAidView(); }
      ca.asked = false;
      ca.codes = codes;
      addSymptoms(codes, by, 'crew aid');
      ca.result = 'done';
      emit('change');
      return API.crewAidView();
    },
    crewAidAnswer(qid, option) {
      const ca = S.crewAid; ca.answers[qid] = option;
      const by = ca.entry === 'self' ? S.id : 'Crew mate (simulated)';
      const map = { resp: { No: 'not_responding' }, breath: { 'Fast or noisy': 'laboured_breathing', 'Not breathing': 'not_breathing' }, chest: { Yes: 'chest_pain' } };
      S.db.crewAid.push({ id: uid('ca'), t: S.clock.t, helper: by, question: qid, answer: option });
      // wait until all three questions are answered, then act on the answers together
      if (ca.answers.resp && ca.answers.breath && ca.answers.chest) {
        const codes = Object.keys(map).map((q) => map[q][ca.answers[q]]).filter(Boolean);
        const fresh = codes.filter((c) => !ca.codes.includes(c));
        ca.codes = Array.from(new Set(ca.codes.concat(codes)));
        if (fresh.length) addSymptoms(fresh, by, 'crew aid question');
        ca.result = ca.codes.length ? 'done' : 'general';
      }
      emit('change');
      return API.crewAidView();
    },

    reminderDone(id) {
      const r = S.reminders.find((x) => x.id === id); if (!r) return;
      const occ = API.nextOccurrence(r, S.clock.t); if (!occ) return;
      r.done[occ.key] = true; S.db.reminderActions.push({ reminder: id, action: 'done', occurrence: occ.t, t: S.clock.t }); emit('change');
    },
    reminderSnooze(id) {
      const r = S.reminders.find((x) => x.id === id); if (!r) return;
      const occ = API.nextOccurrence(r, S.clock.t); if (!occ) return;
      const s = r.snooze[occ.key] || { count: 0 };
      if (s.count >= 2) return 'Snoozed twice already.';
      r.snooze[occ.key] = { count: s.count + 1, until: Math.max(S.clock.t, occ.t) + 10 * MIN };
      S.db.reminderActions.push({ reminder: id, action: 'snoozed', occurrence: occ.t, t: S.clock.t }); emit('change'); return null;
    },
    reminderDelete(id) {
      const r = S.reminders.find((x) => x.id === id); if (!r || r.type !== 'mine') return;
      r.deleted = true; S.db.reminderActions.push({ reminder: id, action: 'deleted', t: S.clock.t }); emit('change');
    },

    erase() { const id = S.id; delete store[id]; S = null; },

    /* ---------------- views for the screens ---------------- */
    nextOccurrence(r, t) {
      const sch = r.sched; const today = dayOf(t);
      if (sch.kind === 'interval') {
        for (let k = 0; k < 500; k++) {
          const ot = sch.first + k * (sch.every || 0);
          if (sch.until != null && ot > sch.until) return null;
          const key = String(k);
          if (!r.done[key]) { const sn = r.snooze[key]; return { t: sn ? sn.until : ot, key, due: (sn ? sn.until : ot) <= t }; }
          if (!sch.every) return null;
        }
        return null;
      }
      if (sch.kind === 'times') {
        for (let d = today; d <= today + 2; d++) for (const tm of sch.times.slice().sort((a, b) => a - b)) {
          const ot = d * DAY + tm; const key = String(ot);
          if (ot >= t - 5 * MIN && !r.done[key]) { const sn = r.snooze[key]; return { t: sn ? sn.until : ot, key }; }
        }
        return null;
      }
      if (sch.kind === 'weekly') {
        let ot = sch.first; while (ot < t - 5 * MIN || r.done[String(ot)]) ot += 7 * DAY;
        return { t: ot, key: String(ot) };
      }
      return null;
    },

    remindersView() {
      const t = S.clock.t; const out = { condition: [], daily: [], mine: [] };
      S.reminders.forEach((r) => {
        if (r.deleted) return;
        if (r.type === 'condition') { const ev = S.events.find((e) => e.id === r.event); if (!ev || ev.state === 'closed') return; }
        const occ = API.nextOccurrence(r, t); if (!occ) return;
        let text = r.text;
        if (r.rotate) { const rot = [['Aerobic', 30], ['Resistance', 30], ['High-intensity interval', 25]][dayOf(occ.t) % 3]; text = 'Exercise today: ' + rot[0] + ' for ' + rot[1] + ' min'; }
        const when = dayOf(occ.t) === dayOf(t) ? fmtHM(occ.t) : 'Day ' + dayOf(occ.t);
        const item = { id: r.id, when, t: occ.t, text, due: occ.t <= t, important: r.important, canSnooze: r.type === 'condition' && (!(r.snooze[occ.key]) || r.snooze[occ.key].count < 2), ev: r.event };
        out[r.type].push(item);
      });
      const evStart = (id) => { const ev = S.events.find((e) => e.id === id); return ev ? ev.started : 0; };
      out.condition.sort((a, b) => (evStart(b.ev) - evStart(a.ev)) || (a.t - b.t));
      out.daily.sort((a, b) => a.t - b.t); out.mine.sort((a, b) => a.t - b.t);
      const all = out.condition.concat(out.daily, out.mine).sort((a, b) => a.t - b.t);
      const next = all.find((x) => x.t >= t) || all[0];
      const todayCount = all.filter((x) => dayOf(x.t) === dayOf(t)).length;
      return Object.assign(out, { next, count: todayCount });
    },

    dashboardView() {
      const t = S.clock.t; const h = tod(t) / HOUR;
      const ctx = buildCtx(t);
      const vit = (k, d) => (ctx.v[k] == null ? 'No data' : (d != null ? Number(ctx.v[k]).toFixed(d) : ctx.v[k]));
      const ems = sortedEmergencies();
      let banner = null;
      const live = S.events.filter((e) => e.state !== 'closed' && !e.private).sort((a, b) => (b.level - a.level) || (b.started - a.started));
      if (ems.length) banner = { tone: 'emergency', text: 'Emergency · ' + ems[0].about, screen: 'emergency' };
      else if (live.length) { const e = live[0]; banner = { tone: e.level >= 2 ? 'alert' : 'watch', text: (e.state === 'monitoring' ? 'Monitoring' : e.level >= 2 ? 'Alert' : 'Watch') + ' · ' + e.about, screen: e.level >= 2 && e.state === 'act' ? 'alert' : 'records', event: e.id }; }
      return {
        greeting: h < 12 ? 'Good morning,' : h < 18 ? 'Good afternoon,' : 'Good evening,',
        name: S.name, id: S.id, day: dayOf(t), time: fmtHM(t), mode: S.mode.mode,
        vitals: { hr: vit('hr'), spo2: vit('spo2'), rr: vit('rr'), skin: vit('skin', 1) },
        due: API.checkupView().due, reminders: API.remindersView(), banner
      };
    },

    checkupView() {
      const t = S.clock.t; const today = dayOf(t);
      const lastOf = (keys) => S.db.measurements.filter((m) => keys.includes(m.key)).pop();
      const doneToday = (keys) => { const m = lastOf(keys); return m && dayOf(m.t) === today ? m : null; };
      const st = {};
      const bp = doneToday(['bp']); st.bp = bp ? ['Done ' + fmtHM(bp.t), 'done'] : ['Due now', 'due'];
      const core = doneToday(['core']); st.core = core ? ['Done ' + fmtHM(core.t), 'done'] : ['Due now', 'due'];
      const asked = (codes) => S.events.some((e) => codes.includes(e.code) && e.state !== 'closed');
      const fs = doneToday(['fspo2']); st.fspo2 = asked(['P5', 'E6']) && !fs ? ['Asked now', 'due'] : fs ? ['Done ' + fmtHM(fs.t), 'done'] : ['When asked', 'info'];
      const mass = lastOf(['mass']); const massDue = !mass || t - mass.t >= 7 * DAY - 12 * HOUR;
      st.mass = massDue ? ['Weekly · due', 'due'] : ['Weekly · Day ' + (dayOf(mass.t) + 7), 'info'];
      const vis = lastOf(['vis', 'visl']); const visDue = !vis || t - vis.t >= 7 * DAY - 12 * HOUR;
      st.vis = asked(['P3']) ? ['Asked now', 'due'] : visDue ? ['Weekly · due', 'due'] : ['Weekly · Day ' + (dayOf(vis.t) + 7), 'info'];
      const ur = doneToday(['urine']); st.urine = ur ? ['Done ' + fmtHM(ur.t), 'done'] : ['Due now', 'due'];
      st.fluid = [r1(S.trend.fluidToday) + ' of ' + fluidPlan() + ' L', 'info'];
      const md = S.db.mental.filter((m) => dayOf(m.t) === today).pop(); st.mood = md ? ['Done ' + fmtHM(md.t), 'done'] : tod(t) >= 18 * HOUR ? ['Due now', 'due'] : ['Due tonight', 'info'];
      st.ecg12 = asked(['P1', 'E2', 'E3']) ? ['Asked now', 'due'] : ['When asked', 'info'];
      st.us = ['When asked', 'info'];
      const due = Object.keys(st).filter((k) => st[k][1] === 'due').length;
      return { st, due, plan: fluidPlan() };
    },

    exerciseView() {
      const ex = S.mode.ex; const ctx = buildCtx(S.clock.t);
      const mx = ctx.hrmax; const hr = ctx.v.hr; const pct = hr != null ? Math.round(hr / mx * 100) : null;
      const zone = pct == null ? 'No data' : pct <= 63 ? 'Light (up to 63% of max)' : pct <= 76 ? 'Moderate (64–76% of max)' : pct <= 95 ? 'Vigorous (77–95% of max)' : 'Above 95% of max';
      const ceil = zoneCeilingPct();
      const elapsed = ex ? Math.max(0, S.clock.t - ex.start) : 0;
      const mmss = (ms) => pad(Math.floor(ms / MIN)) + ':' + pad(Math.floor(ms % MIN / SEC));
      const label = { aerobic: 'Aerobic', resistance: 'Resistance', high_intensity: 'High-intensity' };
      return {
        on: S.mode.mode === 'exercise',
        line: ex ? label[ex.type] + ' · ' + ex.intensity[0].toUpperCase() + ex.intensity.slice(1) + ' · ' + mmss(elapsed) + ' of ' + mmss(ex.planned * MIN) : 'Exercise Mode is off',
        hr: hr == null ? '--' : hr, spo2: ctx.v.spo2 == null ? 'No data' : ctx.v.spo2, rr: ctx.v.rr == null ? 'No data' : ctx.v.rr,
        skin: ctx.v.skin == null ? 'No data' : Number(ctx.v.skin).toFixed(1), act: ctx.v.act == null ? 'No data' : ctx.v.act,
        actLabel: ['still', 'light', 'moderate', 'vigorous'][ctx.v.act] || '',
        zone: 'Zone: ' + zone, pctText: (pct == null ? '--' : pct) + '% of max' + (ceil ? ' · ceiling ' + ceil + '%' : ' · resistance: 95% and maximum rules only'), pct,
        alerts: S.exAlerts.map((a) => { const ev = S.events.find((x) => x.id === a.event); const code = ev ? ev.code : 'P1'; return Object.assign({}, a, { time: fmtHM(a.t), steps: code === 'SENSOR' ? C.SENSOR_STEPS : ((C.PATTERNS[code] || {}).steps || []) }); }), hasL2: S.exAlerts.some((a) => a.level === 2)
      };
    },

    alertView(evId) {
      let ev = evId ? S.events.find((e) => e.id === evId) : null;
      if (!ev) ev = S.events.filter((e) => e.kind !== 'emergency' && e.level >= 2 && e.state !== 'closed').sort((a, b) => b.started - a.started)[0];
      if (!ev) ev = S.events.filter((e) => e.kind !== 'emergency' && e.level >= 2).sort((a, b) => b.started - a.started)[0];
      if (!ev) return null;
      const steps = ev.code === 'SENSOR' ? C.SENSOR_STEPS : (C.PATTERNS[ev.code] || {}).steps || [];
      let current = steps.findIndex((s, i) => !ev.stepsDone[i]); if (current < 0) current = steps.length;
      const val = ev.trigger.value;
      const remindersAdded = (ev.addedReminders || []).slice();
      return {
        id: ev.id, code: ev.code, about: ev.about, mode: ev.modeAtOnset, state: ev.state, level: ev.level,
        steps: steps.map((text, i) => ({ text, i, n: i + 1, done: !!ev.stepsDone[i], current: i === current, measure: /^Measure|eye test for each eye|Measure your vitals/i.test(text) })),
        foundValue: val == null ? '' : String(val), foundUnit: ev.trigger.unit || '', foundText: ev.trigger.desc, private: ev.private,
        reminders: remindersAdded, notified: ev.astronautOnly ? 'Shown to you only: crew and medical are not told for this result.' : 'Medical has been notified (simulated). This alert stays in Records › Events until it closes.',
        closed: ev.state === 'closed', paused: openEmergencyEvents().length > 0
      };
    },

    emergencyView() {
      const ep = S.episode; const ems = sortedEmergencies();
      if (!ep || !ems.length) return null;
      const real = nowReal(); const display = displayOf(ep, real);
      const queue = []; ems.forEach((ev) => { if (ev.code === 'E16' && ems.length > 1) return; stepsFor(ev, display).forEach((s) => queue.push(s)); });
      const e16 = ems.find((e) => e.code === 'E16'); if (e16 && ems.length > 1) stepsFor(e16, display).forEach((s) => queue.push(s));
      const current = queue.find((s) => !ep.shownDone[s.id] && !s.waiting) || null;
      const top = current ? current.ev : ems[0];
      const topSteps = queue.filter((s) => s.ev === top);
      const call = ep.calls[ep.calls.length - 1];
      const waitS = call ? Math.floor((real - call.real) / SEC) : 0;
      const someoneAnswered = ep.responded || ep.arrived;
      let status;
      if (ep.arrived) status = 'Crew is with you.';
      else if (ep.responded) status = 'On my way · Crew mate (simulated)';
      else status = 'Called: all crew · waiting ' + Math.floor(waitS / 60) + ':' + pad(waitS % 60);
      const ctx = buildCtx(S.clock.t);
      const vit = (k) => ctx.v[k];
      const also = ems.filter((e) => e !== top).map((e) => C.ALSO_LABEL[e.code]);
      const firstCall = ep.calls[0];
      return {
        top, code: top.code, about: top.about, private: top.private,
        topNote: top.code === 'E16' ? 'A trusted crew member is being asked to come.' : 'Other crew are informed. Waiting for a response.',
        displayLine: ep.arrived ? 'Crew is with you. Keep following the steps.' : display === 'B' ? 'The crew answered. These steps keep you safe until they arrive.' : display === 'wait' ? 'Waiting for the crew to answer. Start with this step.' : 'Nobody has answered yet, so these are the steps for you on your own until help comes.',
        header: 'Alarm on · crew called ' + (firstCall ? fmtHMS(firstCall.t) : fmtHMS(S.clock.t)) + ' · ' + (ep.arrived ? 'crew is with you' : ep.responded ? 'crew on the way' : 'nobody has arrived'),
        display, current, steps: topSteps.map((s) => ({ n: s.n, text: s.text, state: ep.shownDone[s.id] ? 'done' : current && s.id === current.id ? 'now' : 'next' })),
        num: current ? topSteps.indexOf(current) + 1 : topSteps.length, total: topSteps.length,
        staySafe: someoneAnswered ? 'Stay secured. Stay still. Breathe slowly. Help is coming.' : 'Stay secured. Stay still. Breathe slowly. Help is being called.',
        askOk: !!(ep.okAsk && !ep.okAsk.answered), okLeft: ep.okAsk ? Math.max(0, Math.ceil((ep.okAsk.deadline - real) / SEC)) : 0,
        vitals: { spo2: vit('spo2'), rr: vit('rr'), hr: vit('hr'), o2: vit('o2') },
        bad: { spo2: vit('spo2') != null && vit('spo2') < 95, rr: vit('rr') != null && (vit('rr') > 20 || vit('rr') < 10), hr: vit('hr') != null && (vit('hr') > 100 || vit('hr') < 50), o2: vit('o2') != null && (vit('o2') < 19.5 || vit('o2') > 23.5) },
        crewStatus: status, againNote: ep.againNote, searching: top.code === 'E18' || ems.some((e) => e.code === 'E18'),
        also: also.length ? 'Also active: ' + also.join(' · ') : '', alarm: !ep.arrived, modeAtOnset: ep.modeAtOnset
      };
    },

    crewAidView() {
      const ca = S.crewAid; const ems = sortedEmergencies(); const e18 = ems.find((e) => e.code === 'E18');
      let banner;
      if (e18) banner = { tone: 'red', title: 'SOS from ' + S.id, text: ' · cause not known · Node 2 · ' + fmtHM(e18.started), found: 'Found so far: ' + ((e18.findings && e18.findings.length) ? e18.findings.join(' · ') : 'nothing abnormal yet') };
      else if (ems.length) banner = { tone: 'red', title: 'Emergency for ' + S.id, text: ' · This is about: ' + ems[0].about + ' · Node 2 · ' + fmtHM(ems[0].started), found: 'Found so far: ' + (findings(buildCtx(S.clock.t)).join(' · ') || 'nothing else abnormal') };
      else banner = { tone: 'cyan', title: ca.entry === 'self' ? S.id + ' · reporting symptoms' : 'Helping ' + S.id, text: ca.entry === 'self' ? ' · describe what you feel' : ' · no alert open · Node 2 · ' + fmtHM(S.clock.t), found: 'Wearable now: ' + (findings(buildCtx(S.clock.t)).join(' · ') || 'nothing abnormal') };
      let about = 'Waiting for symptoms', steps = [], border = 'rgba(0,212,255,.3)';
      if (ca.result === 'done' || ca.result === 'general' || ca.result === 'ask') {
        const em = sortedEmergencies()[0];
        const relevantPatterns = S.events.filter((e) => e.kind !== 'emergency' && e.state !== 'closed' && ca.codes.some((c) => (C.SYMPTOM_SIGNS[c] || []).some(([p]) => p === e.code) || (c === 'dizziness' || c === 'near_fainting') && e.code === 'P1'));
        if (em && ca.result !== 'ask') {
          about = 'This is about: ' + em.about; border = '#FF5468';
          const B = em.code === 'E9' ? C.EMERGENCIES.E9[em.variant || 'hot'].B : C.EMERGENCIES[em.code].B;
          steps = ca.entry === 'self' ? [] : em.responder.concat(B.map((s) => 'Help them do this: "' + s + '"'));
        } else if (relevantPatterns.length && ca.result !== 'ask') {
          const p = relevantPatterns.sort((a, b) => b.level - a.level)[0];
          about = 'This is about: ' + p.about + ' · Level ' + p.level; border = '#FFB547';
          steps = (C.PATTERNS[p.code] || {}).steps || [];
        } else if (ca.result === 'general' || (ca.result === 'done')) {
          about = 'No clear match · general care'; border = '#FFB547';
          steps = ca.entry === 'self' ? C.GENERAL_SELF : C.GENERAL_STEPS;
        }
      }
      return {
        banner, text: ca.text, entry: ca.entry, asking: !!ca.asked, answers: ca.answers,
        about, steps, border, matched: ca.codes.map((c) => C.SYMPTOM_NAMES[c] || c), emergencyOpen: ems.length > 0
      };
    },

    /* Simulation body map: the condition of one organ from its current readings and open events */
    organView(organ) {
      const ctx = buildCtx(S.clock.t); const v = ctx.v; const rm = ctx.rm;
      const base = rm === 'sleep' ? ctx.SB : ctx.RB;
      const man = (k) => (S.man[k] ? S.man[k].v : null);
      const R = (name, value, unit, range, ok, note) => ({ name, value: value == null || value === '' ? 'No data' : value, unit: value == null || value === '' ? '' : unit, range, ok: value == null || value === '' ? null : ok, note: note || '' });
      const inR = (x, lo, hi) => x >= lo && x <= hi;
      const ORG = {
        lungs: { title: 'Lungs', codes: ['E6', 'E7', 'P5'], signals: ['spo2', 'fspo2', 'rr', 'apnea'], readings: () => {
          const spoLo = rm === 'sleep' ? 93 : rm === 'exercise' ? 94 : 95;
          const rr = rm === 'sleep' ? [10, 18] : rm === 'exercise' ? [12, 40] : [12, 20];
          return [
            R('SpO2 (wrist)', v.spo2, '%', spoLo + '% or more', v.spo2 >= spoLo),
            R('Breathing rate', v.rr, '/min', rr[0] + '–' + rr[1] + ' /min', inR(v.rr, rr[0], rr[1])),
            R('No breathing detected', v.apnea, 's', 'under 10 s', v.apnea < 10),
            R('Fingertip SpO2', man('fspo2'), '%', '95% or more', man('fspo2') >= 95, S.man.fspo2 ? 'measured ' + fmtDay(S.man.fspo2.t) : 'not measured yet')
          ]; } },
        heart: { title: 'Heart', codes: ['E1', 'E2', 'E3', 'P1'], signals: ['hr', 'ecg', 'pause', 'hrv', 'sys', 'dia'], readings: () => {
          const hr = rm === 'sleep' ? [40, 90] : rm === 'exercise' ? [50, Math.round(0.85 * ctx.hrmax)] : [50, 100];
          const sys = man('sys'), dia = man('dia');
          return [
            R('Heart rate', v.hr, 'bpm', hr[0] + '–' + hr[1] + ' bpm', inR(v.hr, hr[0], hr[1])),
            R('ECG rhythm', v.ecg == null ? null : v.ecg === 'irregular' ? 'Irregular' : 'Normal', '', 'Normal', v.ecg !== 'irregular'),
            R('ECG pause', v.pause, 's', 'up to ' + th('ecg.pause.l1') + ' s', v.pause <= th('ecg.pause.l1')),
            R('Heart-rate variability', v.hrv, 'ms', rm === 'exercise' ? 'lower during exercise' : 'about ' + base.hrv + ' ms (your baseline)', rm === 'exercise' || v.hrv >= base.hrv * 0.8),
            R('Blood pressure', sys != null && dia != null ? sys + '/' + dia : null, 'mmHg', 'under 140/90', sys < 140 && dia < 90 && sys >= 90, S.man.sys ? 'measured ' + fmtDay(S.man.sys.t) : 'not measured yet')
          ]; } },
        kidneys: { title: 'Kidneys', codes: ['P4', 'E14'], signals: ['fluid'], readings: () => {
          const plan = fluidPlan(); const pct = Math.round(S.trend.fluidToday / plan * 100);
          const u = S.trend.urineToday; const sys = man('sys'), dia = man('dia');
          return [
            R('Urine today', u == null ? null : { normal: 'Normal', dark: 'Dark', low: 'Low amount' }[u], '', 'Normal colour and amount', u === 'normal', u == null ? 'not entered today' : ''),
            R('Fluid intake today', r1(S.trend.fluidToday) + ' of ' + plan, 'L', '70% of the plan or more by evening', pct >= th('fluid.l1.pct') ? true : null, pct + '% of the plan so far · judged at the end of the day'),
            R('Blood pressure', sys != null && dia != null ? sys + '/' + dia : null, 'mmHg', 'under 140/90', sys < 140 && dia < 90 && sys >= 90, 'high blood pressure strains the kidneys')
          ]; } }
      };
      const o = ORG[organ]; if (!o) return null;
      const readings = o.readings();
      const events = openEvents().filter((e) => !e.private && (o.codes.includes(e.code) || (e.trigger && o.signals.includes(e.trigger.signal))))
        .sort((a, b) => b.level - a.level)
        .map((e) => ({ level: e.level, label: e.kind === 'emergency' ? 'Emergency' : e.level >= 2 ? 'Alert' : 'Watch', about: e.about, desc: (e.trigger && e.trigger.desc) || '' }));
      const off = readings.filter((r) => r.ok === false);
      let status;
      if (events.length) status = { level: events[0].level, label: events[0].label, text: events[0].desc || 'An open event is about this organ.' };
      else if (off.length) status = { level: 1, label: 'Check readings', text: off.map((r) => r.name).join(', ') + (off.length > 1 ? ' are' : ' is') + ' outside the typical range. No alert is open.' };
      else status = { level: 0, label: 'Normal', text: 'All readings are in the typical range for ' + ({ regular: 'Regular', sleep: 'Sleep', exercise: 'Exercise' }[rm]) + ' mode.' };
      return { organ, title: o.title, status, readings, events, mode: rm, clock: fmtDay(S.clock.t) };
    },

    nowView() {
      const ctx = buildCtx(S.clock.t); const last = S.db.sent[S.db.sent.length - 1];
      const rows = CONT.map((k) => {
        const x = ctx.v[k];
        let val = x == null ? 'No data' : typeof x === 'boolean' ? (x ? 'Yes' : 'No') : x;
        const dev = CHEST.includes(k) ? S.controls.chest : WRIST.includes(k) ? S.controls.wrist : 'working';
        return { name: NAMES[k], value: val, unit: x == null ? '' : (UNITS[k] || ''), device: DEVICE_OF[k], state: dev, validation: ctx.val[k] === 'valid' ? 'Valid' : ctx.val[k] === 'caution' ? 'Usable with caution' : 'Unavailable', quality: (CHEST.includes(k) || WRIST.includes(k)) ? (S.cur.quality == null ? 100 : S.cur.quality) : '' };
      });
      const man = Object.keys(S.man).map((k) => ({ name: NAMES[k] || k, value: S.man[k].v, unit: UNITS[k] || '', when: fmtDay(S.man[k].t), fresh: !!ctx.fresh[k] }));
      return { rows, man, mode: S.mode.mode, updated: last ? fmtDay(last.t) : 'start of session (default values)', clock: fmtDay(S.clock.t) };
    },

    historyView(filter) {
      const rows = [];
      const label = (k) => ({ bp: 'Blood pressure', vis: 'Visual acuity', mass: 'Body mass (SLAMMD)', fluid: 'Fluid intake', urine: 'Urine', core: 'Core temperature', fspo2: 'Fingertip SpO2', ecg12: '12-lead ECG', us: 'Ultrasound' }[k] || NAMES[k] || k);
      S.db.measurements.forEach((m) => {
        const flags = m.flags && m.flags.length ? ' · flagged: ' + m.flags.join(', ') : '';
        rows.push({ t: m.t, type: 'Measurement', item: label(m.key), value: (typeof m.value === 'string' ? m.value.charAt(0).toUpperCase() + m.value.slice(1) : (['mass', 'core', 'visl', 'visr', 'fluid'].includes(m.key) ? Number(m.value).toFixed(m.key === 'fluid' ? 2 : 1) : m.value)) + (m.unit ? ' ' + m.unit : '') + (m.note ? ' (' + m.note + ')' : '') + flags + (m.reason === 'detection' ? ' · asked by the app' : ''), by: m.by === 'You' || m.by === S.id ? 'You' : m.by, cat: 'm' });
      });
      S.db.sent.forEach((s) => {
        rows.push({ t: s.t, type: 'Measurement', item: 'Wearable and cabin values sent', value: 'HR ' + s.values.hr + ' · SpO2 ' + s.values.spo2 + ' · breathing ' + s.values.rr + ' · skin ' + s.values.skin + ' · activity ' + s.values.act + ' · quality ' + s.values.quality + ' (every 30-s reading is stored)', by: 'Chest patch, wrist device, cabin', cat: 'm' });
      });
      S.db.symptoms.forEach((s) => { if (s.private) return; rows.push({ t: s.t, type: 'Symptom', item: C.SYMPTOM_NAMES[s.code] || s.code, value: s.action === 'reported' ? 'Reported' : 'Marked gone', by: s.by === S.id ? 'You' : s.by, cat: 's' }); });
      (S.db.sleep || []).forEach((x) => rows.push({ t: x.t, type: 'Sleep', item: 'Night of sleep', value: x.duration + ' · ' + x.from + ' → ' + x.to + ' · ' + x.cycles + ' full cycle' + (x.cycles === 1 ? '' : 's'), by: 'You', cat: 'sleep' }));
      S.db.modes.forEach((m) => rows.push({ t: m.t, type: 'Mode', item: m.label, value: m.value || m.reason || '', by: m.by === 'astronaut' ? 'You' : 'Software', cat: 'mode' }));
      S.events.forEach((e) => {
        if (e.private) return;
        e.levels.forEach((l) => rows.push({ t: l.t, type: 'Event', item: (e.kind === 'emergency' ? 'Emergency' : l.level >= 2 ? 'Alert' : 'Watch') + ' · ' + e.about, value: (l.state === 'closed' ? 'Closed' : l.state === 'monitoring' ? 'Monitoring' : 'Level ' + l.level) + (e.run ? ' · simulated run' : ''), by: 'Software', cat: 'e', color: l.level >= 3 ? '#FF8A98' : '#FFD38F' }));
      });
      S.db.calls.forEach((c) => { if (c.private) return; rows.push({ t: c.t, type: 'Call', item: { auto_alert: 'Crew alerted', sos_button: 'SOS button', strong_tap: 'Strong tap', voice_command: 'Voice command', crew_not_arrived: 'The crew has not arrived' }[c.type] || c.type, value: c.recordedOnly ? 'Recorded only' : 'Sent to all crew (simulated)', by: c.type === 'auto_alert' ? 'Software' : 'You', cat: 'c' }); });
      S.db.responses.forEach((r) => rows.push({ t: r.t, type: 'Call', item: r.response === 'arrived' ? 'Crew arrived' : 'Crew answered "On my way"', value: r.seconds != null ? r.seconds + ' s after the call' : '', by: r.responder, cat: 'c' }));
      S.db.messages.forEach((m) => { if (m.private) return; rows.push({ t: m.t, type: 'Call', item: 'Message to ' + m.target, value: (m.content.status || m.status) + (m.content.summary ? ' · ' + m.content.summary : m.content.text ? ' · ' + m.content.text : ''), by: 'Software', cat: 'c' }); });
      const f = { all: null, m: 'm', s: 's', sleep: 'sleep', mode: 'mode', e: 'e', c: 'c' }[filter || 'all'];
      return rows.filter((r) => !f || r.cat === f).sort((a, b) => b.t - a.t).map((r) => Object.assign(r, { when: fmtDay(r.t) }));
    },

    past7View() {
      const today = dayOf(S.clock.t); const days = [];
      for (let d = today; d > today - 7; d--) {
        const hours = {};
        S.db.hourly.filter((x) => dayOf(x.t) === d).forEach((x) => { const h = Math.floor(tod(x.t) / HOUR); (hours[h] = hours[h] || []).push(x); });
        const avg = (arr, k) => { const v = arr.map((x) => x[k]).filter((y) => y != null); return v.length ? r1(v.reduce((a, y) => a + y, 0) / v.length) : 'No data'; };
        const hrs = Object.keys(hours).sort((a, b) => a - b).map((h) => ({ hour: pad(h) + ':00', hr: avg(hours[h], 'hr'), spo2: avg(hours[h], 'spo2'), rr: avg(hours[h], 'rr'), skin: avg(hours[h], 'skin'), n: hours[h].length }));
        const man = S.db.measurements.filter((m) => dayOf(m.t) === d).map((m) => fmtHM(m.t) + ' ' + ({ bp: 'Blood pressure', vis: 'Acuity', visl: 'Acuity left', visr: 'Acuity right', mass: 'Body mass', fluid: 'Drink', urine: 'Urine', core: 'Core', fspo2: 'Fingertip SpO2', ecg12: '12-lead ECG', us: 'Ultrasound' }[m.key] || m.key) + ' ' + m.value + (m.unit ? ' ' + m.unit : ''));
        days.push({ day: 'Day ' + d, hours: hrs, manual: man });
      }
      return days;
    },

    eventsView(includePrivate) {
      return S.events.filter((e) => includePrivate ? e.private : !e.private).slice().sort((a, b) => b.started - a.started).map((e) => {
        const logs = S.db.eventLog.filter((l) => l.event === e.id);
        const calls = S.db.calls.filter((c) => c.event === e.id);
        const msgs = S.db.messages.filter((m) => m.event === e.id);
        return {
          id: e.id, code: e.code, kind: e.kind, label: (e.kind === 'emergency' ? 'Emergency' : e.level >= 2 ? 'Alert' : e.level === 1 ? 'Watch' : 'Event') + ' · ' + e.about,
          start: fmtDay(e.started), end: e.closedAt ? fmtDay(e.closedAt) : (e.cautionUntil && e.state === 'monitoring' ? 'monitoring until ' + fmtDay(e.cautionUntil) : 'open'),
          state: e.state, level: e.level, mode: e.modeAtOnset, run: e.run ? 'Simulated run' : '',
          trigger: (e.trigger.desc || '') + (e.trigger.value != null && e.trigger.value !== '' ? ' · ' + e.trigger.value + ' ' + (e.trigger.unit || '') : '') + (e.trigger.device ? ' · ' + e.trigger.device : ''),
          first: e.first && e.first.value != null ? fmtDay(e.first.t) + ' · ' + e.first.value + ' ' + (UNITS[e.first.signal] || '') : '',
          levels: e.levels.map((l) => fmtDay(l.t) + ' · ' + (l.state === 'closed' ? 'Closed' : l.state === 'monitoring' ? 'Monitoring' : 'Level ' + l.level + ' (' + l.state + ')') + (l.why ? ' · ' + l.why : '')),
          log: logs.filter((l) => ['note', 'recheck', 'merged_into', 'reopened', 'closed'].includes(l.type)).map((l) => fmtDay(l.t) + ' · ' + (l.text || (l.type === 'recheck' ? 'Recheck' + (l.result ? ': ' + l.result : ' scheduled') : l.type === 'merged_into' ? 'Merged into ' + (S.events.find((x) => x.id === l.into) || {}).code : l.type === 'reopened' ? 'Opened again: ' + (l.why || '') : l.type === 'closed' ? 'Closed: ' + l.reason : l.type))),
          calls: calls.map((c) => fmtDay(c.t) + ' · ' + c.type.replace(/_/g, ' ') + (c.recordedOnly ? ' (recorded only)' : '')),
          messages: msgs.map((m) => fmtDay(m.t) + ' · to ' + m.target + ' · ' + (m.content.status || m.status) + (m.content.summary ? ' · ' + m.content.summary : m.content.text ? ' · ' + m.content.text : '')),
          steps: Object.keys(e.stepsDone).length, close: e.closeReason ? e.closeReason + (e.closedBy ? ' (' + e.closedBy + ')' : '') : '',
          responder: e.responder || null, handover: e.handover || null,
          caution: e.cautionUntil ? 'Monitoring until ' + fmtDay(e.cautionUntil) + (e.exerciseBlockedUntil > e.closedAt ? ' · Exercise Mode blocked until ' + fmtDay(e.exerciseBlockedUntil) + ' (recorded)' : '') : '',
          symptoms: S.db.symptoms.filter((s) => s.t >= e.started - MIN && (!e.closedAt || s.t <= e.closedAt) && (includePrivate || !s.private)).map((s) => fmtDay(s.t) + ' · ' + (C.SYMPTOM_NAMES[s.code] || s.code) + ' · ' + s.action.replace('_', ' ') + ' by ' + (s.by === S.id ? 'you' : s.by))
        };
      });
    },

    privateView() {
      return {
        mental: S.db.mental.slice().reverse().map((m) => ({ when: fmtDay(m.t), mood: m.mood == null ? '–' : m.mood, stress: m.stress == null ? '–' : m.stress, options: m.options.join(', ') || '–', unsafe: m.cannotStaySafe ? 'Yes' : 'No' })),
        events: API.eventsView(true),
        calls: S.db.calls.filter((c) => c.private).map((c) => fmtDay(c.t) + ' · ' + c.type.replace(/_/g, ' ')),
        messages: S.db.messages.filter((m) => m.private).map((m) => fmtDay(m.t) + ' · to ' + m.target + ' · ' + (m.content.text || m.content.summary || ''))
      };
    },

    simValues() {
      // current values as text, for the right section of the Simulation page
      const o = {};
      CONT.forEach((k) => { const x = S.cur[k]; o[k] = x == null ? '' : typeof x === 'boolean' ? (x ? 'Yes' : 'No') : k === 'ecg' ? (x === 'irregular' ? 'Irregular' : 'Normal') : String(x); });
      o.quality = String(S.cur.quality == null ? 100 : S.cur.quality);
      return o;
    },
    profileText() {
      const P = S.profile, B = S.base;
      return { agesex: P.age + ' · ' + P.sex, fitness: P.fitness[0].toUpperCase() + P.fitness.slice(1), mass: Number(P.mass).toFixed(1), sleepwake: P.bedtime + ' · ' + P.wake, fluid: String(P.fluidPlan), resthr: String(B.rest_hr), sleephr: B.sleep_hr + ' · ' + B.sleep_low, hrv: B.rest_hrv + ' · ' + B.sleep_hrv, rr: B.rest_rr + ' · ' + B.sleep_rr, spo2: B.rest_spo2 + ' · ' + B.sleep_spo2, bp: B.sys + '/' + B.dia, aerobic: String(B.aerobic_load_hr) };
    },
    clockText() { return fmtHMS(S.clock.t); }
  };

  global.Engine = API;
})(window);
