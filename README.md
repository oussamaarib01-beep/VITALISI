# Astronaut Health Monitor (prototype, front end only)

Open `index.html` in Chrome, Edge or Firefox (double-click it, or put the folder in XAMPP's `htdocs` and open `http://localhost/astro-health/`). No server, database or internet is needed.

## Files
- `index.html` – page shell
- `style.css` – shared styles and fonts (screen styles are copied inline from the design file)
- `content.js` – texts and numbers from the algorithm: emergency steps (section 17), pattern steps (12.3), categories (11.3), Crew Aid keywords (13.3), all thresholds, Simulation cases (19.1)
- `engine.js` – the rules engine: master loop, validation, modes, rules, emergencies, patterns, events, reminders, records
- `app.js` – the 11 screens from the design, wired to the engine
- `assets/` – background images, body picture and Roboto fonts taken from the design file

## How data is kept
All data stays in the page's memory, append-only, per serial number. Logging out and back in with the same serial number in the same tab keeps it. Reloading the page starts fresh.

## Running a test
1. Log in with a 6-digit serial number (digits 0–9 only, e.g. `000123`; set by `SERIAL_DIGITS` in `content.js`) and a name. A serial number belongs to one astronaut: logging in again needs the same name, and a different name is refused. New identities use the demo profile (age 40, male).
2. Set the mode with the Regular / Sleep / Exercise buttons at the top of the Simulation page (or the Sleep / Exercise tiles on the dashboard). Switching ends the current run and loads that mode's three cases.
3. Open Simulation, choose Normal / Alert / Emergency, press USE, then RUN.
4. RUN stores the values and moves the simulated clock in 30-second steps for the hold time. It stops early when an emergency opens. Alerts and emergencies open their screens.
5. Use panel F (+30 s … +1 h) to see what happens when values stay abnormal. Change values and RUN again to bring them back to normal.
6. In an emergency, tap YES, I'M OK within 10 real seconds, or E1 opens on top. The crew timer is 30 real seconds. Set "Crew responds: Yes" in panel E for Display B.
6b. To finish an emergency, tap "End emergency" on the emergency screen and confirm. It closes the emergency (kept in Records › Events), resets the values to Normal so it does not open again, and returns to the mode you were in (Regular, Sleep or Exercise).
7. Return or Exit on the Simulation page ends the run: open events close as "run ended (simulated)" and the values go back to Normal.

Prototype. Thresholds and procedures need mission-approved medical validation.
