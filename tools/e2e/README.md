# Local end-to-end tools

These scripts drive the real app against the local embedded database. They use fake demo data only.

1. Start the stack: `cd server && npm run dev:local -- --fresh > ../tools/e2e/demo-credentials.log` and `cd client && npm run dev`.
   The first run prints the demo passwords; the log file is git-ignored.
2. `cd tools/e2e && npm install` (uses your installed Chrome, no browser download).
3. Run:
   - `node smoke.mjs demo-credentials.log` - about 60 API checks (roles, tenancy, limits, analytics, assessments, integrity).
   - `node deep.mjs demo-credentials.log` - 30 students answer questions, then checks the dashboards fill with data.
   - `node prep.mjs && node e2e.mjs` - real-browser exam flow: login, practice, timed exam with integrity signals, lecturer review and replay.
   - `node shot.mjs /login out.png --role student --width 1440` - screenshot any page (add `--full` for the whole page).

Code execution and AI features report "unavailable" until the sandbox and AI keys are configured; that is expected.
