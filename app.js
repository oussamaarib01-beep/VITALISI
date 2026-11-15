/* =====================================================================
   Astronaut Health Monitor — screens (markup and styles from the design
   file "Astronaut Health App — Screen Designs", wired to engine.js)
   ===================================================================== */
(function () {
  'use strict';
  const E = window.Engine, C = window.CONTENT;
  const $app = document.getElementById('app');
  const $toasts = document.getElementById('toasts');

  const UI = {
    stack: ['login'], params: {}, running: false,
    login: { id: '', name: '', msg: '' },
    sim: { fields: {}, dur: '', caseKey: 'normal', filled: null, result: null, missing: null, open: {}, profileMsg: '', eraseStep: 0, voice: '' },
    checkup: { open: 'mass', vals: {}, msg: {} },
    crew: { text: '' },
    sleep: { bed: '', msg: '' },
    mental: { pick: null, msg: '' },
    records: { tab: 'history', filter: 'all' },
    confirmClose: false, alarmMuted: false
  };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cur = () => UI.stack[UI.stack.length - 1];

  /* ---------------- navigation ---------------- */
  function go(screen, params) {
    if (screen === 'simulation' && cur() !== 'simulation') { UI.sim.result = null; UI.sim.organ = null; }
    if (cur() !== screen) UI.stack.push(screen);
    UI.params[screen] = params || UI.params[screen] || {};
    UI.confirmClose = false;
    render(true);
  }
  function leaving(target) { if (cur() === 'simulation' && target !== 'simulation') E.endSimRun(); }
  function back() {
    if (UI.stack.length <= 2) { exit(); return; }
    const from = UI.stack.pop();
    if (from === 'simulation') E.endSimRun();
    while (UI.stack.length > 2 && UI.stack[UI.stack.length - 1] === from) UI.stack.pop();
    UI.confirmClose = false;
    render(true);
  }
  function exit() {
    leaving('dashboard');
    UI.stack = ['login', 'dashboard']; UI.confirmClose = false; render(true);
  }

  /* ---------------- shared pieces (copied from the design) ---------------- */
  const IC = {
    back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg>',
    exit: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"></path></svg>',
    x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg>',
    power: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0"></path></svg>',
    check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#03213A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Done"><path d="M5 12l5 5 9-10"></path></svg>',
    speaker: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"></path></svg>',
    trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"></path></svg>'
  };
  const BTN = 'display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 18px; border-radius: 12px; border: 1px solid rgba(0,212,255,.35); background: rgba(6,33,66,.65); color: #EAF6FF; text-decoration: none; font-size: 15px; font-weight: 500; cursor: pointer; font-family: Roboto, sans-serif';
  const retBtn = (style) => `<button type="button" data-act="back" style="${style || BTN}">${IC.back}Return</button>`;
  const exitBtn = (style) => `<button type="button" data-act="exit" style="${style || BTN}">${IC.exit}Exit</button>`;
  const sosSmall = () => `<button type="button" data-act="sos" aria-label="SOS" style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 50%; border: 0; background: #E8283F; color: #FFFFFF; font-size: 13px; font-weight: 900; box-shadow: 0 0 16px rgba(255,60,80,.5); cursor: pointer; font-family: Roboto, sans-serif">SOS</button>`;
  function header(title, opts) {
    opts = opts || {};
    return `<header style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 20px 32px">
      ${retBtn()}
      ${title}
      <div style="display: flex; align-items: center; gap: 12px">${opts.noSos ? '' : sosSmall()}${exitBtn()}</div>
    </header>`;
  }
  const h1 = (t) => `<h1 style="margin: 0; font-size: 24px; font-weight: 700">${esc(t)}</h1>`;

  const MODE_CHIP = {
    regular: ['rgba(46,230,182,.14)', 'rgba(46,230,182,.5)', '#7DF5D2', '#2EE6B6', 'Mode: Regular'],
    sleep: ['rgba(0,194,234,.14)', 'rgba(0,194,234,.55)', '#9FEFFF', '#00C2EA', 'Mode: Sleep'],
    exercise: ['rgba(0,212,255,.14)', 'rgba(0,212,255,.6)', '#BFF4FF', '#00D4FF', 'Mode: Exercise'],
    emergency: ['rgba(255,84,104,.2)', '#FF5468', '#FFD0D6', '#FF5468', 'Emergency state']
  };
  const chip = (bg, bd, col, dot, text, act) => `<span ${act ? 'data-act="' + act + '" class="clickable" role="button" tabindex="0"' : ''} style="display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 0 14px; border-radius: 999px; background: ${bg}; border: 1px solid ${bd}; color: ${col}; font-size: 14px; font-weight: 500"><span style="width: 8px; height: 8px; border-radius: 50%; background: ${dot}"></span>${esc(text)}</span>`;

  /* ---------------- screens ---------------- */
  const SCREENS = {};

  SCREENS.login = () => `
  <div class="loginbg" style="width: 100%; min-height: 100vh; box-sizing: border-box; position: relative; overflow: hidden; font-family: Roboto, system-ui, sans-serif; color: #FFFFFF; display: flex; flex-direction: column">
    <header style="display: flex; justify-content: flex-end; padding: 20px 32px">
      <button type="button" data-act="login-exit" style="${BTN}; background: rgba(4,40,70,.55)">${IC.x}Exit</button>
    </header>
    <main style="flex-grow: 1; display: flex; align-items: center; justify-content: center; padding: 24px 24px 80px">
      <form data-form="login" style="position: relative; width: 100%; max-width: 440px; box-sizing: border-box; padding: 34px 48px 86px; border-radius: 36px; background: rgba(10,62,92,.55); border: 1.5px solid rgba(40,170,210,.55); box-shadow: 0 0 40px rgba(0,150,220,.25), inset 0 0 60px rgba(0,120,180,.15); backdrop-filter: blur(6px); display: flex; flex-direction: column; align-items: center; gap: 34px">
        <h1 style="margin: 0; font-size: 26px; font-weight: 500; letter-spacing: .5px">LOGIN</h1>
        <div style="width: 100%; display: flex; flex-direction: column; gap: 30px; margin-top: 18px">
          <input type="text" inputmode="numeric" maxlength="${C.SERIAL_DIGITS}" data-field="login.id" value="${esc(UI.login.id)}" aria-label="Serial number, ${C.SERIAL_DIGITS} digits" aria-describedby="serial-hint" placeholder="Serial number (${C.SERIAL_DIGITS} digits)" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" style="width: 100%; box-sizing: border-box; min-height: 48px; padding: 0 16px; border-radius: 6px; border: 0; background: #044A72; color: #FFFFFF; text-align: center; font-family: 'Roboto Mono', monospace; font-size: 17px; font-weight: 500">
          <p id="serial-hint" role="status" style="margin: -22px 0 0; font-size: 12px; color: #9FC6DD; text-align: center">${UI.login.id.length} / ${C.SERIAL_DIGITS} digits · numbers only</p>
          <input type="text" data-field="login.name" value="${esc(UI.login.name)}" aria-label="First and last name" placeholder="First/Last Name" autocomplete="off" style="width: 100%; box-sizing: border-box; min-height: 48px; padding: 0 16px; border-radius: 6px; border: 0; background: #044A72; color: #FFFFFF; text-align: center; font-family: 'Roboto Mono', monospace; font-size: 17px; font-weight: 500">
          ${UI.login.msg ? `<p role="alert" style="margin: -14px 0 0; font-size: 13px; color: #FFD38F; text-align: center">${esc(UI.login.msg)}</p>` : ''}
        </div>
        <button type="submit" style="position: absolute; left: 50%; bottom: -22px; transform: translateX(-50%); display: inline-flex; align-items: center; justify-content: center; min-height: 48px; width: 210px; border-radius: 8px; border: 0; background: #00D7FF; color: #04223A; font-family: 'Roboto Mono', monospace; font-size: 17px; font-weight: 700; letter-spacing: .5px; cursor: pointer">LOG IN</button>
      </form>
    </main>
  </div>`;

  SCREENS.dashboard = () => {
    const d = E.dashboardView();
    const mc = MODE_CHIP[d.mode];
    const ban = d.banner;
    const banChip = ban ? (ban.tone === 'emergency' ? chip('rgba(255,84,104,.2)', '#FF5468', '#FFD0D6', '#FF5468', ban.text, 'banner') : chip('rgba(255,181,71,.15)', '#FFB547', '#FFD38F', '#FFB547', ban.text, 'banner')) : '';
    const tile = (act, border, icon, title, sub, extra, dashed) => `<button type="button" class="tile" data-act="${act}" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left; gap: 14px; padding: 22px; min-height: 150px; box-sizing: border-box; border-radius: 20px; background: rgba(8,38,66,.7); border: 1px ${dashed ? 'dashed' : 'solid'} ${border}; color: #EAF6FF; cursor: pointer; position: relative; font-family: Roboto, sans-serif">${icon}<span style="font-size: 20px; font-weight: 700">${title}</span><span data-live="${act}-sub" style="font-size: 13px; color: #B8D4E6">${sub}</span>${extra || ''}</button>`;
    const svg = (paths, stroke) => `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="${stroke || '#00D4FF'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
    const rem = d.reminders;
    const vit = (label, v, u) => `<div><p style="margin: 0; font-size: 12px; color: #B8D4E6">${label}</p><p style="margin: 2px 0 0; font-family: 'Roboto Mono', monospace; font-size: 22px; font-weight: 700">${esc(v)} ${v === 'No data' ? '' : `<span style="font-size: 13px; color: #00D4FF">${u}</span>`}</p></div>`;
    return `
  <div class="space" style="width: 100%; min-height: 100vh; box-sizing: border-box; font-family: Roboto, system-ui, sans-serif; color: #EAF6FF; display: flex; flex-direction: column">
    <header style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 20px 32px">
      <img src="assets/img/logo-vplus.png" alt="V+" width="53" height="36" style="display: block; height: 36px; width: auto; opacity: .95">
      <div data-live="dash-top" style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap">
        ${chip(mc[0], mc[1], mc[2], mc[3], mc[4], d.mode === 'sleep' ? 'tile-sleep' : d.mode === 'exercise' ? 'tile-exercise' : d.mode === 'emergency' ? 'banner' : null)}
        ${banChip}
        <span style="font-family: 'Roboto Mono', monospace; font-size: 15px; color: #B8D4E6">${esc(d.id)} · Day ${d.day} · ${d.time}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 10px">
        <button type="button" data-act="logout" style="${BTN}; border: 1px solid rgba(255,181,71,.6); background: rgba(40,28,8,.55); color: #FFD38F; font-weight: 700">${IC.power}Log out</button>
        ${exitBtn()}
      </div>
    </header>
    <main style="flex-grow: 1; width: 100%; max-width: 1180px; margin: 0 auto; box-sizing: border-box; padding: 8px 32px 36px; display: flex; flex-wrap: wrap; gap: 28px; align-items: stretch">
      <section style="flex: 1 1 300px; display: flex; flex-direction: column; gap: 20px">
        <div>
          <p data-live="greet" style="margin: 0; font-size: 15px; color: #B8D4E6">${d.greeting}</p>
          <h1 style="margin: 4px 0 0; font-size: 32px; font-weight: 700">${esc(d.name)}</h1>
        </div>
        <button type="button" data-act="sos" aria-label="SOS: call the crew now" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; width: 210px; height: 210px; align-self: center; border-radius: 50%; border: 0; cursor: pointer; background: radial-gradient(circle at 40% 35%, #FF7A88 0%, #E8283F 55%, #A3101F 100%); box-shadow: 0 0 0 10px rgba(255,84,104,.18), 0 0 50px rgba(255,60,80,.55); color: #FFFFFF; font-family: Roboto, sans-serif">
          <span style="font-size: 54px; font-weight: 900; letter-spacing: 4px">SOS</span>
          <span style="font-size: 14px; font-weight: 500">Press to call the crew</span>
        </button>
        <p style="margin: 0; text-align: center; font-size: 13px; color: #B8D4E6; line-height: 1.5">Stands for the physical SOS button.<br>Strong tap or saying "SOS" also works.</p>
        <div data-live="vitals" style="border-radius: 18px; background: rgba(8,38,66,.7); border: 1px solid rgba(0,212,255,.22); padding: 16px 18px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px">
          ${vit('Heart rate', d.vitals.hr, 'bpm')}${vit('SpO2', d.vitals.spo2, '%')}${vit('Breathing', d.vitals.rr, '/min')}${vit('Skin temp', d.vitals.skin, '°C')}
        </div>
      </section>
      <nav aria-label="Main" style="flex: 999 1 560px; min-width: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 18px; align-content: start">
        <button type="button" class="tile" data-act="tile-checkup" style="grid-column: 1 / -1; display: flex; align-items: center; text-align: left; gap: 20px; padding: 22px 24px; box-sizing: border-box; border-radius: 20px; background: rgba(0,212,255,.14); border: 1px solid rgba(0,212,255,.6); color: #EAF6FF; cursor: pointer; font-family: Roboto, sans-serif">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"></rect><path d="M9 4V3h6v1M12 16.5s-3-1.8-3-3.8a1.6 1.6 0 0 1 3-.8 1.6 1.6 0 0 1 3 .8c0 2-3 3.8-3 3.8z"></path></svg>
          <span style="display: flex; flex-direction: column; gap: 4px; flex: 1 1 auto"><span style="font-size: 22px; font-weight: 700">Daily Check-Up</span><span style="font-size: 14px; color: #B8D4E6">Enter what you measured today: blood pressure, temperature, body mass, eyes, urine, drinks, mood</span></span>
          <span data-live="due" style="display: inline-flex; align-items: center; min-height: 32px; padding: 0 12px; white-space: nowrap; border-radius: 999px; ${d.due ? 'background: #FFB547; color: #2A1A00' : 'background: rgba(46,230,182,.2); color: #7DF5D2'}; font-size: 13px; font-weight: 700">${d.due ? d.due + ' due' : 'All done'}</span>
        </button>
        ${tile('tile-sleep', 'rgba(0,212,255,.25)', svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"></path><path d="M17 3l.6 1.4L19 5l-1.4.6L17 7l-.6-1.4L15 5l1.4-.6z"></path>'), 'Sleep', d.mode === 'sleep' ? 'Sleep mode on · tap to open' : 'Tap to start sleep mode')}
        ${tile('tile-exercise', 'rgba(0,212,255,.25)', svg('<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"></path>'), 'Exercise', d.mode === 'exercise' ? 'Exercise mode on · tap to open' : 'Type, intensity, minutes')}
        ${tile('tile-crewaid', 'rgba(46,230,182,.45)', svg('<circle cx="8" cy="6" r="2.5"></circle><circle cx="16.5" cy="7.5" r="2.5"></circle><path d="M3.5 20v-3a4.5 4.5 0 0 1 9 0v3M13 20v-2.5a3.5 3.5 0 0 1 7 0V20"></path><path d="M12 11.5h3"></path>', '#2EE6B6'), 'Crew Aid', 'Help a crew mate in need')}
        ${tile('tile-mental', 'rgba(156,140,255,.5)', svg('<circle cx="12" cy="12" r="9"></circle><path d="M8.5 14.5c.9 1.1 2.1 1.7 3.5 1.7s2.6-.6 3.5-1.7"></path><path d="M9 9.5h.01M15 9.5h.01"></path>', '#9C8CFF'), 'Mental Health', 'How you feel · what can help')}
        ${tile('tile-records', 'rgba(0,212,255,.25)', svg('<path d="M3 3v18h18"></path><path d="M7 15l4-4 3 3 5-6"></path>'), 'Records', 'Now, history, events')}
        ${tile('tile-reminders', 'rgba(0,212,255,.25)', svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"></path>'), 'Reminders', rem.next ? 'Next: ' + esc(rem.next.text.split(' · ')[0]) + ' · ' + esc(rem.next.when) : 'Nothing planned', `<span data-live="remcount" style="position: absolute; top: 18px; right: 18px; min-width: 26px; height: 26px; border-radius: 13px; background: #00D4FF; color: #03213A; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center">${rem.count}</span>`)}
        ${tile('tile-simulation', 'rgba(0,212,255,.5)', svg('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"></path>'), 'Simulation', 'Enter values and run a test case', '', true)}
      </nav>
    </main>
  </div>`;
  };

  function sleepPanel(bed, nowMs) {
    if (!bed) return '<p style="margin: 0; font-size: 16px; color: #E0F2FC">Bedtime not set</p>';
    const c = sleepCycle(bed, nowMs); const p2 = (x) => String(x).padStart(2, '0');
    const sec = Math.floor((nowMs - bed) / 1000);
    const box = (x) => `<span style="display: flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 10px; border: 1px solid rgba(46,230,182,.55); background: rgba(4,22,40,.7); font-family: 'Roboto Mono', monospace; font-size: 24px; font-weight: 700; color: #CFF7EA">${x}</span>`;
    const colon = '<span style="font-family: \'Roboto Mono\', monospace; font-size: 24px; font-weight: 700; color: #2EE6B6">:</span>';
    const timer = [p2(Math.floor(sec / 3600)), p2(Math.floor(sec / 60) % 60), p2(sec % 60)].map(box).join(colon);
    const bars = c.wake.map((w, i) => {
      const fill = w.past ? 100 : (i + 1 === c.n ? c.into / CYCLE_MIN * 100 : 0);
      return `<div title="Cycle ${w.n}" style="flex: 1 1 0; height: 12px; border-radius: 6px; background: rgba(255,255,255,.08); overflow: hidden; ${i + 1 === c.n ? 'outline: 1px solid #00C2EA; outline-offset: 2px' : ''}"><div style="width: ${fill.toFixed(1)}%; height: 100%; background: ${w.past ? '#2EE6B6' : '#00C2EA'}"></div></div>`;
    }).join('');
    const wakes = c.wake.map((w) => `<span style="padding: 2px 8px; border-radius: 999px; font-family: 'Roboto Mono', monospace; font-size: 13px; ${w.past ? 'color: #6F8CA3; text-decoration: line-through' : 'color: #E0F2FC; background: rgba(0,194,234,.14)'}">${E.realHM(w.t)}</span>`).join('');
    const status = c.done
      ? `All ${CYCLES} cycles done (${E.realDuration(CYCLES * CYCLE_MIN * 60000)}) · a good time to wake up`
      : `Cycle <strong>${c.n} of ${CYCLES}</strong> · ${esc(c.stage)} · ${Math.ceil(c.left)} min left in this cycle`;
    return `<p style="margin: 0; font-size: 15px; color: #9DBAD0">Went to sleep at <strong style="color: #E0F2FC">${E.realHM(bed)}</strong></p>
        <span style="font-size: 13px; letter-spacing: 1px; color: #9DBAD0">ASLEEP FOR</span>
        <div role="timer" aria-label="Asleep for ${Math.floor(sec / 3600)} hours ${Math.floor(sec / 60) % 60} minutes" style="display: flex; gap: 6px; align-items: center">${timer}</div>
        <p style="margin: 0; font-size: 15px; color: #CFE6F5; text-align: center">${status}</p>
        <div role="img" aria-label="Sleep cycle ${Math.min(c.n, CYCLES)} of ${CYCLES}" style="width: 100%; display: flex; gap: 6px">${bars}</div>
        <div style="display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 6px"><span style="font-size: 13px; color: #9DBAD0">Good times to wake (end of a cycle):</span>${wakes}</div>
        <p style="margin: 0; font-size: 12px; color: #6F8CA3; text-align: center">Estimated from the time since bedtime (90-minute cycles), not measured.</p>`;
  }

  /* Sleep cycles: estimated from time since bedtime (90-min cycles, 5 per night), not measured.
     Later cycles have less deep sleep and more REM. */
  const CYCLE_MIN = 90, CYCLES = 5;
  function sleepCycle(bed, nowMs) {
    const mins = Math.max(0, (nowMs - bed) / 60000);
    const n = Math.floor(mins / CYCLE_MIN) + 1;
    const into = mins % CYCLE_MIN;
    const k = Math.min(n, CYCLES);
    const rem = Math.min(30, 10 + 5 * (k - 1)), deep = Math.max(5, 30 - 7 * (k - 1)), light = 5, n2 = (CYCLE_MIN - light - deep - rem) / 2;
    const stages = [['Light sleep (falling asleep)', light], ['Light sleep', n2], ['Deep sleep', deep], ['Light sleep', n2], ['REM sleep (dreaming)', rem]];
    let acc = 0, stage = stages[4][0];
    for (const [name, len] of stages) { if (into < acc + len) { stage = name; break; } acc += len; }
    const wake = []; for (let i = 1; i <= CYCLES; i++) wake.push({ n: i, t: bed + i * CYCLE_MIN * 60000, past: mins >= i * CYCLE_MIN });
    return { mins, n, into, left: CYCLE_MIN - into, stage, done: n > CYCLES, wake };
  }

  SCREENS.sleep = () => {
    const now = new Date(); const p2 = (n) => String(n).padStart(2, '0');
    const t = [p2(now.getHours()), p2(now.getMinutes()), p2(now.getSeconds())]; // real local time, not the simulated clock
    const day = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    const on = E.state.mode.mode === 'sleep'; const bed = on ? E.state.mode.bedtime : null;
    const sbtn = 'display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 16px; border-radius: 12px; border: 1px solid rgba(0,212,255,.22); background: rgba(4,22,40,.6); color: #B8D4E6; font-size: 14px; cursor: pointer; font-family: Roboto, sans-serif';
    return `
  <div class="night" style="width: 100%; min-height: 100vh; box-sizing: border-box; font-family: Roboto, system-ui, sans-serif; color: #CFE6F5; display: flex; flex-direction: column">
    <header style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 20px 32px">
      ${retBtn(sbtn)}
      <div style="display: flex; align-items: center; gap: 12px">
        <button type="button" data-act="sos" aria-label="SOS" style="display: inline-flex; align-items: center; justify-content: center; width: 46px; height: 46px; border-radius: 50%; border: 0; background: #9E1A2B; color: #FFE3E7; font-size: 13px; font-weight: 900; cursor: pointer; font-family: Roboto, sans-serif">SOS</button>
        ${exitBtn(sbtn)}
      </div>
    </header>
    <main style="flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; padding: 24px">
      <svg width="110" height="110" viewBox="0 0 24 24" fill="none" stroke="#00C2EA" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Sleep mode"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"></path><path d="M17 2.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z"></path><path d="M13.5 7.5l.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5z"></path></svg>
      <div data-live="sleep-time" role="timer" aria-live="off" style="display: flex; flex-direction: column; align-items: center; gap: 10px">
        <div style="display: flex; gap: 8px; align-items: center">
          <span style="display: flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 10px; border: 1px solid rgba(0,194,234,.55); background: rgba(4,22,40,.7); font-family: 'Roboto Mono', monospace; font-size: 30px; font-weight: 700; color: #E0F2FC">${t[0]}</span><span style="font-family: 'Roboto Mono', monospace; font-size: 30px; font-weight: 700; color: #00C2EA">:</span>
          <span style="display: flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 10px; border: 1px solid rgba(0,194,234,.55); background: rgba(4,22,40,.7); font-family: 'Roboto Mono', monospace; font-size: 30px; font-weight: 700; color: #E0F2FC">${t[1]}</span><span style="font-family: 'Roboto Mono', monospace; font-size: 30px; font-weight: 700; color: #00C2EA">:</span>
          <span style="display: flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 10px; border: 1px solid rgba(0,194,234,.55); background: rgba(4,22,40,.7); font-family: 'Roboto Mono', monospace; font-size: 30px; font-weight: 700; color: #E0F2FC">${t[2]}</span>
        </div>
        <span style="font-size: 14px; color: #9DBAD0">${esc(day)}</span>
      </div>
      <p style="margin: 0; font-size: 15px; color: #9DBAD0">${on ? 'Sleep mode on · monitoring quietly · reminders silent' : 'Sleep mode is off'}</p>
      ${on ? `<div style="display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 14px 18px; border-radius: 16px; background: rgba(4,22,40,.6); border: 1px solid rgba(0,194,234,.3)">
        <div data-live="sleep-bed" aria-live="off" style="width: min(520px, 100%); display: flex; flex-direction: column; align-items: center; gap: 10px">${sleepPanel(bed, now.getTime())}</div>
        <div style="display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 10px">
          <label for="bedtime" style="font-size: 14px; color: #9DBAD0">Time you went to sleep</label>
          <input id="bedtime" type="time" data-field="sleep.bed" value="${esc(UI.sleep.bed || E.realHM(bed || now.getTime()))}" style="min-height: 44px; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(0,194,234,.55); background: rgba(4,22,40,.8); color: #E0F2FC; font-family: 'Roboto Mono', monospace; font-size: 16px; color-scheme: dark">
          <button type="button" data-act="sleep-bed-save" style="min-height: 44px; padding: 0 20px; border-radius: 22px; border: 1px solid rgba(0,194,234,.55); background: rgba(0,194,234,.18); color: #E0F2FC; font-size: 15px; font-weight: 700; cursor: pointer; font-family: Roboto, sans-serif">Set bedtime</button>
        </div>
        ${UI.sleep.msg ? `<p role="status" style="margin: 0; font-size: 13px; color: #9FEFFF">${esc(UI.sleep.msg)}</p>` : ''}
      </div>` : ''}
      <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 16px; margin-top: 18px">
        <button type="button" data-act="crewaid-crew" style="display: inline-flex; align-items: center; gap: 10px; min-height: 52px; padding: 0 24px; border-radius: 26px; border: 1px solid rgba(46,230,182,.6); background: rgba(46,230,182,.12); color: #CFF7EA; font-size: 16px; font-weight: 500; cursor: pointer; font-family: Roboto, sans-serif">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2EE6B6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="6" r="2.5"></circle><circle cx="16.5" cy="7.5" r="2.5"></circle><path d="M3.5 20v-3a4.5 4.5 0 0 1 9 0v3M13 20v-2.5a3.5 3.5 0 0 1 7 0V20"></path></svg>Crew Aid</button>
        <button type="button" data-act="${on ? 'awake' : 'tile-sleep'}" style="display: inline-flex; align-items: center; justify-content: center; min-height: 52px; padding: 0 26px; border-radius: 26px; border: 1px solid rgba(0,194,234,.55); background: rgba(0,194,234,.12); color: #E0F2FC; font-size: 16px; font-weight: 500; cursor: pointer; font-family: Roboto, sans-serif">${on ? "I'm awake · end sleep mode" : 'Start sleep mode'}</button>
      </div>
      <p style="margin: 0; max-width: 520px; text-align: center; font-size: 13px; line-height: 1.5; color: #8FAEC4">Crew Aid stays here so you can help a crew mate right away, without turning sleep mode off first. Return goes to the dashboard and sleep mode keeps running.</p>
    </main>
  </div>`;
  };

  SCREENS.exercise = () => {
    const x = E.exerciseView();
    const card = (label, v, u) => `<div style="border-radius: 16px; background: rgba(8,38,66,.7); border: 1px solid rgba(0,212,255,.22); padding: 14px 18px"><p style="margin: 0; font-size: 13px; color: #B8D4E6">${label}</p><p style="margin: 4px 0 0; font-family: 'Roboto Mono', monospace; font-size: 26px; font-weight: 700">${esc(v)} ${v === 'No data' ? '' : `<span style="font-size: 14px; color: #00D4FF">${u}</span>`}</p></div>`;
    const ecg = (side) => `<canvas class="ecg-strip" data-keep="ecg-${side}" data-ecg="${side}" aria-hidden="true" style="flex: 1 1 0; min-width: 0; height: 60px; display: block"></canvas>`;
    const hasHr = typeof x.hr === 'number';
    const alerts = x.alerts.length ? x.alerts.map((a) => a.level === 2 ? `
        <div style="display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 12px; background: rgba(255,181,71,.18); border: 2px solid #FFB547">
          <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px">
            <span style="font-family: 'Roboto Mono', monospace; font-size: 14px; font-weight: 700; color: #FFD38F">${a.time}</span>
            <span style="display: inline-flex; align-items: center; min-height: 26px; padding: 0 10px; border-radius: 999px; background: #FFB547; color: #2A1A00; font-size: 12px; font-weight: 700">Level 2</span>
            <span style="flex: 1 1 260px; font-size: 15px; font-weight: 500">${esc(a.text)}</span>
          </div>
          <ol style="margin: 0; padding: 0 0 0 22px; font-size: 14px; line-height: 1.5; color: #FFE7C2">${a.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        </div>` : `
        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; background: rgba(255,181,71,.12); border: 1px solid rgba(255,181,71,.55)">
          <span style="font-family: 'Roboto Mono', monospace; font-size: 14px; font-weight: 700; color: #FFD38F">${a.time}</span>
          <span style="display: inline-flex; align-items: center; min-height: 26px; padding: 0 10px; border-radius: 999px; background: #FFB547; color: #2A1A00; font-size: 12px; font-weight: 700">Level 1</span>
          <span style="flex: 1 1 260px; font-size: 15px">${esc(a.text)}</span>
        </div>`).join('') : '<p style="margin: 0; font-size: 14px; color: #B8D4E6">No alerts yet this session.</p>';
    const marker = x.pct == null ? '' : `<span style="position: absolute; top: -3px; left: calc(${Math.min(100, Math.max(0, x.pct))}% - 1px); width: 3px; height: 16px; border-radius: 2px; background: #FFFFFF; box-shadow: 0 0 6px #FFFFFF"></span>`;
    return `
  <div class="space" style="width: 100%; min-height: 100vh; box-sizing: border-box; font-family: Roboto, system-ui, sans-serif; color: #EAF6FF; display: flex; flex-direction: column">
    ${header('<h1 style="margin: 0; font-size: 30px; font-weight: 700; letter-spacing: 3px; color: #FFFFFF">EXERCISE MODE</h1>')}
    <p data-live="ex-line" style="margin: 0 auto 6px; font-size: 15px; color: #B8D4E6">${esc(x.line)}</p>
    <main data-live="ex-main" style="flex-grow: 1; width: 100%; max-width: 1120px; margin: 0 auto; box-sizing: border-box; padding: 8px 32px 36px; display: flex; flex-direction: column; gap: 18px">
      <section aria-label="Live vitals" style="border-radius: 22px; background: rgba(8,38,66,.6); border: 1px solid rgba(0,212,255,.3); padding: 24px 0 28px; display: flex; flex-direction: column; align-items: center; gap: 10px">
        <h2 style="margin: 0; font-size: 22px; font-weight: 500; letter-spacing: 1px">LIVE VITALS</h2>
        <div class="ecg-row" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px">
          ${ecg('l')}
          <div style="display: flex; flex-direction: column; align-items: center">
            <span style="font-size: 112px; line-height: 1; font-weight: 700; color: #E6F6FF">${esc(x.hr)}</span>
            <span style="font-size: 22px; font-weight: 700; color: #00D4FF">BPM</span>
            <span style="font-size: 20px; font-weight: 300; letter-spacing: 1px">HEART RATE</span>
          </div>
          <svg data-keep="ex-heart" data-ecg-heart width="90" height="80" viewBox="0 0 24 22" fill="none" stroke="#00D4FF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex: 0 0 auto; transform-origin: 50% 50%"><path d="M12 20.5S2.5 14.5 2.5 7.8A4.8 4.8 0 0 1 12 5.6a4.8 4.8 0 0 1 9.5 2.2c0 6.7-9.5 12.7-9.5 12.7z"></path><path d="M4.5 11.5h4l1.5-3 2.5 6 1.5-3h5.5"></path></svg>
          ${ecg('r')}
        </div>
        <p style="margin: 0; padding: 0 16px; font-size: 12px; color: #8FAEC4; text-align: center">${hasHr ? 'Illustrative ECG trace, paced to the measured heart rate · not a diagnostic ECG' : 'Demo trace · no heart-rate data · not a measurement'}</p>
        <div style="width: 70%; min-width: 280px; display: flex; flex-direction: column; gap: 6px; margin-top: 8px">
          <div style="display: flex; justify-content: space-between; font-size: 13px; color: #B8D4E6"><span>${esc(x.zone)}</span><span>${esc(x.pctText)}</span></div>
          <div style="position: relative"><div style="height: 10px; border-radius: 5px; background: rgba(255,255,255,.1); display: grid; grid-template-columns: 63fr 13fr 24fr; overflow: hidden">
            <span style="background: rgba(46,230,182,.45)"></span><span style="background: #00D4FF"></span><span style="background: rgba(255,181,71,.35)"></span>
          </div>${marker}</div>
        </div>
      </section>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px">
        ${card('SpO2', x.spo2, '%')}${card('Breathing', x.rr, '/min')}${card('Skin temperature', x.skin, '°C')}${card('Activity', x.act, x.actLabel)}
      </div>
      <section aria-label="Alerts this session" style="border-radius: 18px; background: rgba(8,38,66,.7); border: 1px solid rgba(255,181,71,.45); padding: 16px 20px; display: flex; flex-direction: column; gap: 10px">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px">
          <h2 style="margin: 0; font-size: 17px; font-weight: 700">Alerts this session</h2>
          <span style="font-size: 13px; color: #B8D4E6">Newest first</span>
        </div>
        ${alerts}
        ${x.hasL2 ? '' : '<p style="margin: 0; font-size: 13px; color: #B8D4E6">No Level 2 alerts. A Level 2 alert stops the session and shows its steps here.</p>'}
      </section>
      <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px">
        <p style="margin: 0; font-size: 13px; color: #B8D4E6; max-width: 560px; line-height: 1.5">Return goes to the dashboard; the workout keeps running. Only "End exercise" turns Exercise mode off.</p>
        ${x.on ? '<button type="button" data-act="end-exercise" style="display: inline-flex; align-items: center; justify-content: center; min-height: 52px; padding: 0 28px; border-radius: 12px; border: 0; background: #2EE6B6; color: #03213A; font-size: 16px; font-weight: 700; cursor: pointer; font-family: Roboto, sans-serif">End exercise</button>' : '<button type="button" data-act="tile-exercise" style="display: inline-flex; align-items: center; justify-content: center; min-height: 52px; padding: 0 28px; border-radius: 12px; border: 0; background: #2EE6B6; color: #03213A; font-size: 16px; font-weight: 700; cursor: pointer; font-family: Roboto, sans-serif">Start exercise (Aerobic · Moderate · 30 min)</button>'}
      </div>
    </main>
  </div>`;
  };

  SCREENS.alert = () => {
    const a = E.alertView(UI.params.alert && UI.params.alert.id);
    if (!a) return simpleMessage('No alert is open', 'Alerts and their steps appear here when something needs action.');
    const mode = { regular: 'Regular', sleep: 'Sleep', exercise: 'Exercise', emergency: 'Regular' }[a.mode] || 'Regular';
    const step = (s) => {
      if (s.done) return `<li style="display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 14px; background: rgba(46,230,182,.12); border: 1px solid rgba(46,230,182,.45)"><span style="display: flex; align-items: center; justify-content: center; flex: 0 0 32px; width: 32px; height: 32px; border-radius: 50%; background: #2EE6B6; color: #03213A; font-weight: 700">${IC.check}</span><span style="flex: 1 1 auto; font-size: 17px; color: #CFEFE6">${esc(s.text)}</span></li>`;
      const measure = s.measure ? `<button type="button" data-act="measure-now" style="display: inline-flex; align-items: center; min-height: 44px; padding: 0 16px; border-radius: 10px; border: 1px solid rgba(0,212,255,.45); background: transparent; color: #9FEFFF; font-size: 14px; font-weight: 500; cursor: pointer; font-family: Roboto, sans-serif">Measure now</button>` : '';
      if (s.current && !a.closed) return `<li style="display: flex; align-items: center; flex-wrap: wrap; gap: 14px; padding: 14px 16px; border-radius: 14px; background: rgba(255,181,71,.12); border: 1px solid #FFB547"><span style="display: flex; align-items: center; justify-content: center; flex: 0 0 32px; width: 32px; height: 32px; border-radius: 50%; border: 2px solid #FFB547; color: #FFB547; font-weight: 700; box-sizing: border-box">${s.n}</span><span style="flex: 1 1 260px; font-size: 19px; font-weight: 500">${esc(s.text)}</span>${measure}<button type="button" data-act="alert-done" data-arg="${s.i}" style="min-height: 44px; padding: 0 20px; border-radius: 10px; border: 0; background: #FFB547; color: #2A1A00; font-size: 15px; font-weight: 700; cursor: pointer; font-family: Roboto, sans-serif">Done</button></li>`;
      return `<li style="display: flex; align-items: center; flex-wrap: wrap; gap: 14px; padding: 14px 16px; border-radius: 14px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.12)"><span style="display: flex; align-items: center; justify-content: center; flex: 0 0 32px; width: 32px; height: 32px; border-radius: 50%; border: 2px solid rgba(255,255,255,.3); color: #9DBAD0; font-weight: 700; box-sizing: border-box">${s.n}</span><span style="flex: 1 1 260px; font-size: 17px; color: #B8CDDB">${esc(s.text)}</span>${measure}</li>`;
    };
    const allDone = a.steps.every((s) => s.done);
    return `
  <div class="space" style="width: 100%; min-height: 100vh; box-sizing: border-box; font-family: Roboto, system-ui, sans-serif; color: #EAF6FF; display: flex; flex-direction: column">
    ${header(chip('rgba(255,181,71,.15)', '#FFB547', '#FFD38F', '#FFB547', (a.state === 'closed' ? 'Alert · closed' : a.state === 'monitoring' ? 'Alert · monitoring' : 'Alert · Level 2') + ' · Mode: ' + mode).replace('font-weight: 500', 'font-weight: 700'))}
    <main data-live="alert-main" style="flex-grow: 1; width: 100%; max-width: 1120px; margin: 0 auto; box-sizing: border-box; padding: 8px 32px 36px; display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start">
      <section style="flex: 999 1 560px; min-width: 0; border-radius: 22px; background: rgba(40,28,8,.55); border: 1px solid rgba(255,181,71,.6); padding: 26px 28px; display: flex; flex-direction: column; gap: 18px">
        <div style="display: flex; align-items: center; gap: 16px">
          <span style="display: flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 16px; background: rgba(255,181,71,.18)">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#FFB547" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"></path></svg>
          </span>
          <div>
            <h1 style="margin: 0; font-size: 26px; font-weight: 700">We noticed something</h1>
            <p style="margin: 4px 0 0; font-size: 16px; color: #FFD38F">This is about: <strong>${esc(a.about)}</strong> · follow these steps</p>
          </div>
        </div>
        ${a.paused ? '<p style="margin: 0; font-size: 14px; color: #FFD38F">These steps are paused while an emergency is open.</p>' : ''}
        <ol style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px">${a.steps.map(step).join('')}</ol>
        ${allDone ? '<p style="margin: 0; font-size: 15px; color: #CFEFE6">All steps done. The app keeps checking at the scheduled times.</p>' : ''}
        ${a.closed ? '<p style="margin: 0; font-size: 15px; color: #CFEFE6">This alert is closed. It stays in Records › Events.</p>' : ''}
      </section>
      <aside style="flex: 1 1 300px; display: flex; flex-direction: column; gap: 16px">
        <div style="border-radius: 18px; background: rgba(8,38,66,.62); border: 1px solid rgba(0,212,255,.22); padding: 18px 20px; display: flex; flex-direction: column; gap: 8px">
          <p style="margin: 0; font-size: 13px; color: #9DBAD0">What was found</p>
          ${a.foundValue !== '' ? `<p style="margin: 0; font-family: 'Roboto Mono', monospace; font-size: 30px; font-weight: 700; color: #FFD38F">${esc(a.foundValue)} <span style="font-size: 15px">${esc(a.foundUnit)}</span></p>` : ''}
          <p style="margin: 0; font-size: 14px; color: #CFE6F5; line-height: 1.5">${esc(a.foundText)}</p>
        </div>
        <div style="border-radius: 18px; background: rgba(8,38,66,.62); border: 1px solid rgba(0,212,255,.22); padding: 18px 20px; display: flex; flex-direction: column; gap: 10px">
          <p style="margin: 0; font-size: 13px; color: #9DBAD0">Reminders added</p>
          ${a.reminders.length ? a.reminders.map((r) => `<p style="margin: 0; font-size: 15px">${esc(r)}</p>`).join('') : '<p style="margin: 0; font-size: 15px">None</p>'}
        </div>
        <p style="margin: 0; font-size: 13px; color: #9DBAD0; line-height: 1.5">${esc(a.notified)}</p>
      </aside>
    </main>
  </div>`;
  };

  function simpleMessage(title, text) {
    return `<div class="space" style="width: 100%; min-height: 100vh; box-sizing: border-box; display: flex; flex-direction: column">
      ${header(h1(title))}
      <main style="flex-grow: 1; display: flex; align-items: center; justify-content: center; padding: 24px">
        <div style="max-width: 520px; border-radius: 22px; background: rgba(8,38,66,.75); border: 1px solid rgba(0,212,255,.25); padding: 26px 28px; font-size: 16px; line-height: 1.5; color: #CFE6F5">${esc(text)}</div>
      </main></div>`;
  }

  SCREENS.emergency = () => {
    const v = E.emergencyView();
    const rbtn = 'display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 18px; border-radius: 12px; border: 1px solid rgba(255,140,155,.45); background: rgba(40,6,14,.6); color: #FFE3E7; font-size: 15px; font-weight: 500; cursor: pointer; font-family: Roboto, sans-serif';
    if (!v) {
      return `<div class="red" style="width: 100%; min-height: 100vh; box-sizing: border-box; font-family: Roboto, system-ui, sans-serif; color: #FFF2F4; display: flex; flex-direction: column">
        <header style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 20px 32px">${retBtn(rbtn)}${exitBtn(rbtn)}</header>
        <main style="flex-grow: 1; display: flex; align-items: center; justify-content: center; padding: 24px"><div style="max-width: 560px; border-radius: 24px; background: rgba(60,8,20,.75); border: 2px solid #FF8A98; padding: 28px 30px; display: flex; flex-direction: column; gap: 12px">
          <p style="margin: 0; font-size: 26px; font-weight: 700">No emergency is open</p>
          <p style="margin: 0; font-size: 16px; color: #E7B8BF; line-height: 1.5">Closed emergencies stay in Monitoring for their caution period. They are in Records › Events.</p>
        </div></main></div>`;
    }
    const dot = (bad) => bad ? 'color: #FF8A98' : '';
    const vt = (label, x, u, bad) => `<div><p style="margin: 0; font-size: 12px; color: #E7B8BF">${label}</p><p style="margin: 2px 0 0; font-family: 'Roboto Mono', monospace; font-size: 30px; font-weight: 700; ${dot(bad)}">${x == null ? 'No data' : esc(x) + ` <span style="font-size: 14px">${u}</span>`}</p></div>`;
    const stepStyle = (st) => 'display: flex; gap: 12px; padding: 12px 16px; border-radius: 12px; font-size: 15px; line-height: 1.45; ' + (st === 'done' ? 'background: rgba(46,230,182,.1); border: 1px solid rgba(46,230,182,.4); color: #A8E9D6; text-decoration: line-through' : st === 'now' ? 'background: rgba(255,84,104,.16); border: 1px solid #FF5468; color: #FFFFFF' : 'background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); color: #E7B8BF');
    return `
  <div class="red ${v.alarm ? 'alarm-on' : ''}" style="width: 100%; min-height: 100vh; box-sizing: border-box; font-family: Roboto, system-ui, sans-serif; color: #FFF2F4; display: flex; flex-direction: column">
    <header style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 20px 32px">
      ${retBtn(rbtn)}
      <span role="status" data-live="em-head" style="display: inline-flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 16px; border-radius: 999px; background: rgba(255,84,104,.2); border: 1px solid #FF5468; font-size: 14px; font-weight: 500"><span style="width: 10px; height: 10px; border-radius: 50%; background: #FF5468; box-shadow: 0 0 10px #FF5468"></span>${esc(v.header)}</span>
      ${exitBtn(rbtn)}
    </header>
    <main style="flex-grow: 1; width: 100%; max-width: 1160px; margin: 0 auto; box-sizing: border-box; padding: 4px 32px 32px; display: flex; flex-direction: column; gap: 22px">
      <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center">
        <h1 style="margin: 0; font-size: 64px; font-weight: 900; letter-spacing: 6px; color: #FF5468; text-shadow: 0 0 28px rgba(255,84,104,.6)">EMERGENCY</h1>
        <p style="margin: 0; font-size: 22px; font-weight: 500">This is about: <strong style="color: #FFD0D6">${esc(v.about)}</strong> · follow these steps</p>
        <p style="margin: 0; font-size: 16px; font-weight: 700; color: #FFE3E7">${esc(v.topNote)}</p>
        <p style="margin: 0; font-size: 14px; color: #E7B8BF">${esc(v.displayLine)}</p>
        ${v.also ? `<p style="margin: 0; font-size: 13px; color: #FFB3BC">${esc(v.also)}</p>` : ''}
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 22px; align-items: flex-start">
        <section aria-label="Current step" style="flex: 999 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 14px">
          ${v.current ? `
          <div style="border-radius: 24px; background: rgba(60,8,20,.75); border: 2px solid #FF5468; padding: 28px 30px; display: flex; flex-direction: column; gap: 20px; box-shadow: 0 0 40px rgba(255,84,104,.25)">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px">
              <span style="font-size: 15px; font-weight: 700; color: #FFB3BC; letter-spacing: 1px">STEP ${v.num} OF ${v.total}</span>
            </div>
            <p style="margin: 0; font-size: 32px; line-height: 1.3; font-weight: 700">${esc(v.current.text)}</p>
            <div style="display: flex; flex-wrap: wrap; gap: 14px">
              <button type="button" data-act="em-done" style="min-height: 64px; min-width: 220px; padding: 0 36px; border-radius: 16px; border: 0; background: #FF5468; color: #FFFFFF; font-size: 24px; font-weight: 900; letter-spacing: 2px; cursor: pointer; font-family: Roboto, sans-serif">DONE</button>
              <button type="button" data-act="read-aloud" style="display: inline-flex; align-items: center; gap: 10px; min-height: 64px; padding: 0 26px; border-radius: 16px; border: 2px solid #FF8A98; background: rgba(255,84,104,.12); color: #FFFFFF; font-size: 20px; font-weight: 700; cursor: pointer; font-family: Roboto, sans-serif">${IC.speaker}READ ALOUD</button>
            </div>
            <p style="margin: 0; font-size: 13px; color: #E7B8BF">Tap or say "Done" for the next step. Tap or say "Read aloud" to hear this step.</p>
          </div>` : `
          <div style="border-radius: 24px; background: rgba(60,8,20,.75); border: 2px solid #FF8A98; padding: 28px 30px; display: flex; flex-direction: column; gap: 18px">
            <span style="font-size: 15px; font-weight: 700; color: #FFB3BC; letter-spacing: 1px">${v.display === 'wait' ? 'STEP DONE · WAITING FOR THE CREW' : 'ALL STEPS DONE'}</span>
            <p style="margin: 0; font-size: 32px; line-height: 1.3; font-weight: 700">${esc(v.staySafe)}</p>
            <div style="display: flex; flex-wrap: wrap; gap: 14px">
              <button type="button" data-act="em-again" style="min-height: 60px; padding: 0 28px; border-radius: 16px; border: 0; background: #FF5468; color: #FFFFFF; font-size: 20px; font-weight: 700; cursor: pointer; font-family: Roboto, sans-serif">Show steps again</button>
              <button type="button" data-act="read-aloud" style="min-height: 60px; padding: 0 24px; border-radius: 16px; border: 2px solid #FF8A98; background: rgba(255,84,104,.12); color: #FFFFFF; font-size: 18px; font-weight: 700; cursor: pointer; font-family: Roboto, sans-serif">READ ALOUD</button>
            </div>
          </div>`}
          <ol aria-label="All steps" style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px">
            ${v.steps.map((s) => `<li style="${stepStyle(s.state)}"><span style="font-weight: 700; min-width: 22px">${s.n}</span><span>${esc(s.text)}</span></li>`).join('')}
          </ol>
        </section>
        <aside style="flex: 1 1 280px; display: flex; flex-direction: column; gap: 14px">
          ${v.askOk ? `
          <div role="alertdialog" aria-label="Are you OK?" style="border-radius: 18px; background: #FFE3E7; color: #3A0610; padding: 16px 20px; display: flex; flex-direction: column; gap: 10px">
            <p style="margin: 0; font-size: 20px; font-weight: 900">Are you OK? Tap or say yes.</p>
            <button type="button" data-act="im-ok" style="min-height: 56px; border-radius: 12px; border: 0; background: #3A0610; color: #FFFFFF; font-size: 20px; font-weight: 900; cursor: pointer; font-family: Roboto, sans-serif">YES, I'M OK</button>
            <p style="margin: 0; font-size: 12px">Yes ends the emergency. No answer in 10 seconds calls for help at once. <span data-live="em-okleft">(${v.okLeft} s)</span></p>
          </div>` : ''}
          <div data-live="em-vitals" style="border-radius: 18px; background: rgba(40,6,14,.7); border: 1px solid rgba(255,140,155,.35); padding: 18px 20px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px">
            ${vt('SpO2', v.vitals.spo2, '%', v.bad.spo2)}${vt('Breathing', v.vitals.rr, '/min', v.bad.rr)}${vt('Heart rate', v.vitals.hr, 'bpm', v.bad.hr)}${vt('Cabin O2', v.vitals.o2, '%', v.bad.o2)}
          </div>
          <div style="border-radius: 18px; background: rgba(40,6,14,.7); border: 1px solid rgba(255,140,155,.35); padding: 16px 20px; display: flex; flex-direction: column; gap: 6px">
            <p style="margin: 0; font-size: 13px; color: #E7B8BF">Crew status</p>
            <p data-live="em-crew" style="margin: 0; font-size: 16px; font-weight: 500">${esc(v.crewStatus)}</p>
            ${v.againNote ? `<p style="margin: 0; font-size: 14px; font-weight: 700; color: #FFD0D6">${esc(v.againNote)}</p>` : ''}
            ${v.searching ? '<p style="margin: 0; font-size: 13px; color: #E7B8BF">Searching for more signs every 10 s</p>' : ''}
          </div>
          <button type="button" data-act="not-arrived" style="min-height: 52px; border-radius: 12px; border: 1px solid #FF5468; background: rgba(255,84,104,.15); color: #FFFFFF; font-size: 16px; font-weight: 700; cursor: pointer; font-family: Roboto, sans-serif">The crew has not arrived</button>
          ${UI.confirmClose ? `
          <div style="display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,.3)">
            <p style="margin: 0; font-size: 16px; font-weight: 700">${UI.confirmClose === 'end' ? 'End the emergency? Values go back to Normal.' : 'Are you sure?'}</p>
            <button type="button" data-act="${UI.confirmClose === 'end' ? 'end-emergency-yes' : 'no-emergency-yes'}" style="min-height: 48px; border-radius: 10px; border: 0; background: #FFE3E7; color: #3A0610; font-size: 16px; font-weight: 700; cursor: pointer; font-family: Roboto, sans-serif">${UI.confirmClose === 'end' ? 'Yes, end the emergency' : 'Yes, close the emergency'}</button>
            <button type="button" data-act="no-emergency-cancel" style="min-height: 44px; border-radius: 10px; border: 1px solid rgba(255,255,255,.3); background: transparent; color: #FFE3E7; font-size: 15px; cursor: pointer; font-family: Roboto, sans-serif">Keep it open</button>
          </div>` : `<button type="button" data-act="end-emergency" style="min-height: 56px; border-radius: 12px; border: 0; background: #2EE6B6; color: #03213A; font-size: 17px; font-weight: 700; cursor: pointer; font-family: Roboto, sans-serif">End emergency</button>
          <button type="button" data-act="no-emergency" style="min-height: 52px; border-radius: 12px; border: 1px solid rgba(255,255,255,.3); background: transparent; color: #FFE3E7; font-size: 16px; font-weight: 500; cursor: pointer; font-family: Roboto, sans-serif">No emergency (false alarm)</button>`}
        </aside>
      </div>
    </main>
  </div>`;
  };

  SCREENS.crewaid = () => {
    const v = E.crewAidView();
    const b = v.banner;
    const banner = b.tone === 'red'
      ? `<div data-live="ca-banner" style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 12px 18px; border-radius: 14px; background: rgba(255,84,104,.12); border: 1px solid rgba(255,84,104,.5)"><span style="width: 10px; height: 10px; border-radius: 50%; background: #FF5468"></span><span style="font-size: 15px"><strong>${esc(b.title)}</strong>${esc(b.text)}</span><span style="font-size: 14px; color: #FFC2CA">${esc(b.found)}</span></div>`
      : `<div data-live="ca-banner" style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 12px 18px; border-radius: 14px; background: rgba(0,212,255,.1); border: 1px solid rgba(0,212,255,.45)"><span style="width: 10px; height: 10px; border-radius: 50%; background: #00D4FF"></span><span style="font-size: 15px"><strong>${esc(b.title)}</strong>${esc(b.text)}</span><span style="font-size: 14px; color: #9FEFFF">${esc(b.found)}</span></div>`;
    const QUESTIONS = [
      { id: 'resp', text: 'Do they respond when you talk to them?', options: ['Yes', 'No'] },
      { id: 'breath', text: 'How are they breathing?', options: ['Normal', 'Fast or noisy', 'Not breathing'] },
      { id: 'chest', text: 'Do they have chest pain or pressure?', options: ['Yes', 'No', 'Cannot tell'] }
    ];
    const opt = (q, o) => `<button type="button" data-act="ca-answer" data-arg="${q.id}|${esc(o)}" style="min-height: 44px; padding: 0 18px; border-radius: 10px; cursor: pointer; font-size: 15px; font-weight: 700; font-family: Roboto, sans-serif; ${v.answers[q.id] === o ? 'border: 1px solid #2EE6B6; background: #2EE6B6; color: #03213A' : 'border: 1px solid rgba(46,230,182,.45); background: transparent; color: #DDF7EF'}">${esc(o)}</button>`;
    return `
  <div class="space" style="width: 100%; min-height: 100vh; box-sizing: border-box; font-family: Roboto, system-ui, sans-serif; color: #EAF6FF; display: flex; flex-direction: column">
    ${header(h1('Crew Aid'))}
    <main style="flex-grow: 1; width: 100%; max-width: 1180px; margin: 0 auto; box-sizing: border-box; padding: 4px 32px 32px; display: flex; flex-direction: column; gap: 18px">
      ${banner}
      <div style="display: flex; flex-wrap: wrap; gap: 20px; align-items: stretch">
        <section aria-label="Describe and analyze" style="flex: 1 1 460px; min-width: 0; display: flex; flex-direction: column; gap: 18px">
          <div style="border-radius: 20px; background: rgba(8,38,66,.62); border: 1px solid rgba(0,212,255,.3); padding: 20px; display: flex; flex-direction: column; gap: 12px">
            <label for="sym" style="font-size: 16px; font-weight: 700">Describe symptoms</label>
            <div style="display: flex; gap: 12px; align-items: stretch; flex-wrap: wrap">
              <textarea id="sym" data-field="crew.text" placeholder="${v.entry === 'self' ? 'What do you feel? e.g. chest pain, I feel dizzy, I keep vomiting' : "What do you see? e.g. he can't breathe well, lips look blue, can barely talk"}" style="flex: 1 1 260px; min-height: 120px; padding: 14px; border-radius: 12px; border: 1px solid rgba(0,212,255,.3); background: #06375C; color: #EAF6FF; font-family: Roboto, sans-serif; font-size: 16px; line-height: 1.45; resize: vertical">${esc(UI.crew.text)}</textarea>
              <button type="button" data-act="ca-analyze" style="flex: 0 0 140px; min-height: 56px; border-radius: 12px; border: 0; background: #00D4FF; color: #03213A; font-family: 'Roboto Mono', monospace; font-size: 17px; font-weight: 700; letter-spacing: 1px; cursor: pointer; box-shadow: 0 0 20px rgba(0,212,255,.4)">ANALYZE</button>
            </div>
            <p style="margin: 0; font-size: 13px; color: #9DBAD0">Works offline: the app looks for known words. Try "chest pain", "not breathing", "can't breathe", or anything else to see the questions.${v.matched.length ? '<br><span style="color: #9FEFFF">Understood: ' + esc(v.matched.join(' · ')) + '</span>' : ''}</p>
          </div>
          <div style="border-radius: 20px; background: rgba(8,38,66,.62); border: 1px solid rgba(46,230,182,.35); padding: 20px; display: flex; flex-direction: column; gap: 14px; flex-grow: 1">
            <p style="margin: 0; font-size: 16px; font-weight: 700">Questions</p>
            ${v.asking ? `<p style="margin: 0; font-size: 14px; color: #FFD38F">The symptoms were not clear. Answer all three quickly. The app acts once all are answered (${Object.keys(v.answers).length}/3):</p>
              ${QUESTIONS.map((q) => `<div style="display: flex; flex-direction: column; gap: 8px"><p style="margin: 0; font-size: 16px; font-weight: 500">${q.text}</p><div style="display: flex; gap: 8px; flex-wrap: wrap">${q.options.map((o) => opt(q, o)).join('')}</div></div>`).join('')}`
              : '<p style="margin: 0; font-size: 14px; color: #9DBAD0">Questions appear here only if the app does not understand the symptoms.</p>'}
          </div>
        </section>
        <section aria-label="Instructions" data-live="ca-instr" style="flex: 1 1 420px; min-width: 0; border-radius: 20px; background: rgba(8,38,66,.75); border: 2px solid ${v.border}; padding: 22px; display: flex; flex-direction: column; gap: 14px">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px">
            <p style="margin: 0; font-size: 18px; font-weight: 700">Instructions</p>
            <span style="font-size: 13px; color: #9DBAD0">${esc(v.about)}</span>
          </div>
          ${v.steps.length ? `<ol style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px">${v.steps.map((s, i) => `<li style="display: flex; gap: 12px; padding: 12px 14px; border-radius: 12px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); font-size: 16px; line-height: 1.45"><span style="display: flex; align-items: center; justify-content: center; flex: 0 0 28px; height: 28px; border-radius: 50%; background: #00D4FF; color: #03213A; font-weight: 700; font-size: 14px">${i + 1}</span><span>${esc(s)}</span></li>`).join('')}</ol>`
            : `<p style="margin: 0; font-size: 15px; color: #9DBAD0; line-height: 1.5">${v.entry === 'self' && v.emergencyOpen ? 'An emergency is open. Its steps are on the Emergency screen.' : 'Describe what you see and press Analyze. Instructions show here right away.'}</p>`}
        </section>
      </div>
    </main>
  </div>`;
  };

  const CHECK_ITEMS = [
    { id: 'bp', name: 'Blood pressure', device: 'Upper-arm cuff', when: 'each morning, after 5 min rest', fields: [['i', 'Reading 1 · systolic', 'mmHg'], ['i', 'Reading 1 · diastolic', 'mmHg'], ['i', 'Reading 2 · systolic', 'mmHg'], ['i', 'Reading 2 · diastolic', 'mmHg'], ['s', 'Rested 5 min?', ['Yes', 'No']]], steps: ['Put the cuff on your upper arm at heart level.', 'Rest for 5 minutes. Stay still.', 'Take two readings, 1 minute apart, and enter both. The app uses the average.', 'Not within 10 minutes after exercise.'] },
    { id: 'core', name: 'Core temperature', device: 'Mission thermometer', when: 'once a day', fields: [['i', 'Temperature', '°C']], steps: ['Use the same thermometer type every time.', 'If the app asks you to repeat: after 1 minute for a routine reading, or after 20–30 minutes of rest if something was detected.'] },
    { id: 'fspo2', name: 'Fingertip SpO2', device: 'Fingertip pulse oximeter', when: 'when the app asks', fields: [['i', 'SpO2', '%']], steps: ['Use a warm, still fingertip with no nail polish.', 'Wait 10 to 20 seconds before reading the number.'] },
    { id: 'mass', name: 'Body mass', device: 'SLAMMD', when: 'weekly, before eating, after the toilet', fields: [['i', 'Trial 1', 'kg'], ['i', 'Trial 2', 'kg'], ['i', 'Trial 3', 'kg']], steps: ['Go to the SLAMMD.', 'Wrap your legs around the leg support, put your stomach against the belly pad, and rest your chin on the headrest.', 'Hold still and stay relaxed. Start the measurement.', 'Do 3 trials.', 'Enter the 3 results to one decimal place, or let the SLAMMD laptop send them. If two trials differ by more than 0.5 kg, the app asks for one more.'] },
    { id: 'vis', name: 'Visual acuity', device: 'Near-vision card', when: 'weekly', fields: [['i', 'Left eye', 'logMAR'], ['i', 'Right eye', 'logMAR']], steps: ['Hold the card at the fixed distance.', 'Test each eye separately: cover the other eye.', 'Enter the smallest line you read for each eye.'] },
    { id: 'urine', name: 'Urine check', device: 'Mission urine test kit', when: 'each morning', fields: [['s', 'Result', ['Normal', 'Dark', 'Low amount']]], steps: ['Follow the kit steps.', 'Record the colour and the amount.'] },
    { id: 'fluid', name: 'Fluid log', device: 'Mission drink containers', when: 'all day', fields: [['i', 'Drink', 'L']], steps: ['Write down every drink.', 'Your plan today: {plan} L.'] },
    { id: 'mood', name: 'Mood and stress', device: 'This app · private', when: 'daily', fields: [['i', 'Mood', '0–10'], ['i', 'Stress', '0–10'], ['s', 'What you feel (optional)', ['Nothing in particular', 'Low mood', 'Worry or fear', 'Stress', 'Trouble sleeping', 'Loneliness', 'Irritability', 'Trouble concentrating', 'Low motivation', 'Conflict with crew']], ['s', 'Thoughts of harm, or cannot stay safe?', ['No', 'Yes']]], steps: ['Give a number from 0 to 10 for your mood and for your stress. 0 means no problem, 10 means the worst.', 'Pick what you feel, if anything.', 'Always answer: Are you having thoughts of harming yourself or anyone else, or do you feel you cannot stay safe? A Yes calls a trusted crew member, privately.', 'Your answers are private.'] },
    { id: 'ecg12', name: '12-lead ECG', device: 'Mission 12-lead ECG unit', when: 'only when the app or medical asks', fields: [['s', 'Result', ['Normal', 'Abnormal']]], steps: ['Stay still.', 'A crew mate helps place the leads.'] },
    { id: 'us', name: 'Ultrasound', device: 'Mission ultrasound', when: 'only when medical directs', fields: [['s', 'Result', ['Normal', 'Abnormal']]], steps: ['Prepare the equipment.', 'Stabilise the astronaut.', 'Apply ultrasound gel.', 'Acquire the image.', 'Analyse the results.', 'Medical follow-up.'] }
  ];

  SCREENS.mental = () => {
    const m = UI.mental; const pick = m.pick && C.MENTAL.find((x) => x.id === m.pick);
    const card = (x) => `<button type="button" data-act="mh-pick" data-arg="${x.id}" aria-pressed="${m.pick === x.id}" style="display: flex; flex-direction: column; align-items: flex-start; gap: 6px; text-align: left; padding: 14px 16px; border-radius: 14px; cursor: pointer; font-family: Roboto, sans-serif; ${m.pick === x.id ? 'background: rgba(156,140,255,.22); border: 2px solid #9C8CFF; color: #FFFFFF' : 'background: rgba(8,38,66,.62); border: 1px solid rgba(156,140,255,.35); color: #EAF6FF'}"><span style="font-size: 16px; font-weight: 700">${esc(x.title)}</span><span style="font-size: 13px; line-height: 1.4; color: #B8D4E6">${esc(x.notice)}</span></button>`;
    const right = pick ? `
          <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap">
            <p style="margin: 0; font-size: 18px; font-weight: 700">What can help</p>
            <span style="font-size: 13px; color: #CFC8FF">${esc(pick.title)}</span>
          </div>
          <ol style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px">${pick.help.map((h, i) => `<li style="display: flex; gap: 12px; padding: 12px 14px; border-radius: 12px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); font-size: 16px; line-height: 1.45"><span style="display: flex; align-items: center; justify-content: center; flex: 0 0 28px; height: 28px; border-radius: 50%; background: #9C8CFF; color: #03213A; font-weight: 700; font-size: 14px">${i + 1}</span><span>${esc(h)}</span></li>`).join('')}</ol>
          <div style="display: flex; flex-wrap: wrap; gap: 10px">
            <button type="button" data-act="mh-talk" style="min-height: 48px; padding: 0 18px; border-radius: 12px; border: 0; background: #9C8CFF; color: #03213A; font-size: 15px; font-weight: 700; cursor: pointer; font-family: Roboto, sans-serif">Ask for a private talk with the flight doctor</button>
          </div>
          ${m.msg ? `<p role="status" style="margin: 0; font-size: 14px; color: #CFC8FF">${esc(m.msg)}</p>` : ''}
          <p style="margin: 0; font-size: 12px; color: #9DBAD0; line-height: 1.5">General wellbeing advice, not a diagnosis. Your choice is saved privately and does not create an alert.</p>`
      : '<p style="margin: 0; font-size: 15px; color: #9DBAD0; line-height: 1.5">Choose what you are experiencing on the left. Suggestions of what can help appear here.</p>';
    return `
  <div class="space" style="width: 100%; min-height: 100vh; box-sizing: border-box; font-family: Roboto, system-ui, sans-serif; color: #EAF6FF; display: flex; flex-direction: column">
    ${header(h1('Mental Health'))}
    <main style="flex-grow: 1; width: 100%; max-width: 1180px; margin: 0 auto; box-sizing: border-box; padding: 4px 32px 32px; display: flex; flex-direction: column; gap: 18px">
      <p style="margin: 0; font-size: 15px; color: #B8D4E6">Long missions are hard on everyone. What are you experiencing right now?</p>
      <div style="display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start">
        <section aria-label="What you might experience" style="flex: 1 1 460px; min-width: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px">${C.MENTAL.map(card).join('')}</section>
        <section aria-label="What can help" style="flex: 1 1 380px; min-width: 0; display: flex; flex-direction: column; gap: 14px">
          <div style="border-radius: 20px; background: rgba(8,38,66,.75); border: 2px solid ${pick ? '#9C8CFF' : 'rgba(156,140,255,.3)'}; padding: 22px; display: flex; flex-direction: column; gap: 14px">${right}</div>
          <div style="border-radius: 16px; background: rgba(255,84,104,.1); border: 1px solid rgba(255,84,104,.55); padding: 16px 18px; display: flex; flex-direction: column; gap: 10px">
            <p style="margin: 0; font-size: 15px; font-weight: 700; color: #FFD0D6">Thoughts of harming yourself or someone else, or you feel you cannot stay safe?</p>
            <button type="button" data-act="mh-unsafe" style="align-self: flex-start; min-height: 48px; padding: 0 20px; border-radius: 12px; border: 0; background: #FF5468; color: #FFFFFF; font-size: 15px; font-weight: 700; cursor: pointer; font-family: Roboto, sans-serif">Get help now</button>
            <p style="margin: 0; font-size: 12px; color: #E7B8BF">A trusted crew member and medical are called, privately.</p>
          </div>
        </section>
      </div>
    </main>
  </div>`;
  };

  SCREENS.checkup = () => {
    const cv = E.checkupView();
    const tones = { due: ['rgba(255,181,71,.6)', 'background: #FFB547; color: #2A1A00'], done: ['rgba(46,230,182,.45)', 'background: rgba(46,230,182,.2); color: #7DF5D2'], info: ['rgba(0,212,255,.25)', 'background: rgba(0,212,255,.14); color: #9FEFFF'] };
    const rows = CHECK_ITEMS.map((it) => {
      const st = cv.st[it.id]; const t = tones[st[1]]; const open = UI.checkup.open === it.id;
      const vals = UI.checkup.vals[it.id] || [];
      const fields = it.fields.map((f, i) => `<label style="display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: #B8D4E6; flex: 1 1 80px; min-width: 70px">${esc(f[1])}${f[0] === 'i'
        ? `<input type="text" inputmode="decimal" data-field="ck.${it.id}.${i}" value="${esc(vals[i] || '')}" placeholder="${esc(f[2])}" style="min-height: 40px; min-width: 0; padding: 0 10px; border-radius: 8px; border: 1px solid rgba(0,212,255,.3); background: #06375C; color: #EAF6FF; font-family: 'Roboto Mono', monospace; font-size: 15px; font-weight: 500">`
        : `<select data-field="ck.${it.id}.${i}" style="min-height: 40px; min-width: 0; padding: 0 8px; border-radius: 8px; border: 1px solid rgba(0,212,255,.3); background: #06375C; color: #EAF6FF; font-family: Roboto, sans-serif; font-size: 15px">${f[2].map((o) => `<option${(vals[i] || f[2][0]) === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`}</label>`).join('');
      const msg = UI.checkup.msg[it.id];
      return `<div style="display: flex; flex-direction: column; gap: 10px; padding: 16px 18px; border-radius: 16px; background: rgba(8,38,66,.75); border: 1px solid ${t[0]}">
        <div style="display: grid; grid-template-columns: minmax(0, 1.25fr) 120px minmax(0, 1.6fr); gap: 14px; align-items: center">
          <div style="display: flex; flex-direction: column; gap: 4px; min-width: 0">
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap"><span style="font-size: 18px; font-weight: 700">${it.name}</span><span data-live="ck-st-${it.id}" style="display: inline-flex; align-items: center; min-height: 24px; padding: 0 10px; border-radius: 999px; font-size: 12px; font-weight: 700; ${t[1]}">${esc(st[0])}</span></div>
            <span style="font-size: 13px; color: #B8D4E6">${it.device} · ${it.when}</span>
          </div>
          <button type="button" data-act="ck-how" data-arg="${it.id}" aria-expanded="${open}" style="min-height: 44px; border-radius: 10px; cursor: pointer; font-family: Roboto, sans-serif; font-size: 15px; font-weight: 700; ${open ? 'border: 1px solid #00D4FF; background: #00D4FF; color: #03213A' : 'border: 1px solid rgba(0,212,255,.55); background: transparent; color: #9FEFFF'}">${open ? 'Hide' : 'How'}</button>
          <div style="display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px">${fields}
            <button type="button" data-act="ck-save" data-arg="${it.id}" style="min-height: 40px; padding: 0 16px; border-radius: 8px; border: 0; background: #2EE6B6; color: #03213A; font-size: 14px; font-weight: 700; cursor: pointer; font-family: Roboto, sans-serif">Save</button>
          </div>
        </div>
        ${msg ? `<p role="status" style="margin: 0; font-size: 14px; color: ${msg.ok ? '#7DF5D2' : '#FFD38F'}">${esc(msg.text)}</p>` : ''}
        ${open ? `<ol style="margin: 4px 0 0; padding: 14px 18px 14px 36px; border-radius: 12px; background: rgba(0,212,255,.08); border: 1px solid rgba(0,212,255,.3); display: flex; flex-direction: column; gap: 6px; font-size: 15px; line-height: 1.45">${it.steps.map((s) => `<li>${esc(s.replace('{plan}', cv.plan))}</li>`).join('')}</ol>` : ''}
      </div>`;
    }).join('');
    return `
  <div class="space-top" style="width: 100%; min-height: 100vh; box-sizing: border-box; font-family: Roboto, system-ui, sans-serif; color: #EAF6FF; display: flex; flex-direction: column">
    ${header(h1('Daily Check-Up'))}
    <main style="flex-grow: 1; width: 100%; max-width: 1160px; margin: 0 auto; box-sizing: border-box; padding: 4px 32px 36px; display: flex; flex-direction: column; gap: 12px">
      <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 4px">
        <p style="margin: 0; font-size: 15px; color: #B8D4E6">Everything you measure yourself. Tap <strong style="color: #FFFFFF">How</strong> to see the steps, then enter your result under <strong style="color: #FFFFFF">Input</strong>.</p>
        <button type="button" data-act="report-symptom" style="${BTN}; border: 1px solid rgba(0,212,255,.55); background: rgba(0,212,255,.12); font-weight: 700">Report a symptom</button>
      </div>
      <div style="display: grid; grid-template-columns: minmax(0, 1.25fr) 120px minmax(0, 1.6fr); gap: 14px; padding: 0 18px; font-size: 12px; font-weight: 700; letter-spacing: .5px; color: #B8D4E6">
        <span>WHAT TO MEASURE</span><span style="text-align: center">HOW</span><span>INPUT</span>
      </div>
      ${rows}
    </main>
  </div>`;
  };

  SCREENS.records = () => {
    const tab = UI.records.tab;
    const tabs = [['now', 'Now'], ['history', 'History'], ['past7', 'Past 7 days'], ['events', 'Events'], ['private', 'Private']].map(([k, l]) => `<button type="button" data-act="rec-tab" data-arg="${k}" ${tab === k ? 'aria-current="page"' : ''} style="display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; border-radius: 10px; border: 0; cursor: pointer; font-family: Roboto, sans-serif; font-size: 15px; ${tab === k ? 'background: #00D4FF; color: #03213A; font-weight: 700' : 'background: transparent; color: #CFE6F5; font-weight: 500'}">${l}</button>`).join('');
    const box = (inner) => `<div style="border-radius: 18px; background: rgba(8,38,66,.62); border: 1px solid rgba(0,212,255,.22); overflow-x: auto">${inner}</div>`;
    let body = '';
    if (tab === 'history') {
      const f = UI.records.filter;
      const chips = [['all', 'All'], ['m', 'Measurements'], ['s', 'Symptoms'], ['sleep', 'Sleep'], ['mode', 'Modes'], ['e', 'Events'], ['c', 'Calls']].map(([k, l]) => `<button type="button" data-act="rec-filter" data-arg="${k}" style="padding: 6px 12px; border-radius: 999px; cursor: pointer; background: transparent; font-family: Roboto, sans-serif; font-size: 13px; ${f === k ? 'border: 1px solid #00D4FF; color: #9FEFFF' : 'border: 1px solid rgba(255,255,255,.2); color: #CFE6F5'}">${l}</button>`).join('');
      const rows = E.historyView(f).slice(0, 400);
      body = `<div style="display: flex; flex-wrap: wrap; gap: 8px; font-size: 13px">${chips}</div>` + box(`<table class="records" style="width: 100%; border-collapse: collapse; font-size: 15px"><thead><tr><th>Date and time</th><th>Type</th><th>Item</th><th>Value</th><th>By</th></tr></thead><tbody>${rows.map((r) => `<tr><td style="font-family: 'Roboto Mono', monospace; white-space: nowrap">${esc(r.when)}</td><td>${r.type === 'Event' ? `<span style="color: ${r.color || '#FFD38F'}">Event</span>` : esc(r.type)}</td><td>${esc(r.item)}</td><td style="font-family: ${r.type === 'Measurement' ? "'Roboto Mono', monospace" : 'inherit'}">${esc(r.value)}</td><td>${esc(r.by)}</td></tr>`).join('') || '<tr><td colspan="5">No data</td></tr>'}</tbody></table>`) + `<p style="margin: 0; font-size: 13px; color: #9DBAD0">Everything is saved with its time while this page is open. Private entries are only in the Private tab.</p>`;
    } else if (tab === 'now') {
      const n = E.nowView();
      body = `<p style="margin: 0; font-size: 14px; color: #B8D4E6">Mode: ${esc(n.mode)} · clock ${esc(n.clock)} · last values sent: ${esc(n.updated)}</p>` + box(`<table class="records" style="width: 100%; border-collapse: collapse; font-size: 15px"><thead><tr><th>Signal</th><th>Value</th><th>Device</th><th>Device state</th><th>Signal quality</th><th>Validation</th></tr></thead><tbody>${n.rows.map((r) => `<tr><td>${esc(r.name)}</td><td style="font-family: 'Roboto Mono', monospace; ${r.value === 'No data' ? 'color: #FFD38F' : ''}">${esc(r.value)} ${esc(r.unit)}</td><td>${esc(r.device)}</td><td>${esc(r.state)}</td><td>${esc(r.quality)}</td><td>${esc(r.validation)}</td></tr>`).join('')}</tbody></table>`) +
        (n.man.length ? box(`<table class="records" style="width: 100%; border-collapse: collapse; font-size: 15px"><thead><tr><th>Manual value</th><th>Value</th><th>Taken</th><th>Used now?</th></tr></thead><tbody>${n.man.map((r) => `<tr><td>${esc(r.name)}</td><td style="font-family: 'Roboto Mono', monospace">${esc(r.value)} ${esc(r.unit)}</td><td>${esc(r.when)}</td><td>${r.fresh ? 'Yes (under 10 min old)' : 'No (older than 10 min)'}</td></tr>`).join('')}</tbody></table>`) : '');
    } else if (tab === 'past7') {
      body = E.past7View().map((d) => `<div style="border-radius: 18px; background: rgba(8,38,66,.62); border: 1px solid rgba(0,212,255,.22); padding: 14px 18px; display: flex; flex-direction: column; gap: 8px">
        <p style="margin: 0; font-size: 16px; font-weight: 700">${esc(d.day)}</p>
        ${d.hours.length ? `<table class="records" style="width: 100%; border-collapse: collapse; font-size: 14px"><thead><tr><th>Hour</th><th>Heart rate (avg)</th><th>SpO2 (avg)</th><th>Breathing (avg)</th><th>Skin temp (avg)</th><th>Readings</th></tr></thead><tbody>${d.hours.map((h) => `<tr><td style="font-family: 'Roboto Mono', monospace">${h.hour}</td><td>${h.hr}</td><td>${h.spo2}</td><td>${h.rr}</td><td>${h.skin}</td><td>${h.n}</td></tr>`).join('')}</tbody></table>` : '<p style="margin: 0; font-size: 14px; color: #9DBAD0">Continuous signals: No data</p>'}
        <p style="margin: 0; font-size: 14px; color: #CFE6F5">Manual: ${d.manual.length ? esc(d.manual.join(' · ')) : 'No data'}</p></div>`).join('');
    } else if (tab === 'events' || tab === 'private') {
      const evCard = (e) => `<details style="border-radius: 16px; background: rgba(8,38,66,.62); border: 1px solid ${e.level >= 3 ? 'rgba(255,84,104,.55)' : 'rgba(255,181,71,.45)'}; padding: 14px 18px">
        <summary style="cursor: pointer; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; font-size: 15px"><span style="font-family: 'Roboto Mono', monospace; color: #9FEFFF">${esc(e.start)}</span><strong style="color: ${e.level >= 3 ? '#FF8A98' : '#FFD38F'}">${esc(e.label)}</strong><span style="color: #CFE6F5">${esc(e.state === 'closed' ? 'Closed' : e.state === 'monitoring' ? 'Monitoring' : 'Level ' + e.level)}</span><span style="color: #9DBAD0">${esc(e.run)}</span></summary>
        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 10px; font-size: 14px; line-height: 1.5; color: #CFE6F5">
          <p style="margin: 0"><strong>Event ID:</strong> ${esc(e.id)} · ${esc(e.code)} · <strong>Mode at onset:</strong> ${esc(e.mode)} · <strong>Ended:</strong> ${esc(e.end)}</p>
          <p style="margin: 0"><strong>Trigger:</strong> ${esc(e.trigger)}</p>
          ${e.first ? `<p style="margin: 0"><strong>First abnormal reading:</strong> ${esc(e.first)}</p>` : ''}
          <p style="margin: 0"><strong>Level history:</strong><br>${e.levels.map(esc).join('<br>')}</p>
          ${e.symptoms.length ? `<p style="margin: 0"><strong>Symptoms:</strong><br>${e.symptoms.map(esc).join('<br>')}</p>` : ''}
          ${e.log.length ? `<p style="margin: 0"><strong>Rechecks and notes:</strong><br>${e.log.map(esc).join('<br>')}</p>` : ''}
          ${e.calls.length ? `<p style="margin: 0"><strong>Crew calls:</strong><br>${e.calls.map(esc).join('<br>')}</p>` : ''}
          ${e.messages.length ? `<p style="margin: 0"><strong>Messages (simulated):</strong><br>${e.messages.map(esc).join('<br>')}</p>` : ''}
          ${e.close ? `<p style="margin: 0"><strong>Closing:</strong> ${esc(e.close)}</p>` : ''}
          ${e.caution ? `<p style="margin: 0"><strong>Caution period:</strong> ${esc(e.caution)}</p>` : ''}
          ${e.responder ? `<p style="margin: 0"><strong>Responder checklist (crew devices):</strong><br>${e.responder.map((r, i) => (i + 1) + '. ' + esc(r)).join('<br>')}</p>` : ''}
          ${e.handover ? `<p style="margin: 0"><strong>Handover summary:</strong> ${esc('Astronaut ' + e.handover.astronaut + ' · mode at onset ' + e.handover.modeAtOnset + ' · about ' + e.handover.about + ' · first reading ' + (e.handover.first && e.handover.first.value != null ? e.handover.first.value : '–') + ' · symptoms: ' + (e.handover.symptoms.join(', ') || 'none') + ' · steps done: ' + e.handover.done.length + ' · next: ' + e.handover.next)}</p>` : ''}
        </div></details>`;
      if (tab === 'events') {
        const evs = E.eventsView(false);
        body = evs.length ? evs.map(evCard).join('') : box('<p style="margin: 0; padding: 16px 18px; font-size: 15px">No events yet. Events created during runs are labelled "Simulated run".</p>');
      } else {
        const p = E.privateView();
        body = `<p style="margin: 0; font-size: 14px; color: #B8D4E6">Private: mental-health entries and private events. Shown only here.</p>` +
          box(`<table class="records" style="width: 100%; border-collapse: collapse; font-size: 15px"><thead><tr><th>Date and time</th><th>Mood</th><th>Stress</th><th>What you feel</th><th>Cannot stay safe</th></tr></thead><tbody>${p.mental.map((m) => `<tr><td style="font-family: 'Roboto Mono', monospace">${esc(m.when)}</td><td>${esc(m.mood)}</td><td>${esc(m.stress)}</td><td>${esc(m.options)}</td><td>${esc(m.unsafe)}</td></tr>`).join('') || '<tr><td colspan="5">No entries</td></tr>'}</tbody></table>`) +
          p.events.map(evCard).join('') +
          (p.messages.length ? box(`<p style="margin: 0; padding: 14px 18px; font-size: 14px; line-height: 1.5">${p.messages.map(esc).join('<br>')}</p>`) : '');
      }
    }
    return `
  <div class="space" style="width: 100%; min-height: 100vh; box-sizing: border-box; font-family: Roboto, system-ui, sans-serif; color: #EAF6FF; display: flex; flex-direction: column">
    ${header(h1('Health Records'))}
    <main style="flex-grow: 1; width: 100%; max-width: 1180px; margin: 0 auto; box-sizing: border-box; padding: 4px 32px 32px; display: flex; flex-direction: column; gap: 18px">
      <nav aria-label="Records tabs" style="display: flex; flex-wrap: wrap; gap: 8px; padding: 6px; border-radius: 14px; background: rgba(3,20,40,.7); align-self: flex-start">${tabs}</nav>
      ${body}
    </main>
  </div>`;
  };

  SCREENS.reminders = () => {
    const r = E.remindersView();
    const row = (x, kind) => {
      if (kind === 'condition') return `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 14px; padding: 16px 18px; border-radius: 16px; background: rgba(255,181,71,.1); border: 1px solid rgba(255,181,71,.55)">
        <span style="font-family: 'Roboto Mono', monospace; font-size: 16px; font-weight: 700; color: #FFD38F; min-width: 64px">${esc(x.when)}</span>
        <span style="flex: 1 1 260px; font-size: 16px">${esc(x.text)}${x.due ? ' <strong style="color: #FFB547">· due</strong>' : ''}</span>
        <button type="button" data-act="rem-done" data-arg="${x.id}" style="min-height: 44px; padding: 0 18px; border-radius: 10px; border: 0; background: #FFB547; color: #2A1A00; font-size: 15px; font-weight: 700; cursor: pointer; font-family: Roboto, sans-serif">Done</button>
        ${x.canSnooze ? `<button type="button" data-act="rem-snooze" data-arg="${x.id}" style="min-height: 44px; padding: 0 16px; border-radius: 10px; border: 1px solid rgba(255,181,71,.6); background: transparent; color: #FFD38F; font-size: 15px; cursor: pointer; font-family: Roboto, sans-serif">Snooze 10 min</button>` : ''}
      </div>`;
      if (kind === 'daily') return `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 16px; background: rgba(8,38,66,.62); border: 1px solid rgba(0,212,255,.22)">
        <span style="font-family: 'Roboto Mono', monospace; font-size: 16px; font-weight: 700; color: #9FEFFF; min-width: 64px">${esc(x.when)}</span>
        <span style="flex: 1 1 260px; font-size: 16px">${esc(x.text)}</span>
        <button type="button" data-act="rem-done" data-arg="${x.id}" style="min-height: 44px; padding: 0 18px; border-radius: 10px; border: 1px solid rgba(0,212,255,.45); background: transparent; color: #9FEFFF; font-size: 15px; font-weight: 500; cursor: pointer; font-family: Roboto, sans-serif">Done</button>
      </div>`;
      return `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 16px; background: rgba(8,38,66,.62); border: 1px solid rgba(46,230,182,.35)">
        <span style="font-family: 'Roboto Mono', monospace; font-size: 16px; font-weight: 700; color: #7DF5D2; min-width: 64px">${esc(x.when)}</span>
        <span style="flex: 1 1 260px; font-size: 16px">${esc(x.text)}</span>
        <button type="button" data-act="rem-delete" data-arg="${x.id}" aria-label="Delete reminder" style="min-height: 44px; min-width: 44px; border-radius: 10px; border: 1px solid rgba(255,255,255,.2); background: transparent; color: #CFE6F5; cursor: pointer">${IC.trash}</button>
      </div>`;
    };
    return `
  <div class="space" style="width: 100%; min-height: 100vh; box-sizing: border-box; font-family: Roboto, system-ui, sans-serif; color: #EAF6FF; display: flex; flex-direction: column">
    ${header(h1('Reminders'))}
    <main data-live="rem-main" style="flex-grow: 1; width: 100%; max-width: 980px; margin: 0 auto; box-sizing: border-box; padding: 4px 32px 32px; display: flex; flex-direction: column; gap: 14px">
      ${r.condition.length ? '<p style="margin: 6px 0 0; font-size: 13px; font-weight: 700; color: #FFB547; letter-spacing: .5px">FROM AN ALERT · cannot be deleted</p>' + r.condition.map((x) => row(x, 'condition')).join('') : ''}
      <p style="margin: 10px 0 0; font-size: 13px; font-weight: 700; color: #00D4FF; letter-spacing: .5px">DAILY</p>
      ${r.daily.map((x) => row(x, 'daily')).join('')}
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; gap: 12px; flex-wrap: wrap">
        <p style="margin: 0; font-size: 13px; font-weight: 700; color: #2EE6B6; letter-spacing: .5px">MINE</p>
      </div>
      ${r.mine.length ? r.mine.map((x) => row(x, 'mine')).join('') : '<p style="margin: 0; font-size: 14px; color: #9DBAD0">No reminders of your own.</p>'}
      ${E.state.mode.mode !== 'regular' ? '<p style="margin: 6px 0 0; font-size: 13px; color: #9DBAD0">Sleep and Exercise: reminders stay silent, except those marked Important.</p>' : ''}
    </main>
  </div>`;
  };

  /* ---------------- Simulation page ---------------- */
  function caseValues(mode, k) { const b = Object.assign({}, C.CASE_NORMAL[mode]); if (k !== 'normal') Object.assign(b, C.CASE_CHANGES[mode][k]); return b; }
  const COUNTERS = [['rhr_days', 'Days resting HR >10% above baseline'], ['sleep_hr_nights', 'Nights sleep HR >10% above baseline'], ['hrv_nights', 'Nights HRV >20% below baseline'], ['spo2_nights', 'Nights SpO2 <93% for >5 min (last 7)'], ['poor_nights', 'Poor nights in a row'], ['fluid_days', 'Days fluid <70% of plan'], ['mood_checkins', 'Check-ins with mood or stress ≥7'], ['mass_change_pct', 'Body mass change over 14 days (%)'], ['missed_sessions', 'Missed sessions this week']];
  const PROFILE = [['agesex', 'Age · sex'], ['fitness', 'Fitness'], ['mass', 'Body mass (kg)'], ['sleepwake', 'Bedtime · wake'], ['fluid', 'Fluid plan (L/day)'], ['resthr', 'Resting heart rate'], ['sleephr', 'Sleep average · lowest HR'], ['hrv', 'Resting · sleep HRV (ms)'], ['rr', 'Resting · sleep breathing'], ['spo2', 'Resting · sleep SpO2'], ['bp', 'Blood pressure'], ['aerobic', 'Aerobic HR at usual load']];
  const INP = "min-height: 36px; min-width: 0; padding: 0 10px; border-radius: 8px; border: 1px solid rgba(0,212,255,.25); background: #06375C; color: #EAF6FF; font-family: 'Roboto Mono', monospace; font-size: 13px";
  const CTL = 'min-height: 40px; padding: 0 14px; border-radius: 8px; border: 1px solid rgba(0,212,255,.45); background: rgba(0,212,255,.12); color: #EAF6FF; font-size: 13px; font-weight: 700; cursor: pointer; font-family: Roboto, sans-serif';

  SCREENS.simulation = () => {
    const S = E.state; const sim = UI.sim;
    const mode = S.mode.mode === 'emergency' ? (S.mode.onsetMode || 'regular') : S.mode.mode;
    const sug = caseValues(mode, sim.caseKey);
    const changed = sim.caseKey === 'normal' ? {} : C.CASE_CHANGES[mode][sim.caseKey];
    const caseColor = { normal: '#2EE6B6', alert: '#FFB547', emergency: '#FF5468' };
    const kindColor = { worn: '#00D4FF', hand: '#2EE6B6', off: '#9C8CFF' };
    const pill = (on) => 'display: inline-flex; align-items: center; min-height: 44px; padding: 0 16px; border-radius: 999px; font-family: Roboto, sans-serif; font-size: 14px; font-weight: 700; ' + (on ? 'border: 1px solid #00D4FF; background: #00D4FF; color: #03213A' : 'border: 1px solid rgba(0,212,255,.35); background: rgba(6,33,66,.65); color: #EAF6FF');
    const plainUnit = (u) => !u || u === '0–3' || u === '0–10' || u === '0–100';
    const devices = C.DEVICES.map((d) => `<div style="border-radius: 12px; background: rgba(3,20,40,.55); border: 1px solid rgba(0,212,255,.14); padding: 10px 12px; display: flex; flex-direction: column; gap: 4px">
        <div style="display: flex; align-items: center; gap: 10px"><span style="width: 26px; height: 26px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #03213A; background: ${kindColor[d.kind]}">${d.num}</span><span style="font-size: 14px; font-weight: 700">${d.name}</span><span style="font-size: 12px; color: #B8D4E6">${d.place}</span></div>
        ${C.SIM_ROWS.filter((r) => r.dev === d.num).map((r) => `<div style="display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; padding: 3px 0 3px 36px; font-size: 13px"><span style="color: #D6E8F3">${r.name}</span><span style="font-family: 'Roboto Mono', monospace; font-weight: 700; color: ${changed[r.id] ? caseColor[sim.caseKey] : '#BFF4FF'}">${esc(plainUnit(r.unit) ? sug[r.id] : sug[r.id] + ' ' + r.unit)}</span></div>`).join('')}
      </div>`).join('');
    const offBody = C.DEVICES.filter((d) => d.kind === 'off').map((d) => `<span style="display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 0 12px; border-radius: 10px; background: rgba(3,20,40,.7); border: 1px solid rgba(156,140,255,.35); font-size: 13px"><span style="display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: #9C8CFF; color: #03213A; font-size: 11px; font-weight: 700">${d.num}</span><span><strong>${d.name}</strong> · ${d.place}</span></span>`).join('');
    const head = (c) => 'margin: 10px 0 2px; font-size: 13px; font-weight: 700; letter-spacing: .5px; color: ' + c;
    const group = (title, color, g) => `<p style="${head(color)}">${title}</p>` + C.SIM_ROWS.filter((r) => r.g === g).map((r) => `<label style="display: grid; grid-template-columns: 30px minmax(0, 1fr) 120px 64px; gap: 10px; align-items: center; font-size: 14px">
          <span style="font-size: 12px; color: #B8D4E6; font-family: 'Roboto Mono', monospace">#${r.dev}</span><span>${r.name}</span>
          <input type="text" data-field="sim.${r.id}" value="${esc(sim.fields[r.id] == null ? '' : sim.fields[r.id])}" placeholder="value" style="min-height: 38px; min-width: 0; padding: 0 10px; border-radius: 8px; border: 1px solid rgba(0,212,255,.25); background: #06375C; color: #EAF6FF; font-family: 'Roboto Mono', monospace; font-size: 14px; font-weight: 500">
          <span style="font-size: 12px; color: #B8D4E6">${r.unit}</span></label>`).join('');
    const res = sim.result;
    let resultBox = '';
    if (sim.missing) resultBox = `<div role="status" style="display: flex; flex-direction: column; gap: 8px; padding: 16px 18px; border-radius: 14px; background: rgba(255,181,71,.16); border: 1px solid #FFB547; color: #FFFFFF"><p style="margin: 0; font-size: 18px; font-weight: 700">Not run: fix these fields</p><p style="margin: 0; font-size: 14px; line-height: 1.5">${sim.missing.map(esc).join(' · ')}</p></div>`;
    else if (res) {
      const tone = res.level === 0 ? ['rgba(46,230,182,.16)', '#2EE6B6'] : res.level === 1 ? ['rgba(46,230,182,.16)', '#FFB547'] : res.level === 2 ? ['rgba(255,181,71,.16)', '#FFB547'] : ['rgba(255,84,104,.18)', '#FF5468'];
      resultBox = `<div role="status" style="display: flex; flex-direction: column; gap: 8px; padding: 16px 18px; border-radius: 14px; background: ${tone[0]}; border: 1px solid ${tone[1]}; color: #FFFFFF">
          <p style="margin: 0; font-size: 18px; font-weight: 700">${esc(res.title)}</p>
          <p style="margin: 0; font-size: 14px; line-height: 1.5">${esc(res.text)}</p>
          ${res.screen ? `<button type="button" data-act="open-result" style="align-self: flex-start; display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; border-radius: 10px; border: 0; background: rgba(0,0,0,.25); color: #FFFFFF; font-weight: 700; cursor: pointer; font-family: Roboto, sans-serif">Open the screen</button>` : ''}
        </div>`;
    }
    const det = (key, title, inner) => `<details data-details="${key}" ${sim.open[key] ? 'open' : ''} style="border-radius: 12px; background: rgba(3,20,40,.6); border: 1px solid rgba(0,212,255,.18); padding: 10px 14px"><summary style="cursor: pointer; font-size: 14px; font-weight: 700; min-height: 32px; display: flex; align-items: center">${title}</summary>${inner}</details>`;
    const grid = (inner) => `<div style="display: grid; grid-template-columns: minmax(0, 1fr) 110px; gap: 8px 10px; align-items: center; font-size: 13px; margin-top: 10px">${inner}</div>`;
    const prof = E.profileText();
    const panelA = grid(PROFILE.map(([k, l]) => `<label style="display: contents"><span>${l}</span><input type="text" data-profile="${k}" value="${esc(prof[k])}" style="${INP}"></label>`).join('')) + (sim.profileMsg ? `<p style="margin: 8px 0 0; font-size: 12px; color: #FFD38F">${esc(sim.profileMsg)}</p>` : '') + '<p style="margin: 8px 0 0; font-size: 12px; color: #B8D4E6">Other required fields use the demo profile (section 19.1): skin 33.5 / 34.2 °C, core 36.8 °C, acuity 0.0 both eyes, usual sleep 7.5 h, no tested maximum, career dose 0 mSv.</p>';
    const panelD = grid(COUNTERS.map(([k, l]) => `<label style="display: contents"><span>${l}</span><input type="text" data-counter="${k}" value="${esc(S.counters[k] == null ? '' : S.counters[k])}" placeholder="from database" style="${INP}"></label>`).join(''));
    const sel = (k, opts, val) => `<select data-control="${k}" style="${INP}">${opts.map(([v, l]) => `<option value="${v}"${String(val) === String(v) ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
    const ctl = S.controls;
    const eraseLabel = ['Erase this identity\'s data', 'Are you sure? Tap again', 'Are you sure? This removes everything'][sim.eraseStep] || 'Erase';
    const panelE = grid(`
      <label style="display: contents"><span>Crew responds</span>${sel('crewResponds', [['false', 'No (default)'], ['true', 'Yes']], ctl.crewResponds)}</label>
      <label style="display: contents"><span>Crew responds after (s)</span><input type="text" data-control="crewAfter" value="${esc(ctl.crewAfter)}" style="${INP}"></label>
      <label style="display: contents"><span>Astronaut responsive</span>${sel('responsive', [['true', 'Yes'], ['false', 'No']], ctl.responsive)}</label>
      <label style="display: contents"><span>Chest patch signals</span>${sel('chest', [['working', 'Working'], ['dropped', 'Dropped'], ['corrupt', 'Corrupt']], ctl.chest)}</label>
      <label style="display: contents"><span>Wrist device signals</span>${sel('wrist', [['working', 'Working'], ['dropped', 'Dropped'], ['corrupt', 'Corrupt']], ctl.wrist)}</label>
      <label style="display: contents"><span>Mission has spacewalks</span>${sel('spacewalks', [['false', 'No'], ['true', 'Yes']], S.profile.spacewalks)}</label>
      <label style="display: contents"><span>Voice command</span><input type="text" data-field="sim-voice" value="${esc(sim.voice)}" placeholder='type "SOS"' style="${INP}"></label>`) +
      `<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px"><button type="button" data-act="crew-arrived" style="${CTL}">Crew arrived</button><button type="button" data-act="strong-tap" style="${CTL}">Strong tap</button><button type="button" data-act="erase" style="min-height: 40px; padding: 0 14px; border-radius: 8px; border: 1px solid rgba(255,84,104,.6); background: transparent; color: #FFB3BC; font-size: 13px; font-weight: 700; cursor: pointer; font-family: Roboto, sans-serif">${eraseLabel}</button></div>` +
      (sim.ctlMsg ? `<p style="margin: 8px 0 0; font-size: 12px; color: #9FEFFF">${esc(sim.ctlMsg)}</p>` : '');
    const panelF = `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px"><span data-live="sim-clock" style="font-family: 'Roboto Mono', monospace; font-size: 18px; font-weight: 700; margin-right: 6px">${E.clockText()}${S.clock.paused ? ' · paused' : ''}</span>${[['30000', '+30 s'], ['120000', '+2 min'], ['600000', '+10 min'], ['1800000', '+30 min'], ['3600000', '+1 h']].map(([ms, l]) => `<button type="button" data-act="clock" data-arg="${ms}" style="${CTL}">${l}</button>`).join('')}<button type="button" data-act="pause" style="${CTL}">${S.clock.paused ? 'Resume' : 'Pause'}</button></div><p style="margin: 8px 0 0; font-size: 12px; color: #B8D4E6">Day ${E.dayOf(S.clock.t)}. The clock runs at normal speed between presses; the master loop runs every 30 simulated seconds. The 30-second crew timer and the 10-second "Are you OK?" timer use real seconds.</p>`;
    const panelG = C.THRESHOLDS.map(([g, list]) => `<p style="margin: 12px 0 0; font-size: 12px; font-weight: 700; letter-spacing: .5px; color: #9FEFFF">${esc(g.toUpperCase())}</p>` + grid(list.map(([k, l]) => `<label style="display: contents"><span>${esc(l)}</span><input type="text" data-th="${k}" value="${esc(S.th[k])}" style="${INP}"></label>`).join(''))).join('') + '<p style="margin: 10px 0 0; font-size: 12px; color: #B8D4E6">Every number of the spec. A change applies from the next reading and is recorded.</p>';
    const modes = [['regular', 'Regular'], ['sleep', 'Sleep'], ['exercise', 'Exercise']].map(([k, l]) => `<button type="button" data-act="sim-mode" data-arg="${k}" aria-pressed="${mode === k}" style="${pill(mode === k)}; cursor: pointer">${l}</button>`).join('');
    return `
  <div class="space-top" style="width: 100%; min-height: 100vh; box-sizing: border-box; font-family: Roboto, system-ui, sans-serif; color: #EAF6FF; display: flex; flex-direction: column">
    ${header('<h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: .5px">Simulation</h1>')}
    <div style="width: 100%; max-width: 1260px; margin: 0 auto; box-sizing: border-box; padding: 0 32px 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 12px">
      <span style="font-size: 14px; color: #B8D4E6">Mode (tap to switch):</span>
      ${modes}
      <span style="font-size: 13px; color: #B8D4E6">${S.mode.mode === 'emergency' ? 'Emergency state is on (mode at onset shown). ' : ''}Switching ends the current run and loads the Normal, Alert and Emergency cases for that mode. Run checks the mode first.</span>
    </div>
    <div style="width: 100%; overflow-x: auto">
    <main style="width: 100%; min-width: 1100px; max-width: 1260px; margin: 0 auto; box-sizing: border-box; padding: 8px 32px 36px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px; align-items: start">
      <section aria-label="Left: body, devices and suggested values" style="min-width: 0; box-sizing: border-box; border-radius: 22px; background: rgba(8,38,66,.75); border: 1px solid rgba(0,212,255,.25); padding: 22px; display: flex; flex-direction: column; gap: 14px">
        <h2 style="margin: 0; font-size: 18px; font-weight: 700">Body and devices</h2>
        <div style="position: relative; width: 100%; aspect-ratio: 1 / 1">
          <img src="assets/img/body.png" alt="Human body, front view" style="position: absolute; left: 23.2%; top: 0; width: 53.6%; height: 100%; object-fit: contain">
          <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style="position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible" role="img" aria-label="Devices on the body: vision card at the eyes, thermometer at the mouth, chest patch on the chest, dosimeter in the chest pocket, arm cuff on the upper arm, wrist device on the wrist, fingertip oximeter on a finger, SLAMMD holds the whole body">
            <g stroke="#BFF4FF" stroke-width="2" fill="none"><path d="M482 62 L222 56"></path><path d="M502 276 L222 286"></path><path d="M289 504 L222 506"></path><path d="M440 800 L222 806"></path><path d="M500 86 L778 96"></path><path d="M546 227 L778 206"></path><path d="M624 260 L778 306"></path><path d="M729 572 L778 606"></path></g>
            <g font-family="Roboto, sans-serif" font-size="20" font-weight="700" text-anchor="middle">
              <circle cx="482" cy="62" r="16" fill="#2EE6B6"></circle><text x="482" y="69" fill="#03213A">9</text>
              <circle cx="500" cy="92" r="16" fill="#2EE6B6"></circle><text x="500" y="99" fill="#03213A">6</text>
              <circle cx="502" cy="276" r="18" fill="#00D4FF"></circle><text x="502" y="283" fill="#03213A">1</text>
              <circle cx="546" cy="227" r="18" fill="#00D4FF"></circle><text x="546" y="234" fill="#03213A">3</text>
              <circle cx="624" cy="260" r="16" fill="#2EE6B6"></circle><text x="624" y="267" fill="#03213A">5</text>
              <circle cx="289" cy="504" r="18" fill="#00D4FF"></circle><text x="289" y="511" fill="#03213A">2</text>
              <circle cx="729" cy="572" r="16" fill="#2EE6B6"></circle><text x="729" y="579" fill="#03213A">7</text>
              <circle cx="440" cy="800" r="16" fill="#2EE6B6"></circle><text x="440" y="807" fill="#03213A">8</text>
            </g>
            <g font-family="Roboto, sans-serif" fill="#FFFFFF">
              <text x="215" y="52" font-size="27" font-weight="700" text-anchor="end">9 Near-vision card</text><text x="215" y="80" font-size="21" fill="#B8D4E6" text-anchor="end">in front of the eyes</text>
              <text x="215" y="282" font-size="27" font-weight="700" text-anchor="end">1 Chest patch</text><text x="215" y="310" font-size="21" fill="#B8D4E6" text-anchor="end">worn on the chest</text>
              <text x="215" y="502" font-size="27" font-weight="700" text-anchor="end">2 Wrist device</text><text x="215" y="530" font-size="21" fill="#B8D4E6" text-anchor="end">on the wrist · SOS</text>
              <text x="215" y="802" font-size="27" font-weight="700" text-anchor="end">8 SLAMMD</text><text x="215" y="830" font-size="21" fill="#B8D4E6" text-anchor="end">holds the whole body</text>
              <text x="785" y="92" font-size="27" font-weight="700">6 Thermometer</text><text x="785" y="120" font-size="21" fill="#B8D4E6">mouth or ear</text>
              <text x="785" y="202" font-size="27" font-weight="700">3 Dosimeter</text><text x="785" y="230" font-size="21" fill="#B8D4E6">chest pocket</text>
              <text x="785" y="302" font-size="27" font-weight="700">5 Arm cuff</text><text x="785" y="330" font-size="21" fill="#B8D4E6">upper arm</text>
              <text x="785" y="602" font-size="27" font-weight="700">7 Fingertip</text><text x="785" y="630" font-size="27" font-weight="700">oximeter</text><text x="785" y="658" font-size="21" fill="#B8D4E6">on a finger</text>
            </g>
          </svg>
          <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none" aria-label="Body parts you can open">
            <path class="organ-spot" role="button" tabindex="0" data-act="organ" data-arg="lungs" aria-label="Lungs: show condition" d="M464 182 L447 190 L432 210 L422 235 L417 265 L419 300 L427 322 L452 330 L477 325 L472 300 L470 270 L474 245 L482 215 L480 192 Z M547 182 L532 190 L524 205 L532 225 L544 250 L544 290 L540 318 L562 328 L582 320 L588 295 L589 260 L584 230 L572 205 L560 188 Z"></path>
            <path class="organ-spot" role="button" tabindex="0" data-act="organ" data-arg="heart" aria-label="Heart: show condition" d="M494 218 L482 225 L477 240 L472 262 L474 285 L487 305 L504 320 L522 315 L537 295 L544 270 L540 248 L527 232 L514 220 Z"></path>
            <g class="organ-spot hint" role="button" tabindex="0" data-act="organ" data-arg="kidneys" aria-label="Kidneys: show condition"><ellipse cx="452" cy="396" rx="14" ry="25" transform="rotate(12 452 396)"></ellipse><ellipse cx="548" cy="389" rx="14" ry="25" transform="rotate(-12 548 389)"></ellipse></g>
          </svg>
        </div>
        <p style="margin: -6px 0 0; font-size: 13px; color: #9FEFFF; text-align: center">Tap the lungs, heart or kidneys to see their condition.</p>
        <div style="border-radius: 14px; background: rgba(156,140,255,.1); border: 1px solid rgba(156,140,255,.45); padding: 12px 14px; display: flex; flex-direction: column; gap: 8px">
          <p style="margin: 0; font-size: 13px; font-weight: 700; letter-spacing: .5px; color: #CFC8FF">DEVICES NOT ATTACHED TO THE BODY</p>
          <div style="display: flex; flex-wrap: wrap; gap: 8px">${offBody}</div>
        </div>
        <div style="display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; color: #B8D4E6">
          <span style="display: inline-flex; align-items: center; gap: 6px"><span style="width: 10px; height: 10px; border-radius: 50%; background: #00D4FF"></span>Worn · measures all the time</span>
          <span style="display: inline-flex; align-items: center; gap: 6px"><span style="width: 10px; height: 10px; border-radius: 50%; background: #2EE6B6"></span>Used by hand on the body</span>
          <span style="display: inline-flex; align-items: center; gap: 6px"><span style="width: 10px; height: 10px; border-radius: 50%; background: #9C8CFF"></span>Not attached to the body</span>
        </div>
        <p style="margin: 6px 0 0; font-size: 13px; font-weight: 700; letter-spacing: .5px; color: #B8D4E6">SUGGESTED VALUES · CHOOSE A CASE</p>
        <div role="group" aria-label="Test case" style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding: 6px; border-radius: 14px; background: rgba(3,20,40,.75)">
          ${[['normal', 'Normal'], ['alert', 'Alert'], ['emergency', 'Emergency']].map(([k, l]) => `<button type="button" data-act="case" data-arg="${k}" style="min-height: 44px; border-radius: 10px; cursor: pointer; font-family: Roboto, sans-serif; font-size: 15px; font-weight: 700; border: 0; ${sim.caseKey === k ? 'background: ' + caseColor[k] + '; color: #03213A' : 'background: transparent; color: #CFE6F5'}">${l}</button>`).join('')}
        </div>
        <p style="margin: 0; font-size: 13px; color: #B8D4E6; line-height: 1.45">${esc(sim.caseKey === 'normal' ? C.CASE_NOTES.normal : C.CASE_NOTES[sim.caseKey][mode])}</p>
        <div style="display: flex; flex-direction: column; gap: 10px">${devices}</div>
        <button type="button" data-act="use" style="min-height: 54px; border-radius: 12px; border: 0; background: #00D4FF; color: #03213A; font-family: 'Roboto Mono', monospace; font-size: 18px; font-weight: 700; letter-spacing: 1px; cursor: pointer; box-shadow: 0 0 22px rgba(0,212,255,.4)">USE</button>
        <p style="margin: 0; font-size: 12px; color: #B8D4E6; text-align: center">Fills all 33 suggested values into the right section.</p>
      </section>
      <section aria-label="Right: everything that is measured" style="min-width: 0; box-sizing: border-box; border-radius: 22px; background: rgba(8,38,66,.75); border: 1px solid rgba(0,212,255,.25); padding: 22px; display: flex; flex-direction: column; gap: 9px">
        <h2 style="margin: 0 0 4px; font-size: 18px; font-weight: 700">Everything that is measured</h2>
        <p style="margin: 0 0 4px; font-size: 13px; color: #B8D4E6">Type values here, or press USE on the left to fill them.</p>
        ${group('CONTINUOUS · WORN ON THE BODY', '#00D4FF', 'w')}
        ${group('CONTINUOUS · CABIN SENSORS', '#CFC8FF', 'c')}
        ${group('MANUAL · MEASURED OR ENTERED BY THE ASTRONAUT', '#2EE6B6', 'm')}
        <label style="display: grid; grid-template-columns: 30px minmax(0, 1fr) 120px 64px; gap: 10px; align-items: center; font-size: 14px; margin-top: 8px; padding-top: 14px; border-top: 1px solid rgba(0,212,255,.15)">
          <span></span><span style="font-weight: 700">Hold these values for</span>
          <input type="text" data-field="sim-dur" value="${esc(sim.dur)}" style="min-height: 38px; min-width: 0; padding: 0 10px; border-radius: 8px; border: 1px solid rgba(0,212,255,.25); background: #06375C; color: #EAF6FF; font-family: 'Roboto Mono', monospace; font-size: 14px; font-weight: 500">
          <span style="font-size: 12px; color: #B8D4E6">min</span>
        </label>
        <button type="button" data-act="run" style="min-height: 56px; margin-top: 6px; border-radius: 12px; border: 0; background: #2EE6B6; color: #03213A; font-family: 'Roboto Mono', monospace; font-size: 18px; font-weight: 700; letter-spacing: 1px; cursor: pointer; box-shadow: 0 0 22px rgba(46,230,182,.4)">RUN</button>
        ${resultBox}
        <div style="margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(0,212,255,.15); display: flex; flex-direction: column; gap: 8px">
          <p style="margin: 0; font-size: 13px; font-weight: 700; letter-spacing: .5px; color: #B8D4E6">MORE TEST CONTROLS</p>
          ${det('A', 'A · Profile and pre-flight baseline (demo profile)', panelA)}
          ${det('D', 'D · History counters (blank = from the database)', panelD)}
          ${det('E', 'E · Crew, responsiveness, sensors, SOS', panelE)}
          ${det('F', 'F · Simulated clock', panelF)}
          ${det('G', 'G · Thresholds (every number, editable)', panelG)}
        </div>
      </section>
    </main>
    </div>
    ${sim.organ ? organModal(sim.organ) : ''}
  </div>`;
  };

  const ORGAN_IMG = { lungs: 'assets/img/lungs.png', heart: 'assets/img/heart.png', kidneys: 'assets/img/kidneys.jpg' };
  function organBody(o) {
    const v = E.organView(o);
    const tone = { 0: ['rgba(46,230,182,.16)', '#2EE6B6'], 1: ['rgba(255,181,71,.14)', '#FFB547'], 2: ['rgba(255,181,71,.2)', '#FFB547'], 3: ['rgba(255,84,104,.2)', '#FF5468'] }[Math.min(3, v.status.level)];
    const mark = (r) => r.ok === false ? '<span style="color: #FFB547; font-weight: 700">Outside range</span>' : r.ok ? '<span style="color: #2EE6B6">OK</span>' : '<span style="color: #9DBAD0">–</span>';
    return `<div role="status" style="padding: 12px 14px; border-radius: 12px; background: ${tone[0]}; border: 1px solid ${tone[1]}">
        <p style="margin: 0; font-size: 16px; font-weight: 700; color: ${tone[1]}">${esc(v.status.label)}</p>
        <p style="margin: 4px 0 0; font-size: 14px; line-height: 1.45; color: #EAF6FF">${esc(v.status.text)}</p>
      </div>
      ${v.events.length > 1 ? `<ul style="margin: 0; padding: 0 0 0 18px; font-size: 13px; color: #FFD38F">${v.events.slice(1).map((e) => `<li>${esc(e.label)} · ${esc(e.desc || e.about)}</li>`).join('')}</ul>` : ''}
      <div style="display: flex; flex-direction: column">${v.readings.map((r) => `<div style="display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 12px; padding: 9px 0; border-bottom: 1px solid rgba(0,212,255,.12)">
          <span style="font-size: 14px">${esc(r.name)}</span>
          <span style="font-family: 'Roboto Mono', monospace; font-size: 14px; font-weight: 700; text-align: right">${esc(r.value)}${r.unit ? ' <span style="font-size: 12px; color: #00D4FF">' + esc(r.unit) + '</span>' : ''}</span>
          <span style="font-size: 12px; color: #9DBAD0">Typical: ${esc(r.range)}${r.note ? ' · ' + esc(r.note) : ''}</span>
          <span style="font-size: 12px; text-align: right">${mark(r)}</span>
        </div>`).join('')}</div>
      <p style="margin: 0; font-size: 12px; color: #8FAEC4">Simulated values · ${esc(v.clock)} · ${esc({ regular: 'Regular', sleep: 'Sleep', exercise: 'Exercise' }[v.mode])} mode. Updates while the run goes on.</p>`;
  }
  function organModal(o) {
    const title = { lungs: 'Lungs', heart: 'Heart', kidneys: 'Kidneys' }[o];
    return `<div style="position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box">
      <div data-act="organ-close" aria-hidden="true" style="position: absolute; inset: 0; background: rgba(3,11,23,.78); backdrop-filter: blur(3px)"></div>
      <section role="dialog" aria-modal="true" aria-labelledby="organ-title" style="position: relative; width: min(460px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; box-sizing: border-box; border-radius: 22px; background: rgba(8,38,66,.97); border: 1px solid rgba(0,212,255,.45); box-shadow: 0 20px 60px rgba(0,0,0,.55); padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; color: #EAF6FF; font-family: Roboto, sans-serif">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px">
          <h2 id="organ-title" style="margin: 0; font-size: 22px; font-weight: 700">${title}</h2>
          <button type="button" data-act="organ-close" aria-label="Close" style="display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 12px; border: 1px solid rgba(0,212,255,.35); background: rgba(6,33,66,.65); color: #EAF6FF; cursor: pointer">${IC.x}</button>
        </div>
        <img src="${ORGAN_IMG[o]}" alt="${title}" style="display: block; width: 100%; height: 220px; object-fit: contain; border-radius: 14px; background: radial-gradient(circle at 50% 45%, rgba(0,212,255,.14), rgba(3,20,40,.6) 70%)">
        <div data-live="organ-body" style="display: flex; flex-direction: column; gap: 12px">${organBody(o)}</div>
      </section>
    </div>`;
  }

  /* structure key: when it changes the screen is redrawn; otherwise only data-live nodes are patched */
  const KEYS = {
    emergency: () => { const v = E.emergencyView(); return v ? [v.code, v.display, v.current && v.current.id, v.askOk, v.againNote, v.also, v.searching, v.alarm, v.about, UI.confirmClose].join('|') : 'none'; },
    alert: () => { const a = E.alertView(UI.params.alert && UI.params.alert.id); return a ? [a.id, a.state, a.paused, a.steps.map((x) => x.done).join()].join('|') : 'none'; },
    exercise: () => String(E.exerciseView().on),
    sleep: () => E.state.mode.mode,
    dashboard: () => E.state.mode.mode
  };
  let lastKey = '';
  function screenKey() { const f = KEYS[cur()]; return cur() + ':' + (f ? f() : ''); }

  /* ---------------- render ---------------- */
  function render(full) {
    const sc = cur();
    if (sc !== 'login' && !E.state) { UI.stack = ['login']; }
    const html = (SCREENS[cur()] || SCREENS.dashboard)();
    if (full) { $app.innerHTML = html; window.scrollTo(0, 0); lastKey = screenKey(); return; }
    // live refresh: only nodes marked data-live, so typing and scroll are not disturbed
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    $app.querySelectorAll('[data-live]').forEach((node) => {
      const key = node.getAttribute('data-live');
      const fresh = tmp.querySelector('[data-live="' + key + '"]');
      if (!fresh) return;
      if (node.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if (node.querySelector('[data-keep]')) { patchKeeping(node, fresh); return; }
      if (node.innerHTML !== fresh.innerHTML) node.innerHTML = fresh.innerHTML;
      if (node.getAttribute('style') !== fresh.getAttribute('style')) node.setAttribute('style', fresh.getAttribute('style'));
    });
    const root = $app.firstElementChild, froot = tmp.firstElementChild;
    if (root && froot && root.className !== froot.className) root.className = froot.className;
  }
  // nodes marked data-keep (animated ECG canvases, pulsing heart) survive a live refresh: compare and swap everything around them
  function patchKeeping(node, fresh) {
    const strip = (el) => { const c = el.cloneNode(true); c.querySelectorAll('[data-keep]').forEach((k) => k.replaceWith(document.createElement('i'))); return c.innerHTML; };
    if (strip(node) === strip(fresh)) return;
    const kept = {}; node.querySelectorAll('[data-keep]').forEach((k) => { kept[k.getAttribute('data-keep')] = k; });
    node.innerHTML = fresh.innerHTML;
    node.querySelectorAll('[data-keep]').forEach((k) => { const old = kept[k.getAttribute('data-keep')]; if (old) k.replaceWith(old); });
  }
  function rerenderKeepScroll() { const y = window.scrollY; $app.innerHTML = (SCREENS[cur()] || SCREENS.dashboard)(); window.scrollTo(0, y); lastKey = screenKey(); }

  /* ---------------- events from the engine ---------------- */
  E.on((type, data) => {
    if (type === 'toast') { showToast(data.text, data.tone); return; }
    if (UI.running) return;
    if (type === 'emergency') { if (cur() !== 'emergency') go('emergency'); else rerenderKeepScroll(); return; }
    if (type === 'alert') { if (cur() !== 'alert' && cur() !== 'emergency') go('alert', { id: data.id }); return; }
    if (type === 'exalert') { if (cur() !== 'exercise' && cur() !== 'emergency') go('exercise'); return; }
  });

  function showToast(text, tone, ms) {
    const el = document.createElement('div'); el.className = 'toast ' + (tone || ''); el.setAttribute('role', 'status'); el.textContent = text;
    $toasts.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 450); }, ms || 6500);
    while ($toasts.children.length > 3) $toasts.firstChild.remove();
  }

  function speak(text) { try { const u = new SpeechSynthesisUtterance(text); window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); } catch (e) { /* no speech */ } }

  /* alarm: short beeps while an emergency is open and the crew has not arrived */
  let audio = null, lastBeep = 0;
  function alarmTick() {
    const v = E.state && E.emergencyView();
    if (!v || !v.alarm) return;
    const now = Date.now(); if (now - lastBeep < 1400) return; lastBeep = now;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'square'; o.frequency.value = v.modeAtOnset === 'sleep' ? 1180 : 880;
      g.gain.setValueAtTime(0.0001, audio.currentTime); g.gain.exponentialRampToValueAtTime(v.modeAtOnset === 'sleep' ? 0.12 : 0.06, audio.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.35);
      o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.4);
    } catch (e) { /* audio blocked */ }
  }

  /* ---------------- user actions ---------------- */
  function doRun() {
    const sim = UI.sim;
    UI.running = true; let r;
    try { r = E.run(sim.fields, sim.dur); } finally { UI.running = false; }
    if (!r.ok) { sim.missing = r.missing; sim.result = null; rerenderKeepScroll(); return; }
    sim.missing = null; sim.result = r;
    if (r.level === 3) { go('emergency'); return; }
    if (r.level === 2 && r.screen === 'alert') { go('alert', { id: r.event }); return; }
    if (r.level === 2 && r.screen === 'exercise') { go('exercise'); return; }
    rerenderKeepScroll();
  }

  /* wake-up notification: in-app toast, plus a system notification when the browser allows it */
  function sleepSummary(rec) {
    if (!rec) return;
    const text = 'Good morning. You slept ' + rec.duration + ' (' + rec.from + ' → ' + rec.to + ', ' + rec.cycles + ' full cycle' + (rec.cycles === 1 ? '' : 's') + '). Saved to Records › History.';
    showToast(text, '', 15000);
    try {
      if (!('Notification' in window)) return;
      const send = () => new Notification('Sleep finished', { body: text });
      if (Notification.permission === 'granted') send();
      else if (Notification.permission === 'default') Notification.requestPermission().then((p) => { if (p === 'granted') send(); });
    } catch (e) { /* notifications not available */ }
  }

  function emergencyEnded(msg) {
    UI.confirmClose = false;
    Object.assign(UI.sim, { caseKey: 'normal', fields: {}, dur: '', filled: null, result: null, missing: null });
    showToast(msg, '');
    if (cur() === 'emergency') back(); else rerenderKeepScroll();
  }

  const ACTIONS = {
    back, exit,
    'login-exit': () => { UI.login = { id: '', name: '', msg: '' }; render(true); },
    logout: () => { E.logout(); UI.stack = ['login']; UI.login = { id: '', name: '', msg: '' }; render(true); },
    sos: () => { E.touch(); const r = E.sos('sos_button'); if (r === 'again') showToast(E.emergencyView() && E.emergencyView().againNote || 'Crew called again.', 'bad'); if (cur() !== 'emergency') go('emergency'); else rerenderKeepScroll(); },
    banner: () => { const b = E.dashboardView().banner; if (!b) return; if (b.screen === 'emergency') go('emergency'); else if (b.screen === 'alert') go('alert', { id: b.event }); else { UI.records.tab = 'events'; go('records'); } },
    'tile-checkup': () => go('checkup'),
    'tile-sleep': () => { UI.sleep = { bed: '', msg: '' }; if (E.state.mode.mode === 'emergency') { go('emergency'); return; } E.startSleep(); go('sleep'); },
    'tile-exercise': () => { if (E.state.mode.mode === 'emergency') { go('emergency'); return; } E.startExercise(); go('exercise'); },
    'tile-crewaid': () => { E.crewAidStart('crew'); UI.crew.text = ''; go('crewaid'); },
    'crewaid-crew': () => { E.crewAidStart('crew'); UI.crew.text = ''; go('crewaid'); },
    'report-symptom': () => { E.crewAidStart('self'); UI.crew.text = ''; go('crewaid'); },
    'tile-mental': () => { UI.mental = { pick: null, msg: '' }; go('mental'); },
    'mh-pick': (id) => {
      if (E.mentalChoose(id)) { UI.mental.pick = id; UI.mental.msg = ''; }
      rerenderKeepScroll();
      // narrow screens stack the suggestions below the list: bring them into view
      const panel = $app.querySelector('section[aria-label="What can help"]');
      if (panel && panel.getBoundingClientRect().top > window.innerHeight * 0.6) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    'mh-talk': () => { UI.mental.msg = E.mentalTalk(UI.mental.pick); rerenderKeepScroll(); },
    'mh-unsafe': () => { const t = E.mentalUnsafe(); if (!E.emergencyView()) { UI.mental.msg = t; rerenderKeepScroll(); } },
    'tile-records': () => { UI.records.tab = 'history'; go('records'); },
    'tile-reminders': () => go('reminders'),
    'tile-simulation': () => { UI.sim.result = null; UI.sim.missing = null; go('simulation'); },
    'sleep-bed-save': () => { const r = E.setBedtime(UI.sleep.bed || document.getElementById('bedtime').value); UI.sleep.msg = r.msg; if (r.ok) UI.sleep.bed = ''; rerenderKeepScroll(); },
    awake: () => { UI.sleep = { bed: '', msg: '' }; sleepSummary(E.endSleep()); UI.stack = ['login', 'dashboard']; render(true); },
    'end-exercise': () => { E.endExercise(); UI.stack = ['login', 'dashboard']; render(true); },
    'measure-now': () => go('checkup'),
    'alert-done': (arg) => { const a = E.alertView(UI.params.alert && UI.params.alert.id); if (a) E.alertStepDone(a.id, +arg); rerenderKeepScroll(); },
    'em-done': () => { E.emergencyStepDone(); rerenderKeepScroll(); const v = E.emergencyView(); if (v) speak(v.current ? v.current.text : v.staySafe); },
    'em-again': () => { E.emergencyStepsAgain(); rerenderKeepScroll(); },
    'read-aloud': () => { E.touch(); const v = E.emergencyView(); if (v) speak(v.current ? v.current.text : v.staySafe); },
    'im-ok': () => { if (E.imOk()) emergencyEnded("You answered I'm OK. Emergency ended, values are back to Normal."); else rerenderKeepScroll(); },
    'not-arrived': () => { E.touch(); E.crewNotArrived('button'); rerenderKeepScroll(); },
    'no-emergency': () => { E.touch(); UI.confirmClose = true; rerenderKeepScroll(); },
    'end-emergency': () => { E.touch(); UI.confirmClose = 'end'; rerenderKeepScroll(); },
    'end-emergency-yes': () => {
      E.endEmergency(E.state.crewAid && E.state.crewAid.entry === 'crew' && cur() === 'crewaid' ? 'crew mate' : 'astronaut');
      emergencyEnded('Emergency ended. Values are back to Normal.');
    },
    'no-emergency-cancel': () => { UI.confirmClose = false; rerenderKeepScroll(); },
    'no-emergency-yes': () => { UI.confirmClose = false; E.noEmergency(E.state.crewAid && E.state.crewAid.entry === 'crew' && cur() === 'crewaid' ? 'crew mate' : 'astronaut'); showToast('Emergency closed by you. The app keeps reading the signals.', ''); back(); },
    'ca-analyze': () => {
      const self = E.state.crewAid.entry === 'self';
      UI.running = !self; try { E.crewAidAnalyze(UI.crew.text); } finally { UI.running = false; }
      if (cur() === 'crewaid') rerenderKeepScroll();
    },
    'ca-answer': (arg) => {
      const [q, o] = arg.split('|'); const self = E.state.crewAid.entry === 'self';
      UI.running = !self; try { E.crewAidAnswer(q, o); } finally { UI.running = false; }
      if (cur() === 'crewaid') rerenderKeepScroll();
    },
    'ck-how': (id) => { UI.checkup.open = UI.checkup.open === id ? null : id; rerenderKeepScroll(); },
    'ck-save': (id) => {
      const it = CHECK_ITEMS.find((x) => x.id === id);
      const vals = it.fields.map((f, i) => { const v = (UI.checkup.vals[id] || [])[i]; return v == null ? (f[0] === 's' ? f[2][0] : '') : v; });
      const r = E.saveCheckup(id, vals);
      UI.checkup.msg[id] = { ok: r.ok, text: r.msg };
      if (r.ok && id !== 'mood') UI.checkup.vals[id] = [];
      if (r.ok && id === 'mood') UI.checkup.vals[id] = [];
      if (cur() === 'checkup') rerenderKeepScroll();
    },
    'rec-tab': (k) => { UI.records.tab = k; rerenderKeepScroll(); },
    'rec-filter': (k) => { UI.records.filter = k; rerenderKeepScroll(); },
    'rem-done': (id) => { E.reminderDone(id); rerenderKeepScroll(); },
    'rem-snooze': (id) => { const m = E.reminderSnooze(id); if (m) showToast(m, 'watch'); rerenderKeepScroll(); },
    'rem-delete': (id) => { E.reminderDelete(id); rerenderKeepScroll(); },
    case: (k) => { UI.sim.caseKey = k; rerenderKeepScroll(); },
    organ: (o) => { UI.sim.organ = o; UI.sim.organFrom = o; rerenderKeepScroll(); const c = $app.querySelector('[role="dialog"] [data-act="organ-close"]'); if (c) c.focus(); },
    'organ-close': () => { const from = UI.sim.organFrom; UI.sim.organ = null; rerenderKeepScroll(); const s = from && $app.querySelector('[data-act="organ"][data-arg="' + from + '"]'); if (s) s.focus(); },
    'sim-mode': (k) => {
      E.endSimRun();
      if (k === 'sleep') { E.endExercise(); E.startSleep(); } else if (k === 'exercise') { E.endSleep(); E.startExercise(); } else { E.endSleep(); E.endExercise(); }
      E.state.mode.exEnd = null; // a switch here is a test reset: no 30-min post-exercise recovery window
      E.endSimRun();
      Object.assign(UI.sim, { caseKey: 'normal', fields: {}, dur: '', filled: null, result: null, missing: null });
      rerenderKeepScroll();
    },
    use: () => {
      const S = E.state; const mode = S.mode.mode === 'emergency' ? (S.mode.onsetMode || 'regular') : S.mode.mode;
      const v = caseValues(mode, UI.sim.caseKey); UI.sim.dur = v.dur; delete v.dur;
      UI.sim.fields = v; UI.sim.filled = UI.sim.caseKey; UI.sim.missing = null; rerenderKeepScroll();
    },
    run: doRun,
    'open-result': () => { const r = UI.sim.result; if (!r) return; if (r.screen === 'emergency') go('emergency'); else if (r.screen === 'alert') go('alert', { id: r.event }); else if (r.screen === 'exercise') go('exercise'); else if (r.screen === 'records') { UI.records.tab = 'events'; go('records'); } },
    'crew-arrived': () => { const ok = E.crewArrived(); UI.sim.ctlMsg = ok ? 'Crew is with you.' : 'No emergency is open.'; rerenderKeepScroll(); },
    'strong-tap': () => { E.sos('strong_tap'); go('emergency'); },
    erase: () => {
      UI.sim.eraseStep = (UI.sim.eraseStep || 0) + 1;
      if (UI.sim.eraseStep >= 3) { E.erase(); UI.sim = { fields: {}, dur: '', caseKey: 'normal', filled: null, result: null, missing: null, open: {}, profileMsg: '', eraseStep: 0, voice: '' }; UI.stack = ['login']; UI.login = { id: '', name: '', msg: 'All data for that identity was erased.' }; render(true); return; }
      rerenderKeepScroll();
    },
    clock: (ms) => {
      UI.running = true; let stopped; try { stopped = E.advance(+ms); } finally { UI.running = false; }
      if (E.emergencyView() && stopped) { go('emergency'); return; }
      const a = E.alertView(); rerenderKeepScroll();
      if (a && a.state === 'act' && E.state.mode.mode === 'regular' && !a.paused && !UI.params._seen) { /* alert navigation happens through engine events after the jump */ }
    },
    pause: () => { E.togglePause(); rerenderKeepScroll(); }
  };

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]'); if (!el) return;
    const act = el.getAttribute('data-act'); const fn = ACTIONS[act];
    if (!fn) return;
    ev.preventDefault();
    if (E.state) E.touch();
    if (act !== 'erase' && UI.sim.eraseStep) UI.sim.eraseStep = 0;
    fn(el.getAttribute('data-arg'));
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && UI.sim.organ && cur() === 'simulation') { ACTIONS['organ-close'](); return; }
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[role="button"][data-act]')) { ev.preventDefault(); ev.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); } // also SVG body parts (no .click())
    if (ev.key === 'Enter' && ev.target.matches('[data-field="sim-voice"]')) { ev.preventDefault(); voiceCommand(ev.target.value); }
  });
  function voiceCommand(text) {
    const r = E.voice(text);
    UI.sim.voice = '';
    if (r) { go('emergency'); } else { UI.sim.ctlMsg = 'Not a command phrase. Use "SOS", "Call crew" or "Emergency".'; rerenderKeepScroll(); }
  }
  document.addEventListener('submit', (ev) => {
    if (ev.target.matches('[data-form="login"]')) {
      ev.preventDefault();
      const bad = E.serialError(UI.login.id); // block submit before it reaches the engine
      if (bad) { UI.login.msg = bad; render(true); return; }
      const r = E.login(UI.login.id, UI.login.name);
      if (!r.ok) { UI.login.msg = r.msg; render(true); return; }
      UI.login.msg = ''; UI.stack = ['login', 'dashboard']; render(true);
    }
  });
  // serial number: stop non-digits before they appear (the input handler below still cleans paste, autofill and mobile keyboards)
  document.addEventListener('beforeinput', (ev) => {
    if (ev.target.getAttribute && ev.target.getAttribute('data-field') === 'login.id' && ev.data && /[^0-9]/.test(ev.data)) { ev.preventDefault(); serialHint(ev.target.value, true); }
  });
  // live line under the serial field: digit count, or the error as soon as a non-digit is typed or pasted
  function serialHint(value, invalid) {
    const h = document.getElementById('serial-hint'); if (!h) return;
    h.textContent = invalid ? E.serialError('x') : value.length + ' / ' + C.SERIAL_DIGITS + ' digits · numbers only';
    h.style.color = invalid ? '#FFD38F' : '#9FC6DD'; h.style.fontWeight = invalid ? '700' : '400';
  }
  document.addEventListener('input', (ev) => {
    const t = ev.target; const f = t.getAttribute('data-field');
    if (f) {
      if (f === 'login.id') { // digits only, at most SERIAL_DIGITS (also cleans pasted or autofilled text)
        const bad = /[^0-9]/.test(t.value);
        const d = t.value.replace(/[^0-9]/g, '').slice(0, C.SERIAL_DIGITS); if (d !== t.value) t.value = d; UI.login.id = d;
        serialHint(d, bad);
      }
      else if (f === 'login.name') UI.login.name = t.value;
      else if (f === 'crew.text') UI.crew.text = t.value;
      else if (f === 'sim-dur') UI.sim.dur = t.value;
      else if (f === 'sim-voice') UI.sim.voice = t.value;
      else if (f === 'sleep.bed') UI.sleep.bed = t.value;
      else if (f.startsWith('sim.')) UI.sim.fields[f.slice(4)] = t.value;
      else if (f.startsWith('ck.')) { const [, id, i] = f.split('.'); (UI.checkup.vals[id] = UI.checkup.vals[id] || [])[+i] = t.value; }
    }
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    const f = t.getAttribute('data-field');
    if (f && f.startsWith('ck.') && t.tagName === 'SELECT') { const [, id, i] = f.split('.'); (UI.checkup.vals[id] = UI.checkup.vals[id] || [])[+i] = t.value; }
    if (f === 'sim-voice' && t.value.trim()) { voiceCommand(t.value); return; }
    const p = t.getAttribute('data-profile');
    if (p) { const errs = E.setProfile({ [p]: t.value }); UI.sim.profileMsg = errs.length ? 'Not saved: ' + errs.join(', ') + ' is invalid.' : 'Saved. Every change is recorded.'; rerenderKeepScroll(); }
    const c = t.getAttribute('data-counter');
    if (c) E.setCounter(c, t.value.trim());
    const k = t.getAttribute('data-control');
    if (k) {
      let v = t.value;
      if (k === 'crewResponds' || k === 'responsive') v = v === 'true';
      if (k === 'crewAfter') { v = Number(v); if (!Number.isFinite(v) || v < 0) { UI.sim.ctlMsg = 'Enter seconds, e.g. 10.'; rerenderKeepScroll(); return; } }
      if (k === 'spacewalks') { E.state.profile.spacewalks = v === 'true'; E.state.db.profile.push({ t: E.state.clock.t, spacewalks: v === 'true' }); return; }
      E.setControl(k, v);
      if (k === 'responsive' && v === false && E.emergencyView()) { go('emergency'); return; }
    }
    const thk = t.getAttribute('data-th');
    if (thk && !E.setThreshold(thk, t.value)) { t.value = E.state.th[thk]; }
  });
  document.addEventListener('toggle', (ev) => { const d = ev.target; if (d.matches && d.matches('[data-details]')) UI.sim.open[d.getAttribute('data-details')] = d.open; }, true);

  /* ---------------- Exercise Mode ECG monitor ----------------
     Illustrative trace (the app has heart rate, not raw ECG samples): a P-QRS-T template repeated
     at the measured rate, scrolling right to left. The two canvases form one strip that runs behind
     the heart-rate number. Heart icon pulses on each R peak; the line glows briefly at the peak. */
  const ECG = { beats: [], next: 0, lastR: -1, bpm: 0, live: false, hrAt: 0, speed: 95 /* css px per second */ };
  const reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const g = (t, mu, w, a) => a * Math.exp(-((t - mu) * (t - mu)) / (2 * w * w));
  const R_AT = 0.21; // seconds from beat start to the R peak
  function beatShape(t, rr) {
    if (t < -0.05 || t > 0.9) return 0;
    const q = Math.sqrt(rr); // QT shortens as the rate rises
    return g(t, 0.08, 0.022, 0.11) + g(t, R_AT - 0.022, 0.008, -0.12) + g(t, R_AT, 0.0095, 1) + g(t, R_AT + 0.026, 0.011, -0.26) + g(t, R_AT + 0.25 * q, 0.042 * q, 0.27);
  }
  function ecgValue(t) {
    let v = 0.008 * Math.sin(t * 2.1) + 0.005 * Math.sin(t * 7.3 + 1.7); // slight baseline wander
    for (let i = ECG.beats.length - 1; i >= 0; i--) { const b = ECG.beats[i]; const d = t - b.t; if (d > 0.9) break; v += beatShape(d, b.rr); }
    return v;
  }
  function ecgFrame(ms) {
    requestAnimationFrame(ecgFrame);
    const canvases = $app.querySelectorAll('canvas[data-ecg]');
    if (!canvases.length || !E.state) return;
    const now = ms / 1000;
    if (!ECG.bpm || now - ECG.hrAt > 0.5) { // heart rate from the engine twice a second
      ECG.hrAt = now; const hr = E.exerciseView().hr;
      ECG.live = typeof hr === 'number'; ECG.bpm = Math.min(220, Math.max(30, ECG.live ? hr : 60));
      if (!ECG.next || ECG.next < now - 2) { ECG.beats = []; ECG.next = now - 20; } // (re)start: fill the whole visible strip
    }
    while (ECG.next <= now + 0.05) { // schedule beats; rate changes apply from the next beat, so the line never jumps
      const rr = 60 / ECG.bpm * (1 + (Math.random() - 0.5) * 0.03); // small natural beat-to-beat variation
      ECG.beats.push({ t: ECG.next, rr }); ECG.next += rr;
    }
    while (ECG.beats.length && ECG.beats[0].t < now - 25) ECG.beats.shift();
    const still = reducedMotion.matches; const t0 = now;
    // reduced motion: a still strip at the current rate (no scrolling, no pulsing)
    const rrS = 60 / ECG.bpm, val = still ? (t) => { const m = ((t % rrS) + rrS) % rrS; return beatShape(m, rrS) + beatShape(m + rrS, rrS); } : ecgValue;
    const at = still ? 0 : t0;
    // R peak reached: pulse the heart and the glow
    const lastBeat = ECG.beats.filter((b) => b.t + R_AT <= t0).pop();
    if (lastBeat && lastBeat.t !== ECG.lastR) {
      ECG.lastR = lastBeat.t; ECG.peakAt = lastBeat.t + R_AT;
      const heart = $app.querySelector('[data-ecg-heart]');
      if (heart && heart.animate && !still) heart.animate([
        { transform: 'scale(1)', filter: 'drop-shadow(0 0 0 rgba(0,212,255,0))' },
        { transform: 'scale(1.13)', filter: 'drop-shadow(0 0 9px rgba(0,212,255,.85))', offset: 0.22 },
        { transform: 'scale(1)', filter: 'drop-shadow(0 0 0 rgba(0,212,255,0))' }
      ], { duration: Math.min(480, lastBeat.rr * 650), easing: 'ease-out' });
    }
    const glow = !still && ECG.peakAt != null ? Math.exp(-Math.max(0, t0 - ECG.peakAt) / 0.14) : 0;
    const dpr = window.devicePixelRatio || 1;
    const right = $app.querySelector('canvas[data-ecg="r"]'), left = $app.querySelector('canvas[data-ecg="l"]');
    const rBox = right && right.getBoundingClientRect(), lBox = left && left.getBoundingClientRect();
    canvases.forEach((c) => {
      const w = c.clientWidth, h = c.clientHeight; if (!w || !h) return;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      // seconds behind "now" at this canvas's right edge (left canvas continues the strip past the centre)
      const lag = c === left && rBox && lBox ? (rBox.right - lBox.right) / ECG.speed : 0;
      const y = (v) => h * 0.64 - v * h * 0.52;
      ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const grad = ctx.createLinearGradient(0, 0, w, 0); // fade the oldest part, like phosphor on a monitor
      const a = ECG.live ? 1 : 0.45;
      if (c === left) { grad.addColorStop(0, 'rgba(242,248,255,0)'); grad.addColorStop(0.35, `rgba(242,248,255,${a})`); grad.addColorStop(1, `rgba(242,248,255,${a})`); }
      else { grad.addColorStop(0, `rgba(242,248,255,${a})`); grad.addColorStop(1, `rgba(242,248,255,${a})`); }
      ctx.strokeStyle = grad; ctx.shadowColor = 'rgba(0,212,255,.9)'; ctx.shadowBlur = (2 + 10 * glow) * (ECG.live ? 1 : 0.5);
      ctx.beginPath();
      for (let px = 0; px <= w; px += 1) { const v = val(at - lag - (w - px) / ECG.speed); px ? ctx.lineTo(px, y(v)) : ctx.moveTo(px, y(v)); }
      ctx.stroke();
      if (c === right) { // bright write head at the newest point
        ctx.shadowBlur = 8 + 8 * glow; ctx.fillStyle = ECG.live ? '#BFF4FF' : 'rgba(191,244,255,.5)';
        ctx.beginPath(); ctx.arc(w - 2, y(val(at)), 2.2, 0, Math.PI * 2); ctx.fill();
      }
    });
  }
  if (window.requestAnimationFrame) requestAnimationFrame(ecgFrame);

  /* ---------------- clock ---------------- */
  setInterval(() => {
    if (!E.state) return;
    const before = E.state.episode;
    E.realTick();
    alarmTick();
    if (cur() !== 'login') {
      const k = screenKey();
      const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && $app.contains(document.activeElement);
      if (k !== lastKey && !typing) rerenderKeepScroll(); else render(false);
    }
    if (!before && E.state && E.state.episode && cur() !== 'emergency') go('emergency');
  }, 500);

  render(true);
})();
