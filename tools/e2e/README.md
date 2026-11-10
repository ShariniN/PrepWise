# Local end-to-end tools

These scripts drive the real app against a freshly seeded local stack. They use fake demo data only and the fixed demo
logins (`admin@email.com` / `admin@123`, `lecturer@email.com` / `lecturer@123`, `student@email.com` / `student@123`,
and the same passwords for `@demo-b.test`).

1. Start the stack: `cd server && npm run dev:local -- --fresh` (API on :4000) and `cd client && npm run dev` (web on :5173).
2. `cd tools/e2e && npm install` (uses your installed Chrome or Edge, no browser download).
3. Run (set `API=...` / `WEB=...` if your ports differ):
   - `node smoke.mjs` - about 75 API checks: logins and roles, invites (accept, single use, cancel a pending invite), CSV import,
     group editing, tenancy, the lecturer API (overview, students with group filter and sorting, student profile,
     interview detail, CSV export), removed routes answering 404, Practice, the question bank, profile validation,
     a camera-free mock interview answer with its delivery metrics stored, and compliance.
     - The mock interview checks make 2-3 AI calls (or take the fallback path without an AI key). `SKIP_AI=1` skips them.
     - `SANDBOX=1` also calls Practice run/submit and question validation, which use code-runner credits when JDoodle is
       configured. Without a runner they must answer `503` with a reason, never a fake result.
   - `node deep.mjs` - 30 students answer MCQ practice questions, then checks that the lecturer table and the admin
     overview pick it up. No AI, no code runner.
   - `node prep.mjs && node e2e.mjs` - real-browser walk: student login, `/login` while signed in, "Page not found" for
     unknown and removed pages, Practice, the Skills page without a CV analysis, profile phone validation, the lecturer
     dashboard (overview, student, interview) and cancelling a pending invitation in Manage people. Screenshots go to `e2e/`.
   - `node shot.mjs /login out.png --role student --width 1440` - screenshot any page (add `--full` for the whole page).

Code execution and AI features report "unavailable" until the sandbox and AI keys are configured; that is expected.
