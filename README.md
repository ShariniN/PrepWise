# PrepWise

Career readiness for university students. Each student picks a **target role** their university offers, checks their CV against it, practises coding questions and takes **adaptive mock interviews**. Lecturers and university admins see how their students are doing.

PrepWise is a subscription product for universities, priced per student.

## What it does

- **Target roles.** A university admin edits the list of roles (five starting roles are provided). A student picks one when they first sign in and can change it later.
- **CV check.** Upload a PDF CV; it is scored against the target role (required skills matched and missing, advice on content and layout). Pasted job descriptions are optional.
- **Adaptive mock interview.** Five questions: behavioural, technical, coding, technical, behavioural. Each answer moves the next question one level up (75 or more), down (below 45) or keeps it. The first interview starts from "how ready do you feel?"; later ones start where the last one ended. Answers can be typed, spoken (voice) or, for the coding question, written as code. Camera tips are measured in the browser and never uploaded.
- **Practice.** Coding, multiple-choice and trace questions, marked on the server.
- **Dashboard.** Lecturers see the students in the groups assigned to them; admins see the whole university. Flags show who has no CV or interview, has been inactive for 14 days or whose score dropped by 15 points.
- **People.** Admins invite people one by one or from a CSV, set student groups, assign groups to lecturers, and allow self sign-up for approved email domains.

## Tech stack

React, Vite and Tailwind (client). Node.js, Express 5 and MongoDB with Mongoose (server). Cookie login with JWT. AI through Groq and Google Gemini, speech to text with Groq Whisper, optional code execution through JDoodle or Judge0.

## Run it locally

Needs Node 20 or newer. The local mode uses an embedded database, so MongoDB does not have to be installed.

```bash
# terminal 1: server on http://localhost:4000, seeds fake demo data
cd server
npm install
npm run dev:local -- --fresh      # drop --fresh to keep your data between runs

# terminal 2: web app on http://localhost:5173
cd client
npm install
npm run dev
```

`npm run dev` and `npm start` in `server/` connect to the `MONGODB_URI` in `server/.env` (a real database). For local work use `npm run dev:local`.

Mail is switched off locally, so no emails are sent.

### Demo logins (local demo data only)

| Role | Email | Password |
|---|---|---|
| University admin | `admin@email.com` | `admin@123` |
| Lecturer (sees Group 1) | `lecturer@email.com` | `lecturer@123` |
| Lecturer (sees Group 2) | `lecturer2@demo-a.test` | `lecturer@123` |
| Student | `student@email.com` | `student@123` |

These belong to "Demo University A". Its 40 students are split into "Group 1" and "Group 2" and spread across the five starting roles. 25 of them have fake adaptive interviews (with levels) and a CV check against their role; a few have gone quiet or had a score drop, so the dashboard flags have something to show. The fake data is marked "Demo data" and no AI is called. If your local database was seeded earlier, run `npm run dev:local -- --fresh` once.

"Demo University B" (`admin@demo-b.test`, `lecturer@demo-b.test`, `student@demo-b.test`, same passwords) has no activity. Use it to check that two universities cannot see each other's data. These logins are public: never use them anywhere real.

### Sign up as a new student locally

University A allows self sign-up for `@email.com` and `@demo-a.test` addresses.

1. Open the web app, choose sign up, and use any new address such as `me@email.com`, a name and a password with a capital letter, a digit and a symbol.
2. No email is sent. The server prints `[dev] verification link: ...` in its terminal, and the sign-up API answer also contains `devVerificationLink`. Open that link to verify and sign in.
3. A new student is sent to a short welcome page to pick a target role (and may skip the CV upload).

The link is only exposed when `NODE_ENV` is not `production`.

## Keys (all optional locally)

Put them in `server/.env` (copy `server/.env.example`; never commit it). Without a key a feature says it is unavailable instead of faking a result.

| Key | What it turns on |
|---|---|
| `GROQ_API_KEY` | AI questions, answer feedback and CV scoring (first choice) and voice answers (Whisper) |
| `GEMINI_API_KEY` | AI fallback when Groq is not set or is out of quota |
| `JDOODLE_CLIENT_ID`, `JDOODLE_CLIENT_SECRET` | Optional: running code on the server (practice submit, interview coding question). Judge0 can be used instead (`JUDGE0_URL`). Without a runner, code can still be run in the browser for Python and JavaScript, but is not marked. |
| `SMTP_USER`, `SMTP_PASS`, `SENDER_EMAIL` | Real email (production only) |

## Tests

```bash
cd server && npm test              # server tests; they never read server/.env
cd client && npm run build         # production build
cd client && npx eslint .
```

End-to-end tools drive a running local stack with the demo data. Start the server and the web app as above, then:

```bash
cd tools/e2e
npm install
node smoke.mjs                       # API checks
node deep.mjs                        # 30 students answer practice questions
node prep.mjs && node e2e.mjs        # real browser walk through the main pages
node browser-runner-check.mjs        # in-browser code runner
```

Set `API=` and `WEB=` if your ports differ. See `tools/e2e/README.md`. The suites can run in any order on one stack.

## API

See [server/API.md](server/API.md) for every route.

Use fake data only while developing. Do not enter real student CVs until a production setup with a data processing agreement is in place.
