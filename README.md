# PrepWise

AI-assisted career readiness for university students: CV analysis, skill self-assessment and mock technical interviews with live code execution.

PrepWise is being developed as a subscription product for universities, priced per student. See [the implementation plan](docs/superpowers/specs/2026-11-07-prepwise-university-platform-plan.md) for the roadmap.

## What works today

- **CV Analyzer** - upload a PDF CV and a job description for strengths, gaps and suggestions.
- **Skill Assessor** - extracts skills from the CV and lets students rate their confidence.
- **Mock interview** - generated behavioural, technical and coding questions, answered by text, voice or code, with AI feedback and a report.
- **Code execution** - via JDoodle. If the service is not configured, the editor says so and nothing is scored.

## Tech stack

React + Vite + Tailwind (client), Node.js + Express + MongoDB/Mongoose (server), JWT cookie auth, Google Gemini (default AI provider), JDoodle (code execution), AssemblyAI (speech to text).

## Running locally

Requires Node 20+. The local mode uses an embedded database, so you do not need MongoDB installed.

```bash
# server (first terminal)
cd server
npm install
npm run dev:local -- --fresh   # http://localhost:4000, seeds fake demo data
                               # drop --fresh to keep your data between runs

# client (second terminal)
cd client
npm install
npm run dev                    # http://localhost:5173
```

API keys for code execution (JDoodle or Judge0), AI (Gemini) and voice (AssemblyAI) go in `server/.env`; see `server/.env.example`. Without them those features report "unavailable" instead of faking results.

`npm run dev` and `npm start` in `server/` connect to the `MONGODB_URI` in your `.env` instead of the embedded database.

### Demo logins (local demo data only)

| Role | Email | Password |
|---|---|---|
| University admin | `admin@email.com` | `admin@123` |
| Lecturer | `lecturer@email.com` | `lecturer@123` |
| Career officer | `careers@email.com` | `careers@123` |
| Student | `student@email.com` | `student@123` |

These belong to "Demo University A". A second university, "Demo University B", uses the same passwords with `@demo-b.test` emails, so you can check that the two cannot see each other's data. These logins are public: never use them anywhere real.

Run the server tests with `npm test` inside `server/`. Tests never read `server/.env`.

Use fake data only while developing. Do not enter real student CVs until a production setup with a data processing agreement is in place.
