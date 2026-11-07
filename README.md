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

Requires Node 20+ and a MongoDB database.

```bash
# server
cd server
cp .env.example .env     # then fill in the values
npm install
npm run dev              # http://localhost:4000

# client (second terminal)
cd client
npm install
npm run dev              # http://localhost:5173
```

Run the server tests with `npm test` inside `server/`.

Use fake data only while developing. Do not enter real student CVs until a production setup with a data processing agreement is in place.
