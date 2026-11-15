/* =====================================================================
   Astronaut Health Monitor — content (texts and numbers from the spec)
   Everything the astronaut reads comes from the algorithm document:
   section 17 (emergency steps), 12.3 (pattern steps), 11.3 (categories),
   13.3 (Crew Aid keywords), 15 (reminders), 3 / 8 (thresholds).
   ===================================================================== */
(function (global) {
  'use strict';

  const MP = '[Mission plan text]';

  /* ---------- 11.3 "This is about" categories ---------- */
  const CATEGORY_BY_CODE = {
    E1: 'responding and movement', E5: 'responding and movement',
    E2: 'heart', E3: 'heart', P1: 'heart',
    E4: 'head and nerves', P3: 'head and nerves',
    E6: 'breathing', E7: 'breathing', P5: 'breathing',
    E8: 'injury and pain', E11: 'injury and pain', P8: 'injury and pain',
    E9: 'temperature', E13: 'temperature', P6: 'temperature', P9: 'temperature',
    E10: 'cabin air', E12: 'pressure change',
    E14: 'stomach and drinking', P4: 'stomach and drinking',
    E15: 'eyes', E16: 'sleep and mood', P10: 'sleep and mood',
    E17: 'radiation', P11: 'radiation', E18: 'not known yet',
    P2: 'exercise', P7: 'medicine', P12: 'long-term changes', SENSOR: 'a sensor'
  };
  const CATEGORY_BY_SIGNAL = {
    hr: 'heart rate', ecg: 'heart rate', pause: 'heart rate', hrv: 'heart rate',
    spo2: 'breathing', fspo2: 'breathing', rr: 'breathing', apnea: 'breathing',
    core: 'temperature', skin: 'temperature', sys: 'blood pressure', dia: 'blood pressure',
    o2: 'cabin air', press: 'cabin air', co2: 'cabin air', cont: 'cabin air', smoke: 'cabin air',
    rad: 'radiation', dose: 'radiation', spe: 'radiation', sensor: 'a sensor'
  };

  /* ---------- 10.3 display priority ---------- */
  const EMERGENCY_ORDER = ['E1', 'E18', 'E6', 'E10', 'E17', 'E7', 'E2', 'E3', 'E4', 'E5', 'E8', 'E11', 'E9', 'E12', 'E13', 'E14', 'E15', 'E16'];

  /* Short action-only labels for "Also active: ..." (no condition names) */
  const ALSO_LABEL = {
    E1: 'stay still, help is coming', E2: 'rest, no effort', E3: 'stay secured and still',
    E4: 'head supported, checks on screen', E5: 'secure yourself, away from equipment',
    E6: 'breathe slowly', E7: 'use the auto-injector', E8: 'press on the wound',
    E9: 'cool down or warm up gently', E10: 'protect yourself from the air',
    E11: 'stay clear of the equipment', E12: 'stop, oxygen per plan', E13: 'rest, keep away from others',
    E14: 'small sips only, secure yourself', E15: 'protect the eye', E16: 'private support',
    E17: 'go to the shielded area', E18: 'stay still, help is coming'
  };

  /* ---------- Section 17: emergency steps (A, B), responder lines ----------
     Step n in A and B shares one step ID (E2.1 ...).                         */
  const EMERGENCIES = {
    E1: {
      A: ['Stay still. Stay secured.', 'Help is being called.', 'Breathe slowly.', 'Do not eat or drink.', 'Leave all medical equipment alone. The crew will bring it.'],
      B: ['Stay still. Stay secured.', 'Crew are coming.', 'Keep breathing slowly.', 'Tell them when it started.', 'Do not try to move toward them.'],
      responder: ['Check if they respond and breathe normally.', 'Not breathing normally: start CPR with the mission-approved microgravity method (per mission plan).', 'Attach the AED and follow it.', 'Record collapse time, CPR start, analyses and shocks.', 'If circulation returns, keep monitoring until medical takes over.']
    },
    E2: {
      A: ['Stop all activity. Secure yourself in a comfortable resting position.', 'Stay still. Do not do any test or effort.', 'Leave all medical equipment alone. The crew will bring it.', 'The app saved the time your symptoms began. Tap Correct, or tell the app the right time.', 'Take no medicine unless your mission plan or medical tells you.', 'If you feel faint, stay secured and keep your device within reach.'],
      B: ['Stop all activity. Secure yourself in a comfortable resting position.', 'Stay still. Breathe slowly.', 'Leave all medical equipment alone. The crew will bring it.', 'Tell the crew when it started and what you feel.', 'Loosen tight clothing.', 'Do not move toward the crew.', 'Take no medicine unless your mission plan or medical tells you.', 'Feeling better does not end this. Stay secured.'],
      responder: ['Stop their activity. Secure them in a comfortable resting position.', 'Bring the 12-lead ECG unit and the AED.', 'Take heart rate and blood pressure.', 'Give medicine only as the mission plan says. ' + MP, 'Stay with them and watch their breathing.']
    },
    E3: {
      A: ['Stop everything. Secure yourself.', 'Stay still and rest. Do not push off or move around.', 'Do not rub or squeeze any swollen limb.', 'Keep your garment on and your device within reach.', 'Leave all medical equipment alone. The crew will bring it.', 'If you faint again or get chest pain, tell the app.'],
      B: ['Stop everything. Secure yourself.', 'Stay still and rest. Do not push off or move around.', 'Keep any swollen limb still. Do not rub it.', 'Keep your garment on and your device within reach.', 'Leave all medical equipment alone. The crew will bring it.', 'If it happens again, tell the crew and the app.'],
      responder: ['Take an ECG and attach the AED.', 'Compare both limbs.', 'Take heart rate, SpO2, breathing rate and blood pressure.', 'Ultrasound only if medical directs.']
    },
    E4: {
      A: ['Secure yourself. Stay still with your head supported. Leave all medical equipment alone. The crew will bring it.', 'The app saved the time your symptoms began, or when you were last normal. Correct it if it is wrong.', 'If you can do it safely, do the three checks on screen: smile, squeeze a handrail with each hand, say the sentence.', 'Do not eat, drink or take any medicine, including aspirin, unless medical tells you.', 'Do the checks again each time the app asks.'],
      B: ['Secure yourself. Stay still with your head supported. Leave all medical equipment alone. The crew will bring it.', 'The app saved the time your symptoms began, or when you were last normal. Correct it if it is wrong.', 'If you can do it safely, do the three checks on screen: smile, squeeze a handrail with each hand, say the sentence.', 'Do not eat, drink or take any medicine, including aspirin, unless medical tells you.', 'Do the checks again each time the app asks.'],
      responder: ['Check their smile, grip strength in both hands and speech.', 'Check consciousness and breathing.', 'Take vitals only if it causes no delay.', 'Blood-sugar check if available (needs medical approval).', 'No food, drink or aspirin until medical says.']
    },
    E5: {
      A: ['If you feel a warning (odd smell, odd feeling, sudden confusion), secure yourself now.', 'Move away from equipment.', 'The app is timing the event.'],
      B: ['If you feel a warning, secure yourself now.', 'Move away from equipment.', 'Crew are coming. Stay secured.'],
      responder: ['Record the start time and time the seizure.', 'Clear nearby equipment and protect the head. Do not hold the person down. Nothing in the mouth.', 'Keep the airway clear (recovery position adapted to microgravity per mission procedure).', 'When movement stops, check responsiveness and breathing. No food, drink or pills until fully alert.', 'Stay with them. Escalate at once if it lasts over 5 minutes, repeats, breathing is hard, or there is injury.']
    },
    E6: {
      A: ['Stop activity. Secure yourself in a steady, comfortable position. Leave all medical equipment alone. The crew will bring it.', 'Breathe slowly: in through your nose, out through pursed lips.', 'Look at the cabin oxygen, pressure and CO2 on screen. If an air alarm is on, follow the air checklist and go to the safe area if it says so.', 'Use oxygen or breathing support only as your mission plan says. ' + MP, 'A normal oxygen number does not end this while breathing is still hard.'],
      B: ['Stop activity. Secure yourself in a steady, comfortable position. Leave all medical equipment alone. The crew will bring it.', 'Stay still. Breathe slowly. Talk only when needed.', 'Look at the cabin oxygen, pressure and CO2 on screen. If an air alarm is on, follow the air checklist and go to the safe area if it says so.', 'Start oxygen only as your mission plan says. ' + MP],
      responder: ['Help them into a steady, secured position.', 'Check cabin oxygen, pressure and CO2 on screen. If an air alarm is on, follow the air checklist.', 'Take SpO2, breathing rate, heart rate and blood pressure, without delaying care.', 'Start oxygen only as the mission plan says. ' + MP, 'Stay with them. Tell them to breathe slowly, in through the nose, out through pursed lips.']
    },
    E7: {
      A: ['Move away from what caused it, if it is safe.', 'Use your epinephrine auto-injector now. Follow the steps on screen. ' + MP + ' The app saves the time.', 'Allergy tablets and steroids never replace the injector. Take them only after, and only as your mission plan says.', 'Stay secured. Keep your airway open. Stay still.', 'Do not think it is over when you feel better. A second reaction can come. Medical decides when it ends.'],
      B: ['Move away from what caused it, if it is safe.', 'Use the auto-injector now. Do not wait for the crew. ' + MP, 'Allergy tablets and steroids never replace the injector. Take them only after, and only as your mission plan says.', 'Stay secured. Keep your airway open. Stay still.', 'Do not think it is over when you feel better. A second reaction can come. Medical decides when it ends.'],
      responder: ['Bring a second auto-injector dose.', 'Watch breathing, SpO2, heart rate and blood pressure.', 'Repeat doses only per protocol. ' + MP]
    },
    E8: {
      A: ['Secure yourself. Find where the bleeding is.', 'Put on gloves if you can reach them. Press hard on the wound with sterile gauze or a dressing. Do not lift it to look.', 'Blood floats as droplets here. Follow the clean-up steps on screen.', 'If a limb is bleeding badly and pressing does not stop it, use a tourniquet as your mission plan says. ' + MP + ' Note the time. Do not take it off.', 'If you hit your head, hurt your neck or back, feel weak in your legs, feel numb in the groin area, or lose control of your bladder or bowels: do not move that area. Stay still.', 'Splint a possible broken bone.'],
      B: ['Secure yourself. Find where the bleeding is.', 'Keep pressing. Stay still.', 'Blood floats as droplets here. Follow the clean-up steps on screen.', 'The crew will take over the pressure.'],
      responder: ['Wear gloves.', 'Apply a tourniquet if needed, as the mission plan says. ' + MP, 'Splint, then check circulation and feeling beyond the injury.', 'Watch for shock (cold, clammy, faint with a fast pulse).', 'A head injury, loss of consciousness, severe eye injury or uncontrolled bleeding stays an emergency even if the wound looks small.']
    },
    E9: {
      hot: {
        A: ['Stop activity. Move to a cooler area.', 'Take off extra layers of clothing.', 'Cool yourself with the approved method. ' + MP, 'Drink only if you are alert and can swallow.'],
        B: ['Stop activity. Move to a cooler area.', 'Take off extra layers of clothing.', 'Cool yourself with the approved method. ' + MP, 'Drink only if you are alert and can swallow.', 'Stay still. Keep checking that you are awake and breathing normally.']
      },
      cold: {
        A: ['Stop the cold. Move to a warmer area.', 'Move gently. Take off wet clothing and wrap yourself in dry insulation.', 'Warm up slowly, mainly the middle of your body. No direct heat. Do not rub or massage yourself.', 'Warm, non-alcoholic drinks only if you are alert and can swallow.'],
        B: ['Stop the cold. Move to a warmer area.', 'Move gently. Take off wet clothing and wrap yourself in dry insulation.', 'Warm up slowly, mainly the middle of your body. No direct heat. Do not rub or massage yourself.', 'Warm, non-alcoholic drinks only if you are alert and can swallow.', 'Stay still. Keep checking that you are awake and breathing normally.']
      },
      responder: ['Cool or warm them with the approved method. ' + MP, 'Handle them gently.', 'Watch consciousness, breathing and temperature.', 'Alert medical.']
    },
    E10: {
      A: ['Stop anything that could spread the problem. Do not touch the suspected source.', 'Put on the protective gear shown on screen.', 'Go to the safe area if the checklist says so. Close off the source only if it is safe and allowed.', 'Tell the app your symptoms. The app will show clean-up steps.', 'Do not think it is over when you feel better. The area must be declared safe.'],
      B: ['Stop anything that could spread the problem. Do not touch the suspected source.', 'Put on the protective gear shown on screen.', 'Go to the safe area if the checklist says so. Close off the source only if it is safe and allowed.', 'Tell the app your symptoms. The app will show clean-up steps.', 'Do not think it is over when you feel better. The area must be declared safe.'],
      responder: ['Wear protective gear before you enter. Do not enter if the checklist says the compartment is unsafe.', 'The app lists exposed crew from the record. Ask each to report symptoms.', 'Alert medical and environment support.']
    },
    E11: {
      A: ['If you were shocked, do not touch the equipment again. Stay clear.', 'Cut the power with the spacecraft procedure only if you are able. Check it is safe before you touch anything.', 'If you are awake: check for burns. Cover burns with a sterile dressing. Stay still.', 'If you stop responding, the app alerts and sends data by itself.'],
      B: ['If you were shocked, do not touch the equipment again. Stay clear.', 'Stay still and away from the equipment.', 'If you are awake: check for burns. Cover burns with a sterile dressing. Stay still.'],
      responder: ['Do not touch the astronaut until the source is isolated and confirmed safe.', 'Check responsiveness and breathing.', 'Check burns, heart rate and blood pressure. Take an ECG if available.', 'Cover burns and alert medical. A small burn does not mean the shock was harmless: watch for delayed heart problems.']
    },
    E12: {
      A: ['Stop the activity. Secure yourself.', 'The app saved when your symptoms began and your recent pressure change. Correct it if wrong.', 'Start oxygen as your mission plan says. ' + MP, 'Avoid more pressure changes unless the procedure or medical says so.', 'Do nothing demanding until medical clears you.'],
      B: ['Stop the activity. Secure yourself.', 'The app saved when your symptoms began and your recent pressure change. Correct it if wrong.', 'Start oxygen as your mission plan says. ' + MP, 'Avoid more pressure changes unless the procedure or medical says so.', 'Do nothing demanding until medical clears you.', 'Stay still and keep breathing the oxygen.'],
      responder: ['Check nerve function, vitals and SpO2.', 'Recompression or positioning only per mission procedure and medical.']
    },
    E13: {
      A: ['Secure yourself and rest.', 'Leave all medical equipment alone. The crew will bring it.', 'Do not take any medicine unless your mission plan or medical says.', 'Drink only if you are alert and can swallow.'],
      B: ['Secure yourself and rest.', 'Stay still. Keep away from others.', 'Keep your protective gear on if told.'],
      responder: ['Bring the full vitals set.', 'Medical is alerted at once.']
    },
    E14: {
      A: ['Secure yourself. Stay still.', 'Leave all medical equipment alone. The crew will bring it.', 'Take small sips only if you are alert, can swallow, and the vomiting allows.', 'Catch vomit in the approved bag so it does not float.', 'Use other ways of giving fluid only if your medical plan has them.', 'Tell the app each time you vomit or have diarrhoea.'],
      B: ['Secure yourself. Stay still.', 'Leave all medical equipment alone. The crew will bring it.', 'Take small sips only if you are alert, can swallow, and the vomiting allows.', 'Catch vomit in the approved bag so it does not float.', 'Use other ways of giving fluid only if your medical plan has them.', 'Tell the app each time you vomit or have diarrhoea.', 'The crew will bring the bag and the vitals kit.'],
      responder: ['Take heart rate, blood pressure and temperature.', 'Check the fluid log.', 'Alert medical now.']
    },
    E15: {
      A: ['Stop activity. Secure yourself.', 'Do not rub or press the eye.', 'If a chemical got in the eye, flush with the approved eyewash as your mission procedure says.', 'Cover the hurt eye lightly with a protective shield. Not a pad.', 'Tell the app which eye and when it began.', 'If your face droops, an arm is weak or speech is hard: do the smile, grip and speech checks on screen, note when you last felt normal, and take no food, drink or medicine.'],
      B: ['Stop activity. Secure yourself.', 'Do not rub or press the eye.', 'If a chemical got in the eye, flush with the approved eyewash as your mission procedure says.', 'Cover the hurt eye lightly with a protective shield. Not a pad.', 'Tell the app which eye and when it began.', 'If your face droops, an arm is weak or speech is hard: do the smile, grip and speech checks on screen, note when you last felt normal, and take no food, drink or medicine.', 'Stay still. Keep the shield on.'],
      responder: ['Test acuity in each eye if they can.', 'Alert medical. Retinal imaging and eye pressure follow medical direction.']
    },
    E16: {
      A: ['Stay where you are, or move to a place where you can stay safe, away from anything that could hurt you.', 'You do not have to handle this alone.', 'Medical is being contacted now.', 'Stay on this call.'],
      B: ['Stay where you are, or move to a place where you can stay safe, away from anything that could hurt you.', 'Someone is coming to be with you.', 'Keep talking to medical.'],
      responder: ['Stay with the astronaut. Do not leave them alone.', 'Speak calmly.', 'Remove nearby hazards if it is safe.', 'Keep it private.']
    },
    E17: {
      A: ['Stop what you are doing. Move to the shielded area now. If you were asleep, wake up and go.', 'Note the time you entered the shelter.', 'Stay in the shelter until the app says the dose rate is back to normal.', 'Medical and radiation specialists are being told.', 'After a big dose, the app will show a plan for checks.'],
      B: ['Stop what you are doing. Move to the shielded area now. If you were asleep, wake up and go.', 'Note the time you entered the shelter.', 'Stay in the shelter until the app says the dose rate is back to normal.', 'Medical and radiation specialists are being told.', 'After a big dose, the app will show a plan for checks.', 'If you are free, help anyone who is slow to move, only if the route is safe. Count the crew in the shelter. Report anyone missing at once.'],
      responder: ['Move everyone to the shielded area.', 'Count the crew in the shelter. Report anyone missing at once.', 'Help anyone who is slow to move, only if the route is safe.']
    },
    E18: {
      // Step 3 changed: the E18 quick questions were dropped, so it points to Report a symptom.
      A: ['Stay still. Stay secured.', 'Help is being called.', 'If you can, say what you feel with Report a symptom.', 'Breathe slowly.', 'Do not eat, drink or take any medicine unless medical tells you.'],
      B: ['Stay still. Stay secured.', 'Crew are coming.', 'If you can, say what you feel with Report a symptom.', 'When the crew arrive, they will describe what they see in the app.'],
      responder: ['Read the cause-search findings first.', 'Check responsiveness and normal breathing. If not responsive or not breathing normally, report it here at once.', 'Otherwise ask what they feel and look for visible signs, and enter them here.', 'Follow the steps the app then shows.']
    }
  };

  /* Caution periods after an emergency (14.6), hours. */
  const CAUTION = {
    E1: [96, 72], E2: [96, 72], E3: [96, 72], E4: [96, 72], E5: [96, 72], E6: [6, 24], E7: [6, 24], E8: [24, 24],
    E9: [24, 24], E10: [24, 24], E11: [24, 24], E12: [24, 24], E13: [48, 48], E14: [12, 12], E15: [24, 24],
    E16: [168, 0], E17: [168, 0], E18: [24, 24]
  };

  /* ---------- 12.3 pattern steps ---------- */
  const PATTERNS = {
    P1: { duration: 'short', signs: ['hr_band', 'palpitations', 'dizziness', 'ecg_irregular', 'limb_one_sided', 'spo2_low_trend', 'ecg12_abnormal', 'bp'],
      steps: ['Stop what you are doing. Hold on to a handrail or strap in.', 'Rest for 5 minutes.', 'Measure your heart rate and blood pressure again.', 'If your first heart reading looked unclear, take an ECG with the mission ECG unit.', 'If it keeps happening or you feel worse, medical will be told. It has been noted.'] },
    P2: { duration: 'ongoing', signs: ['rhr_up_3days', 'poor_recovery', 'performance_down', 'missed_sessions', 'fatigue', 'muscle_pain', 'hrv_down'],
      steps: ['Do you feel dizzy, have chest discomfort, a racing heart or unusual breathlessness? If yes, stop the session, secure yourself and tell the app.', 'Check other causes: water, sleep, food, illness, medicines. Fix these first.', 'Keep to your exercise plan. Harder sessions are fine if your plan allows. Log every session.', 'If performance keeps falling, the exercise specialist and medical will review before you raise the effort.'] },
    P3: { duration: 'ongoing', signs: ['headache', 'face_puffiness', 'nasal_congestion', 'blurred_vision', 'near_vision_change', 'eye_pressure', 'acuity_worse'],
      steps: ['Note which eye, near or far vision, and when it began.', 'Do the eye test for each eye.', 'Keep to your fluid plan and your usual vision countermeasures.', 'Medical will be told if this is new, lasting or getting worse.'] },
    P4: { duration: 'short', signs: ['low_fluid', 'dark_urine', 'thirst', 'dizziness', 'vomiting', 'diarrhoea', 'nausea', 'mass_loss'],
      steps: ['If you are alert and able to swallow: drink as your fluid plan says. Default: one small cup (250 mL) every 30 minutes until your daily total is reached.', 'Write down each drink.', 'Take it easy. Do less hard activity.', 'Measure your vitals again at the time in your plan.'] },
    P5: { duration: 'short', signs: ['cabin', 'low_spo2', 'fast_breathing', 'mild_breathlessness', 'headache', 'drowsiness', 'cough', 'eye_skin_irritation', 'dust'],
      steps: ['Tell all crew and the environment operator. (simulated)', 'Check the reading on a second sensor.', 'Follow the ventilation checklist. [Mission checklist text]', 'Fix or close off the source. Move to a safe area only if the checklist says so.', 'Check the readings again until they are normal.'] },
    P6: { duration: 'short', signs: ['fever', 'cough', 'sore_throat', 'rash', 'digestive', 'crew_same', 'sleep_drift'],
      steps: ['If you measured after exercise, measure again after 20 to 30 minutes of rest.', 'Wash or clean your hands. Clean surfaces you touch.', 'Keep away from other crew where you can.', 'Wear protective gear if told to.', 'Run the approved test if you have one. Medical is told.'] },
    P7: { duration: 'short', signs: ['medication'],
      steps: ['Tell the app: which medicine, how much, and when.', 'Check your medical record, the expiry date and how it was stored.', 'Do not change the dose. Do not swap medicines. Do not take extra to make up. Medical is told.'] },
    P8: { duration: 'short', signs: ['back_pain', 'bone_pain', 'fracture_suspected', 'leg_numbness_mild'],
      steps: ['Tell the app where it hurts, when it began, and how bad it is (0 to 10).', 'Stop any movement that makes it worse.', 'Check for numbness, tingling or weakness in your legs. If yes, tell the app at once.', 'Do not exercise. It could make the injury worse. Medical is told.'] },
    P9: { duration: 'short', signs: ['heat_cold_discomfort', 'skin_temp_off', 'core_off'],
      steps: ['If you measured after exercise or in a warm cabin, measure again after 20 to 30 minutes of rest.', 'Cool down or warm up gently as your mission plan says. ' + MP, 'If a mission limit is still passed, medical is told.'] },
    P10: { duration: 'ongoing', private: true, signs: ['poor_nights', 'low_mood', 'high_stress', 'low_motivation', 'poor_concentration', 'sleep_hrv_down', 'awakenings'],
      steps: ['Make your sleep area darker and quieter.', 'Use bright light when you wake up and during your work day. Dim the lights and screens 1 to 2 hours before bed. Keep the sleep area dark all night.', 'Protect your sleep time. Avoid stimulating activity before bed.', 'Do not do high-risk work (spacewalk, critical systems) until medical says.', 'Take sleep medicine only if it is prescribed to you.'] },
    P11: { duration: 'ongoing', signs: ['radiation'],
      steps: ['Look at your accumulated dose, dose rate and history against the limits (Records).', 'Medical and radiation specialists are told as a limit gets close.'] },
    P12: { duration: 'ongoing', signs: ['mass_loss', 'fatigue', 'bone_pain', 'test_abnormal'],
      steps: ['Look at this result next to your earlier results.', 'Review your food and exercise records.', 'Take supplements only if prescribed.'] }
  };

  const SENSOR_STEPS = ['Check that the device is on and touching your skin.', 'Check the battery and the connection.', 'If it still shows No data, medical will be told. It has been noted.'];
  const GENERAL_STEPS = ['Keep them secured and still.', 'Take heart rate, SpO2, breathing rate and blood pressure.', 'Ask again what they feel, and describe any new sign here.', 'Stay with them. The app keeps checking their wearable every 10 s.'];
  const GENERAL_SELF = ['Rest. Drink water if you can.', 'Tell the app if it gets worse.', 'A reminder "How do you feel now?" was added for 60 minutes and 4 hours.'];

  /* ---------- 13.3 Crew Aid keyword list (offline, editable) ----------
     Each entry: [regular expression, symptom codes]. Whole phrases only. */
  const KEYWORDS = [
    [/\b(not breathing|stopped breathing|no breathing|isn'?t breathing|is not breathing)\b/, ['not_breathing']],
    [/\b(unconscious|not responding|unresponsive|no response|doesn'?t respond|does not respond|won'?t wake|not waking up)\b/, ['not_responding']],
    [/\bcollaps(e|ed|ing)\b/, ['collapse']],
    [/\b(gasping)\b/, ['gasping', 'laboured_breathing']],
    [/\b(can'?t breathe|cannot breathe|can not breathe|hard to breathe|struggling to breathe|trouble breathing|difficulty breathing|choking|wheez\w*|noisy breathing|labou?red breathing)\b/, ['laboured_breathing']],
    [/\b(blue lips|lips (are |look |looks )?blue|turning blue)\b/, ['laboured_breathing']],
    [/\b(very short of breath|severely breathless|suddenly breathless)\b/, ['severe_breathlessness']],
    [/\b(short of breath|breathless|out of breath)\b/, ['breathlessness']],
    [/\b(can'?t (talk|speak)|cannot (talk|speak)|barely (talk|speak)|can barely talk)\b/, ['cannot_speak']],
    [/\b(chest pain|pain in (the |his |her |my |their )?chest|chest (pressure|tightness|hurts)|pressure in (the |his |her |my |their )?chest|tight chest)\b/, ['chest_pain']],
    [/\b(pain|ache) (is )?(spreading|going|goes|radiat\w*) (to|into|down) (the |his |her |my |their )?(arm|jaw|back)\b|\bjaw pain\b/, ['pain_spreading']],
    [/\b(cold sweat|sweating a lot|sweaty and pale)\b/, ['cold_sweat']],
    [/\b(nause\w*|feels? sick|queasy)\b/, ['nausea']],
    [/\b(weak|numb|heavy) (left |right )?arm\b|\barm (is |feels )?(weak|numb)\b|\bweak grip\b|\bcan'?t (lift|push|pull) (his |her |my |their |one |the )?arm\b/, ['arm_weakness']],
    [/\b(face|mouth|smile) (is |looks )?(droop\w*|crooked|uneven|lopsided)\b|\bdroop\w*\b/, ['face_droop']],
    [/\b(slurr\w*|garbled speech|speech (is )?(strange|odd|wrong)|can'?t find (the )?words)\b/, ['speech_trouble']],
    [/\b(worst|sudden|severe|very bad|terrible) headache\b/, ['severe_headache']],
    [/\b(headache|head hurts|head ache)\b/, ['headache']],
    [/\b(confus\w*|disoriented|not making sense|doesn'?t know where)\b/, ['confusion']],
    [/\b(can'?t see|cannot see|lost (his |her |my |their )?(vision|sight)|vision loss|went blind)\b/, ['vision_loss']],
    [/\b(sudden(ly)? (vision|sight) change|vision changed suddenly|double vision|seeing double)\b/, ['vision_change']],
    [/\b(blurr(y|ed) vision|vision (is )?blurr\w*)\b/, ['blurred_vision']],
    [/\b(eye pain|eye hurts|pain in (the |his |her |my |their )?eye)\b/, ['eye_pain']],
    [/\b(chemical in (the |his |her |my |their )?eye|splash\w* in (the |his |her |my |their )?eye)\b/, ['chemical_eye', 'eye_injury']],
    [/\b(something in (the |his |her |my |their )?eye|eye injur\w*|hit in the eye)\b/, ['eye_injury']],
    [/\b(blood in (the )?(vomit|stool|poo)|vomit\w* blood|bloody (stool|vomit))\b/, ['blood_vomit_stool']],
    [/\b(bleed\w*|blood (is )?(everywhere|pouring)|won'?t stop bleeding)\b/, ['bleeding']],
    [/\b(deep (cut|wound|gash)|gash|lacerat\w*)\b/, ['deep_wound']],
    [/\b((hit|bang\w*|bump\w*|struck) (his |her |my |their )?head|head injur\w*)\b/, ['head_injury']],
    [/\b(crush\w*|trapped|pinned)\b/, ['crush_injury']],
    [/\b(clammy|cold and pale|pale and cold)\b/, ['shock_signs']],
    [/\b(can'?t (move|feel) (his |her |my |their )?legs?|legs? (are |feel |is )?(weak|numb|paralys\w*))\b/, ['leg_weakness']],
    [/\b(numb (in the )?groin|groin (is )?numb|saddle numb\w*)\b/, ['saddle_numbness']],
    [/\b(wet (himself|herself|myself|themselves)|lost control of (the )?(bladder|bowels?)|incontinen\w*)\b/, ['incontinence']],
    [/\b(very weak|extremely weak|severe weakness|suddenly weak)\b/, ['severe_weakness']],
    [/\b(weak|weakness)\b/, ['unusual_weakness']],
    [/\b(severe|terrible|unbearable|very bad|strong) pain\b/, ['marked_pain']],
    [/\b(back pain|back hurts)\b/, ['back_pain']],
    [/\b(bone pain)\b/, ['bone_pain']],
    [/\b(broken|fractur\w*)\b/, ['fracture_suspected']],
    [/\b(tingling|pins and needles|numb\w*)\b/, ['numbness_tingling']],
    [/\b(shaking|convuls\w*|seizure|fitting|jerking)\b/, ['convulsion']],
    [/\b(fainted|passed out|blacked out|lost consciousness)\b/, ['fainting']],
    [/\b((feels?|feeling|about to|going to|almost|nearly) (faint|pass out)|light-?headed|near(ly)? faint\w*)\b/, ['near_fainting']],
    [/\b(dizz\w*)\b/, ['dizziness']],
    [/\b((tongue|throat|lips?) (is |are )?swell\w*|swollen (tongue|throat|lips?)|throat (is )?closing)\b/, ['throat_swelling']],
    [/\b(hives|welts|rash all over)\b/, ['hives']],
    [/\b(allerg\w*|new (medicine|medication)|stung)\b/, ['allergen_exposure']],
    [/\b(rash)\b/, ['rash']],
    [/\b((leg|calf|arm) (is )?(swollen|swelling)|swollen (leg|calf|arm))\b/, ['limb_swelling']],
    [/\b(electric\w*|electrocut\w*|shocked|zapped|live wire)\b/, ['electric_shock']],
    [/\b(spacewalk|pressure change|depressuri\w*)\b/, ['recent_pressure_change']],
    [/\b(joint pain|joints? hurt|the bends)\b/, ['joint_pain']],
    [/\b(fever\w*|chills|shivering|infection)\b/, ['suspected_infection']],
    [/\b(very hot|too hot|overheat\w*|burning up)\b/, ['heat_exposure', 'feels_hot']],
    [/\b(very cold|too cold|freezing|hypotherm\w*)\b/, ['cold_exposure', 'feels_cold']],
    [/\b(feels? (warm|hot))\b/, ['feels_hot']],
    [/\b(feels? cold)\b/, ['feels_cold']],
    [/\b(can'?t keep (anything|fluids?|water|food) down|cannot keep (anything|fluids?|water|food) down|keeps vomiting|vomiting everything)\b/, ['cannot_keep_fluids', 'vomiting']],
    [/\b(vomit\w*|throwing up|threw up|puking)\b/, ['vomiting']],
    [/\b((severe|terrible|bad|strong) (stomach|abdominal|belly) pain)\b/, ['severe_abdominal_pain']],
    [/\b(diarrh\w*)\b/, ['diarrhoea']],
    [/\b(thirst\w*)\b/, ['thirst']],
    [/\b(space ?sick\w*|motion sick\w*)\b/, ['space_sickness']],
    [/\b(smoke|smoky|fire)\b/, ['smoke_smell']],
    [/\b(smell\w*|odou?r|fumes)\b/, ['odour']],
    [/\b((eyes?|throat|skin) (is |are )?(burn\w*|sting\w*|itch\w*|irritat\w*))\b/, ['eye_skin_irritation']],
    [/\b(burn|burns|burned|burnt)\b/, ['burn']],
    [/\b(dust)\b/, ['dust']],
    [/\b(cough\w*)\b/, ['cough']],
    [/\b(sore throat)\b/, ['sore_throat']],
    [/\b(drows\w*|very sleepy|can'?t stay awake)\b/, ['drowsiness']],
    [/\b(kill (myself|himself|herself|themselves)|suicid\w*|end (my|his|her|their) life|harm (myself|himself|herself|themselves|someone|others)|hurt (myself|himself|herself|themselves|someone|others)|can'?t (stay|keep (myself|himself|herself|themselves)) safe|cannot stay safe|want(s)? to die)\b/, ['self_harm']],
    [/\b(side effect|wrong dose|missed (a |my |his |her )?dose|took too (much|many)|expired (medicine|pill\w*))\b/, ['medication']],
    [/\b(palpitat\w*|racing heart|heart (is )?racing|pounding heart|skipp(ing|ed) beats?)\b/, ['palpitations']],
    [/\b(tired|fatigue\w*|exhausted)\b/, ['fatigue']],
    [/\b(muscle (pain|ache|sore\w*))\b/, ['muscle_pain']],
    [/\b(sad|depressed|low mood|hopeless)\b/, ['low_mood']],
    [/\b(stressed|anxious|panic\w*)\b/, ['high_stress']],
    [/\b(can'?t (concentrate|focus))\b/, ['poor_concentration']],
    [/\b(stomach (pain|ache)|belly ache)\b/, ['digestive']]
  ];

  /* Plain words for a symptom code (Records, Crew Aid) */
  const SYMPTOM_NAMES = {
    not_breathing: 'not breathing', not_responding: 'not responding', collapse: 'collapse', gasping: 'gasping',
    laboured_breathing: 'laboured breathing', severe_breathlessness: 'sudden severe breathlessness', breathlessness: 'breathlessness',
    cannot_speak: 'cannot speak normally', chest_pain: 'chest pain or pressure', pain_spreading: 'pain spreading to arm, jaw or back',
    cold_sweat: 'cold sweat', nausea: 'nausea', arm_weakness: 'arm weakness', face_droop: 'face droop', speech_trouble: 'speech trouble',
    severe_headache: 'sudden severe headache', headache: 'headache', confusion: 'confusion', vision_loss: 'vision loss',
    vision_change: 'sudden vision change', blurred_vision: 'blurred vision', eye_pain: 'severe eye pain', chemical_eye: 'chemical in the eye',
    eye_injury: 'eye injury', blood_vomit_stool: 'blood in vomit or stool', bleeding: 'uncontrolled bleeding', deep_wound: 'deep wound',
    head_injury: 'head injury', crush_injury: 'crush injury', shock_signs: 'cold, clammy, faint', leg_weakness: 'sudden leg weakness',
    saddle_numbness: 'numbness in the saddle area', incontinence: 'loss of bladder or bowel control', severe_weakness: 'sudden severe weakness',
    unusual_weakness: 'unusual weakness', marked_pain: 'marked pain', back_pain: 'back pain', bone_pain: 'localised bone pain',
    fracture_suspected: 'possible broken bone', numbness_tingling: 'numbness or tingling', convulsion: 'convulsion', fainting: 'fainting',
    near_fainting: 'near-fainting', dizziness: 'dizziness', throat_swelling: 'tongue or throat swelling', hives: 'widespread hives',
    allergen_exposure: 'possible allergen or new medicine', rash: 'rash', limb_swelling: 'one-sided limb swelling', electric_shock: 'electric shock',
    recent_pressure_change: 'recent spacewalk or pressure change', joint_pain: 'joint pain', suspected_infection: 'suspected infection',
    heat_exposure: 'heat exposure', cold_exposure: 'cold exposure', feels_hot: 'feels hot', feels_cold: 'feels cold',
    cannot_keep_fluids: 'cannot keep fluids down', vomiting: 'vomiting', severe_abdominal_pain: 'severe abdominal pain', diarrhoea: 'diarrhoea',
    thirst: 'thirst', space_sickness: 'space sickness', smoke_smell: 'smoke', odour: 'odour', eye_skin_irritation: 'eye or skin irritation',
    burn: 'burn', dust: 'dust', cough: 'cough', sore_throat: 'sore throat', drowsiness: 'drowsiness', self_harm: 'cannot stay safe (private)',
    medication: 'medicine problem', palpitations: 'palpitations', fatigue: 'fatigue', muscle_pain: 'muscle pain', low_mood: 'low mood',
    high_stress: 'high stress', poor_concentration: 'poor concentration', digestive: 'stomach ache', cannot_move: 'cannot move or act'
  };

  /* Symptom -> pattern sign (non-emergency grouping, 12.2) */
  const SYMPTOM_SIGNS = {
    palpitations: [['P1', 'palpitations']], dizziness: [['P1', 'dizziness'], ['P4', 'dizziness']], near_fainting: [['P1', 'dizziness']],
    limb_swelling: [['P1', 'limb_one_sided']], fatigue: [['P2', 'fatigue'], ['P12', 'fatigue']], muscle_pain: [['P2', 'muscle_pain']],
    headache: [['P3', 'headache'], ['P5', 'headache']], blurred_vision: [['P3', 'blurred_vision']], thirst: [['P4', 'thirst']],
    vomiting: [['P4', 'vomiting']], diarrhoea: [['P4', 'diarrhoea'], ['P6', 'digestive']], nausea: [['P4', 'nausea']], space_sickness: [['P4', 'nausea']],
    breathlessness: [['P5', 'mild_breathlessness']], drowsiness: [['P5', 'drowsiness']], cough: [['P5', 'cough'], ['P6', 'cough']],
    eye_skin_irritation: [['P5', 'eye_skin_irritation']], dust: [['P5', 'dust']], sore_throat: [['P6', 'sore_throat']], rash: [['P6', 'rash']],
    digestive: [['P6', 'digestive']], suspected_infection: [['P6', 'fever']], medication: [['P7', 'medication']], back_pain: [['P8', 'back_pain']],
    bone_pain: [['P8', 'bone_pain'], ['P12', 'bone_pain']], fracture_suspected: [['P8', 'fracture_suspected']], numbness_tingling: [['P8', 'leg_numbness_mild']],
    feels_hot: [['P9', 'heat_cold_discomfort']], feels_cold: [['P9', 'heat_cold_discomfort']], low_mood: [['P10', 'low_mood']],
    high_stress: [['P10', 'high_stress']], poor_concentration: [['P10', 'poor_concentration']], hives: [['P1', 'palpitations']]
  };

  const DANGEROUS = ['chest_pain', 'fainting', 'near_fainting', 'dizziness', 'severe_breathlessness', 'cannot_speak', 'confusion', 'face_droop', 'arm_weakness', 'speech_trouble', 'severe_headache', 'vision_change', 'bleeding', 'convulsion', 'laboured_breathing', 'not_responding', 'not_breathing', 'collapse'];

  /* ---------- Thresholds panel (G): every number of the spec, editable ---------- */
  const THRESHOLDS = [
    ['Heart rate', [
      ['hr.regular.l1.above', 'Regular · HR Level 1 above (bpm)', 100],
      ['hr.regular.l2.above', 'Regular · HR Level 2 above (bpm)', 120],
      ['hr.regular.l2.minutes', 'Regular · HR Level 2 window (min)', 10],
      ['hr.regular.l3.above', 'Regular · HR Level 3 above (bpm)', 140],
      ['hr.regular.l3.minutes', 'Regular · HR Level 3 window (min)', 5],
      ['hr.regular.l3.low', 'Regular · HR low with symptom (bpm)', 40],
      ['hr.personal.pct', 'Personal tolerance, heart rate (%)', 10],
      ['hr.drop.pct', 'Clear unexplained drop (% below RB)', 20],
      ['hr.sleep.l2.above', 'Sleep · HR Level 2 above (bpm)', 100],
      ['hr.sleep.l2.minutes', 'Sleep · HR Level 2 window (min)', 1],
      ['hr.sleep.l1.low', 'Sleep · HR Level 1 below (bpm)', 35],
      ['hr.sleep.l3.low', 'Sleep · HR Level 3 below (bpm)', 30],
      ['hr.sleep.l3.above', 'Sleep · HR Level 3 above (bpm)', 130],
      ['hr.sleep.climb.pct', 'Sleep · HR climb over 1 h (%)', 15],
      ['ecg.pause.l1', 'ECG pause Level 1 over (s)', 3],
      ['ecg.pause.l3', 'ECG pause Level 3 over (s)', 5],
      ['hr.exercise.l2.pctmax', 'Exercise · HR Level 2 above (% of max)', 95],
      ['hr.exercise.l2.seconds', 'Exercise · HR Level 2 window (s)', 60],
      ['zone.light', 'Zone ceiling · light (% of max)', 63],
      ['zone.moderate', 'Zone ceiling · moderate (% of max)', 76],
      ['zone.vigorous', 'Zone ceiling · vigorous / high-intensity (% of max)', 90],
      ['hr.exercise.drop.bpm', 'Exercise · sudden drop (bpm in 30 s)', 30],
      ['hr.postex.l1.pct', 'Post-exercise · still above RB at 30 min (%)', 20],
      ['hr.context.pctmax', 'No Exercise Mode · HR hold trigger (% of max)', 60],
      ['hr.context.hold.minutes', 'No Exercise Mode · hold Level 1–2 (min)', 10]
    ]],
    ['Breathing', [
      ['rr.regular.l1.above', 'Regular · breathing Level 1 above (/min)', 20],
      ['rr.regular.l2.above', 'Regular · breathing Level 2 above (/min)', 25],
      ['rr.l3.above', 'Breathing Level 3 above (/min, 5 min)', 30],
      ['rr.sleep.l2.above', 'Sleep · breathing Level 2 above (/min)', 20],
      ['rr.sleep.l1.pct', 'Sleep · breathing Level 1 above SB (%)', 10],
      ['apnea.l3.seconds', 'No breathing Level 3 over (s)', 20],
      ['rr.postex.above', 'After stopping · breathing not below (/min)', 25]
    ]],
    ['SpO2', [
      ['spo2.regular.l1.below', 'Regular · SpO2 Level 1 below (%)', 95],
      ['spo2.regular.l2.below', 'Regular · SpO2 Level 2 below (%)', 92],
      ['spo2.regular.urgent.below', 'Regular · SpO2 urgent Level 2 below (%)', 90],
      ['spo2.regular.l3.below', 'Regular · SpO2 Level 3 below (%)', 88],
      ['spo2.l3.minutes', 'SpO2 Level 3 window (min)', 2],
      ['spo2.sleep.l2.below', 'Sleep · SpO2 Level 2 below (%)', 93],
      ['spo2.sleep.l2.total', 'Sleep · total time below (min)', 5],
      ['spo2.sleep.l3.below', 'Sleep · SpO2 Level 3 below (%)', 90],
      ['spo2.exercise.l1.below', 'Exercise · SpO2 Level 1 below (%)', 92],
      ['spo2.exercise.l2.below', 'Exercise · SpO2 Level 2 below (%)', 90],
      ['spo2.exercise.l3.below', 'After stopping · SpO2 Level 3 below (%)', 88],
      ['manual.fresh.minutes', 'Manual value counts for (min)', 10]
    ]],
    ['Temperature', [
      ['core.l1.fever', 'Core · fever at or above (°C)', 38.0],
      ['core.l1.low', 'Core · low below (°C)', 36.0],
      ['core.l3.above', 'Core temp Level 3 at or above (°C)', 40.0],
      ['core.l3.below', 'Core temp Level 3 below (°C)', 35.0],
      ['core.exercise.l2.above', 'Exercise · core Level 2 above (°C)', 38.5],
      ['core.repeat.routine', 'Core repeat wait, routine (min)', 1],
      ['core.repeat.detection', 'Core repeat wait, after a detection (min)', 20],
      ['skin.exercise.rise', 'Exercise · skin rise in 10 min (°C)', 1.0],
      ['skin.sleep.rise', 'Sleep · skin above sleep average (°C)', 0.5]
    ]],
    ['Blood pressure', [
      ['bp.sys.low', 'Systolic below (mmHg)', 90],
      ['bp.sys.high', 'Systolic above (mmHg)', 180],
      ['bp.dia.high', 'Diastolic above (mmHg)', 120],
      ['bp.shift', 'Shift from own trend (mmHg)', 15],
      ['bp.repeat.minutes', 'Repeat after rest (min)', 5]
    ]],
    ['Cabin', [
      ['co2.l1', 'CO2 Level 1 above (mmHg, 60 min)', 2.5],
      ['co2.l2', 'CO2 Level 2 at or above (mmHg, 60 min)', 3.0],
      ['co2.l2b', 'CO2 Level 2 at or above (mmHg, 15 min)', 4.0],
      ['co2.l3', 'CO2 Level 3 at or above (mmHg, 10 min)', 5.3],
      ['o2.l1.low', 'O2 Level 1 below (%)', 20.0], ['o2.l1.high', 'O2 Level 1 above (%)', 22.5],
      ['o2.l2.low', 'O2 Level 2 below (%)', 19.5], ['o2.l2.high', 'O2 Level 2 above (%)', 23.5],
      ['o2.l3.low', 'O2 Level 3 below (%, 2 min)', 17.0],
      ['press.l1.low', 'Pressure Level 1 below (kPa)', 98], ['press.l1.high', 'Pressure Level 1 above (kPa)', 104.5],
      ['press.l2.low', 'Pressure Level 2 below (kPa)', 96.5], ['press.l3.low', 'Pressure Level 3 below (kPa, 2 min)', 90],
      ['cont.l1', 'Contaminant Level 1 (× limit, 10 min)', 0.5], ['cont.l2', 'Contaminant Level 2 (× limit, 10 min)', 1.0],
      ['cont.l3', 'Contaminant Level 3 (× limit)', 5.0]
    ]],
    ['Radiation', [
      ['rad.l1', 'Dose rate Level 1 (mSv/h, 60 min)', 0.054],
      ['rad.l2', 'Dose rate Level 2 (mSv/h, 15 min)', 0.2],
      ['rad.l3', 'Dose rate Level 3 (mSv/h, 2 min)', 1.0],
      ['rad.l3.day', 'Dose in 24 h Level 3 (mSv)', 25],
      ['career.limit', 'Career limit (mSv)', 600],
      ['career.l1.pct', 'Career Level 1 (%)', 50], ['career.l2.pct', 'Career Level 2 (%)', 80], ['career.urgent.pct', 'Career urgent notice (%)', 95]
    ]],
    ['Sensors and timers', [
      ['sensor.l1.minutes', 'Sensor no data Level 1 after (min)', 2],
      ['sensor.l2.minutes', 'Sensor no data Level 2 after (min)', 10],
      ['quality.good', 'Signal quality Good from', 80],
      ['quality.fair', 'Signal quality Fair from', 50],
      ['crew.timer.seconds', 'Crew timer (real s)', 30],
      ['ok.timer.seconds', '"Are you OK?" timer (real s)', 10],
      ['ok.reask.minutes', 'Ask "Are you OK?" again after no touch (real min)', 3],
      ['repeat.missed.minutes', 'Missed manual repeat becomes Level 2 after (min)', 60]
    ]],
    ['Other measurements', [
      ['mood.l1', 'Mood or stress Level 1 from', 5], ['mood.l2', 'Mood or stress Level 2 from', 7],
      ['fluid.l1.pct', 'Fluids Level 1 under plan (%)', 70], ['fluid.l2.pct', 'Fluids Level 2 under plan (%)', 50],
      ['mass.l1.pct', 'Body mass loss Level 1 (%)', 2], ['mass.l2.pct', 'Body mass loss Level 2 (%)', 3],
      ['acuity.l1', 'Acuity worse than baseline by (logMAR)', 0.2],
      ['sleep.poor.hours', 'Poor night under (h)', 6], ['sleep.poor.pct', 'Poor night under usual sleep (%)', 80]
    ]],
    ['Caution periods (h)', Object.keys(CAUTION).map((k) => ['caution.' + k, k + ' · monitoring (h)', CAUTION[k][0]])]
  ];

  /* ---------- Simulation page: rows, devices, cases (from the design) ---------- */
  const SIM_ROWS = [
    { id: 'hr', name: 'Heart rate', unit: 'bpm', dev: 1, g: 'w' },
    { id: 'ecg', name: 'ECG rhythm', unit: '', dev: 1, g: 'w' },
    { id: 'pause', name: 'ECG pause length', unit: 's', dev: 1, g: 'w' },
    { id: 'hrv', name: 'Heart-rate variability', unit: 'ms', dev: 1, g: 'w' },
    { id: 'rr', name: 'Breathing rate', unit: '/min', dev: 1, g: 'w' },
    { id: 'apnea', name: 'No breathing detected', unit: 's', dev: 1, g: 'w' },
    { id: 'quality', name: 'Signal quality', unit: '0–100', dev: 1, g: 'w' },
    { id: 'spo2', name: 'SpO2', unit: '%', dev: 2, g: 'w' },
    { id: 'skin', name: 'Skin temperature', unit: '°C', dev: 2, g: 'w' },
    { id: 'act', name: 'Activity level', unit: '0–3', dev: 2, g: 'w' },
    { id: 'sleeph', name: 'Sleep hours so far', unit: 'h', dev: 2, g: 'w' },
    { id: 'rad', name: 'Radiation dose rate', unit: 'mSv/h', dev: 3, g: 'w' },
    { id: 'dose', name: 'Mission dose so far', unit: 'mSv', dev: 3, g: 'w' },
    { id: 'spe', name: 'Solar particle event warning', unit: '', dev: 3, g: 'w' },
    { id: 'o2', name: 'Cabin oxygen', unit: '%', dev: 4, g: 'c' },
    { id: 'press', name: 'Cabin pressure', unit: 'kPa', dev: 4, g: 'c' },
    { id: 'co2', name: 'Cabin CO2', unit: 'mmHg', dev: 4, g: 'c' },
    { id: 'cont', name: 'Contaminant ratio', unit: '× limit', dev: 4, g: 'c' },
    { id: 'smoke', name: 'Smoke or odour', unit: '', dev: 4, g: 'c' },
    { id: 'sys', name: 'Blood pressure, systolic', unit: 'mmHg', dev: 5, g: 'm' },
    { id: 'dia', name: 'Blood pressure, diastolic', unit: 'mmHg', dev: 5, g: 'm' },
    { id: 'rest', name: '5 minutes rest taken', unit: '', dev: 5, g: 'm' },
    { id: 'core', name: 'Core temperature', unit: '°C', dev: 6, g: 'm' },
    { id: 'fspo2', name: 'Fingertip SpO2', unit: '%', dev: 7, g: 'm' },
    { id: 'mass', name: 'Body mass', unit: 'kg', dev: 8, g: 'm' },
    { id: 'visl', name: 'Visual acuity, left eye', unit: 'logMAR', dev: 9, g: 'm' },
    { id: 'visr', name: 'Visual acuity, right eye', unit: 'logMAR', dev: 9, g: 'm' },
    { id: 'urine', name: 'Urine', unit: '', dev: 10, g: 'm' },
    { id: 'fluid', name: 'Fluid intake today', unit: 'L', dev: 10, g: 'm' },
    { id: 'mood', name: 'Mood', unit: '0–10', dev: 11, g: 'm' },
    { id: 'stress', name: 'Stress', unit: '0–10', dev: 11, g: 'm' },
    { id: 'ecg12', name: '12-lead ECG result', unit: '', dev: 12, g: 'm' },
    { id: 'us', name: 'Ultrasound result', unit: '', dev: 13, g: 'm' }
  ];
  const DEVICES = [
    { num: 1, name: 'Chest patch', place: 'worn on the chest', kind: 'worn' },
    { num: 2, name: 'Wrist device', place: 'worn on the wrist', kind: 'worn' },
    { num: 3, name: 'Dosimeter', place: 'worn in the chest pocket', kind: 'worn' },
    { num: 4, name: 'Cabin sensors', place: 'on the module wall', kind: 'off' },
    { num: 5, name: 'Arm cuff', place: 'on the upper arm', kind: 'hand' },
    { num: 6, name: 'Thermometer', place: 'in the mouth or ear', kind: 'hand' },
    { num: 7, name: 'Fingertip oximeter', place: 'on a finger', kind: 'hand' },
    { num: 8, name: 'SLAMMD', place: 'holds the whole body', kind: 'hand' },
    { num: 9, name: 'Near-vision card', place: 'in front of the eyes', kind: 'hand' },
    { num: 10, name: 'Urine kit · drink containers', place: 'in the hygiene and galley area', kind: 'off' },
    { num: 11, name: 'App form', place: 'on this screen', kind: 'off' },
    { num: 12, name: '12-lead ECG unit', place: 'medical kit, a crew mate helps', kind: 'off' },
    { num: 13, name: 'Ultrasound', place: 'medical kit, when medical directs', kind: 'off' }
  ];
  const SHARED = { pause: '0', apnea: '0', quality: '100', ecg: 'Normal', rad: '0.02', dose: '45', spe: 'No', o2: '21', press: '101', co2: '2.5', cont: '0.1', smoke: 'No',
    sys: '118', dia: '76', rest: 'Yes', core: '36.8', fspo2: '98', mass: '70.0', visl: '0.0', visr: '0.0', urine: 'Normal', fluid: '1.8', mood: '3', stress: '3', ecg12: 'Normal', us: 'Normal' };
  const CASE_NORMAL = {
    regular: Object.assign({}, SHARED, { hr: '68', hrv: '55', rr: '14', spo2: '98', skin: '33.5', act: '0', sleeph: '7.5', dur: '10' }),
    sleep: Object.assign({}, SHARED, { hr: '56', hrv: '65', rr: '12', spo2: '96', skin: '34.2', act: '0', sleeph: '3.5', dur: '10' }),
    exercise: Object.assign({}, SHARED, { hr: '105', hrv: '35', rr: '24', spo2: '97', skin: '34.6', act: '2', sleeph: '7.5', core: '37.4', fluid: '1.2', dur: '10' })
  };
  const CASE_CHANGES = {
    regular: { alert: { hr: '125', act: '0', dur: '10' }, emergency: { hr: '112', rr: '28', spo2: '86', fspo2: '86', dur: '2' } },
    sleep: { alert: { hr: '105', act: '0', dur: '2' }, emergency: { hr: '92', rr: '22', spo2: '87', dur: '2' } },
    exercise: { alert: { hr: '174', act: '3', dur: '2' }, emergency: { hr: '165', skin: '36.6', core: '40.2', dur: '2' } }
  };
  const CASE_NOTES = {
    normal: 'Every value inside its band for this mode. Run: nothing happens.',
    alert: { regular: 'Changed: heart rate 125 at rest for 10 min → Level 2 alert about heart rate.', sleep: 'Changed: heart rate 105, no movement, for 2 min → Level 2 alert about heart rate.', exercise: 'Changed: heart rate 174 (above 95% of max) for 2 min → Level 2 alert about heart rate.' },
    emergency: { regular: 'Changed: SpO2 86 % for 2 min → emergency about breathing.', sleep: 'Changed: SpO2 87 % for 2 min in sleep → emergency about breathing.', exercise: 'Changed: core temperature 40.2 °C → emergency about temperature.' }
  };

  /* Mental health self-help: what an astronaut might experience, and what can help.
     General wellbeing guidance, not a diagnosis; the private talk with the flight doctor is always offered. */
  const MENTAL = [
    { id: 'lonely', title: 'Loneliness or isolation', notice: 'Feeling cut off, far from people, alone even with the crew around.',
      help: ['Plan your next call or video message with family or friends and put it in your schedule.', 'Share a meal or a short break with a crew mate today, even 10 minutes.', 'Write a message to someone at home, even if it is sent later.', 'Look at Earth from the window for a few minutes and name what you see.'] },
    { id: 'home', title: 'Missing family and home', notice: 'Homesick, worried about people at home, missing events you cannot attend.',
      help: ['Ask the support team to arrange a private family conference.', 'Keep a few photos, recordings or letters from home where you can see them.', 'Write down what you want to tell them, so the next call is easier.', 'Ask the ground team for news from home if you are worried about someone.'] },
    { id: 'stress', title: 'Stress and pressure', notice: 'Too much to do, fear of mistakes, tight timelines, feeling tense.',
      help: ['Breathe slowly: in for 4 seconds, hold 4, out for 6. Repeat 5 times.', 'Write your tasks down and do one at a time. Ask the ground team what can wait.', 'Take a short break between tasks: stretch, drink water, look out the window.', 'Tell the crew lead or ground team if the schedule is too full. That is part of the job.'] },
    { id: 'anxious', title: 'Worry or anxiety', notice: 'Racing thoughts, restlessness, a tight chest or stomach, fearing the worst.',
      help: ['Ground yourself: name 5 things you see, 4 you can touch, 3 you hear.', 'Breathe out longer than you breathe in, for 2 minutes.', 'Write the worry down and one small thing you can do about it.', 'Talk it through with a crew mate you trust or with the flight doctor in private.'] },
    { id: 'low', title: 'Low mood', notice: 'Sad, empty or flat, less interest in things you usually enjoy.',
      help: ['Keep your daily routine: wake, meals, exercise and sleep at the usual times.', 'Do your exercise session today. Movement helps mood.', 'Do one thing you enjoy: music, a film, a book, photos of Earth.', 'If the low mood lasts more than 2 weeks, or is getting worse, talk to the flight doctor.'] },
    { id: 'sleep', title: 'Trouble sleeping', notice: 'Hard to fall asleep, waking often, tired during the day.',
      help: ['Keep the same bedtime and wake time, also on rest days.', 'Dim lights and screens 1 hour before bed. Use the sleep station light settings.', 'Use an eye mask and ear plugs, and secure your sleeping bag well.', 'Avoid caffeine in the 6 hours before sleep. Start Sleep mode in the app at bedtime.'] },
    { id: 'irritable', title: 'Irritability or crew conflict', notice: 'Easily annoyed, small things feel big, tension with a crew mate.',
      help: ['Take a short time-out in a quiet place before you answer.', 'Talk to the person calmly and in private. Speak about the problem, not the person.', 'Ask the crew lead to help if you cannot solve it together.', 'Check sleep, food and workload: tiredness and hunger make irritability worse.'] },
    { id: 'monotony', title: 'Boredom and monotony', notice: 'Every day feels the same, low motivation, time drags.',
      help: ['Set a small personal goal for this week: a skill, a book, photos, a hobby.', 'Change something in your routine: a new playlist, a different meal, a call.', 'Mark progress in the mission and plan something to look forward to.', 'Ask the support team for new films, books or activities.'] },
    { id: 'tired', title: 'Exhaustion or burnout', notice: 'Worn out, no energy, hard to recover even after rest.',
      help: ['Protect your sleep first. Use Sleep mode and keep your bedtime.', 'Tell the ground team you need lighter tasks or more rest time.', 'Take real breaks: away from screens and work, for at least 15 minutes.', 'Talk to the flight doctor if the tiredness does not improve in a few days.'] },
    { id: 'focus', title: 'Trouble concentrating', notice: 'Forgetting things, slower thinking, hard to stay focused ("space fog").',
      help: ['Use checklists and write steps down for every task.', 'Do the hardest task when you feel most alert.', 'Take short breaks every 45 to 60 minutes.', 'Ask a crew mate to double-check important steps. Report it if it keeps happening.'] }
  ];

  /* Login: a serial number is exactly this many digits (0-9), unique per astronaut */
  const SERIAL_DIGITS = 6;

  global.CONTENT = {
    MP, CATEGORY_BY_CODE, CATEGORY_BY_SIGNAL, EMERGENCY_ORDER, ALSO_LABEL, EMERGENCIES, CAUTION, PATTERNS,
    SENSOR_STEPS, GENERAL_STEPS, GENERAL_SELF, KEYWORDS, SYMPTOM_NAMES, SYMPTOM_SIGNS, DANGEROUS, THRESHOLDS,
    SIM_ROWS, DEVICES, CASE_NORMAL, CASE_CHANGES, CASE_NOTES, SERIAL_DIGITS, MENTAL
  };
})(window);
