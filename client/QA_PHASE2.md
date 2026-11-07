# Phase 2 client: manual QA checklist

Nothing here has been run against a live API, a real sandbox or a real browser by the authors. The build and lint pass; everything below still needs a human. Use demo data only.

## Setup
1. Server: `npm run seed:questions` (global seed bank), then start it with `EXECUTION_PROVIDER=judge0` and `JUDGE0_URL` set (see below), or leave execution unconfigured to test the outage state.
2. Client: `npm run dev` in `client/`. Sign in as a student, a lecturer and a university admin (use the demo seed or invites).

### Running a local Judge0 (from infra/judge0/README.md)
- Needs Linux with cgroup v1 (Ubuntu 22.04 with `systemd.unified_cgroup_hierarchy=0`). Docker Desktop on Windows/macOS usually does not work. The containers are privileged, so use a throwaway machine.
- `cd infra/judge0 && cp .env.example .env` (set `POSTGRES_PASSWORD` and `REDIS_PASSWORD`), then `docker compose up -d` and wait for "Listening on tcp://0.0.0.0:2358".
- Smoke test: `curl -s -X POST "http://127.0.0.1:2358/submissions?base64_encoded=false&wait=true" -H "Content-Type: application/json" -d '{"language_id":63,"source_code":"console.log(\"hello\")"}'`
- In `server/.env`: `EXECUTION_PROVIDER=judge0`, `JUDGE0_URL=http://127.0.0.1:2358`. Check with `npm run validate:seed -- --only digit-sum` in `server/`.
- Hosted Judge0 (RapidAPI or judge0.com) also works; see the README table.

## Code editor (all pages that use it)
- [ ] Monaco loads without internet (it is bundled, not fetched from a CDN). First open takes a moment ("Loading editor...").
- [ ] Language select changes highlighting for javascript, python, java, cpp, c, csharp, go, php.
- [ ] Theme toggle, font size and tab size work and are remembered after reload. Minimap is off.
- [ ] Block the Monaco chunk in dev tools (or throw in `monacoSetup.js`): a plain textarea appears with a notice and editing still works.
- [ ] Typing, pasting, focus and blur produce POSTs to `/api/practice/attempts/:id/events` roughly every 10 seconds (Network tab), with `seq` increasing; closing the tab sends a final batch. A failing events endpoint never shows an error to the student.

## Student practice (`/practice`)
- [ ] NavBar shows "Practice" for students only. Staff and admin visiting `/practice` are redirected home; signed out goes to `/login`.
- [ ] List loads with loading, empty and error (with Retry) states. Topic (debounced), difficulty and type filters work. "Unseen only" hides solved questions. Solved questions show a "Solved" badge (derived by comparing with the `unseen=1` list because the API has no solved flag).
- [ ] Open a coding question: statement renders (headings, lists, code blocks, inline code; a statement containing `<script>` or `<img onerror>` shows as plain text, nothing executes). Visible examples and the hidden test count show.
- [ ] Starter code appears for the first language; switching language keeps each language's edits separately.
- [ ] Reload mid-edit: the draft is restored (GET draft) and the "Draft saved" indicator appears about 1.5 seconds after typing stops.
- [ ] Run with empty custom input: visible tests are run, per-test pass/fail with input, expected and actual shown. Run with custom input: stdout, stderr and compile output shown. Neither scores anything.
- [ ] Submit a correct solution: Accepted badge, score 100, N/N tests. Hidden tests appear as "Hidden test N" with Passed/Failed only: no input, expected or actual output anywhere (check the DOM too).
- [ ] Wrong answer, time limit (infinite loop), memory limit, compile error (syntax error), runtime error (throw) each show the matching badge and error text. Java without `public class Main` fails sensibly.
- [ ] Rapid-fire Run more than 20 times a minute shows the rate-limit toast.
- [ ] Question with no visible tests: Run without input shows the server's 409 message; custom input works.
- [ ] "This session" list records each run and submit with its verdict (it is client-side only; the API has no attempt history endpoint).
- [ ] MCQ: single select uses radios, multi uses checkboxes; submit gives Accepted/Wrong answer plus explanation. Trace: textarea answer. Short and behavioural: submit shows "Pending review".

## Outage state (stop Judge0 or unset `EXECUTION_PROVIDER`)
- [ ] Run and Submit on a coding question show "Code execution is currently unavailable - your work has not been scored." The editor keeps the code, the draft still autosaves, nothing is shown as scored, and the session list shows "Execution unavailable".
- [ ] Authoring "Validate in sandbox" shows the same unavailable notice and the publish gate stays blocked.
- [ ] Interview Run Code shows the unavailable notice, not a generic error.
- [ ] Restart Judge0: Run works again without a page reload.

## Lecturer and admin authoring (`/questions`)
- [ ] NavBar shows "Questions" for lecturers and university admins, not for career officers or students. Career officer visiting `/questions` is redirected.
- [ ] Bank lists "Your institution" and "Global seed bank" sections; status, type and "Mine only" filters work; empty and error states show.
- [ ] Seed rows show "Duplicate to edit" (not Edit); duplicating opens an editable draft copy with its tests. Another lecturer's question in the same university also shows "Duplicate to edit".
- [ ] Opening a seed or someone else's question shows the read-only banner and disabled fields.
- [ ] New question: title required; each type shows the right fields (coding/debug: languages, starter code, limits; mcq: options and correct answers; trace: expected output; short/behavioural: rubric after creation). Type is locked after creation.
- [ ] Coding: add tests (visible/hidden, weight 0-100, comparison trim/exact/tokens), edit, delete; the 50 test limit message appears. Each row saves independently.
- [ ] Reference solution and wrong solution editors; language selectors work.
- [ ] Publish gate: with no tests, no visible test, no validation, stale validation (edit after validating), or unsaved changes, Publish is disabled and the reasons are listed. AI drafts without a wrong solution are blocked.
- [ ] "Validate in sandbox" saves unsaved changes first, then shows reference and wrong solution per-test results and the server message. A failing wrong solution (it passes every test) reports validation failed.
- [ ] After a passing validation the gate says ready; Publish works; version shows. Editing a published question returns it to draft. Status buttons follow the allowed moves; an illegal move or `PUBLISH_BLOCKED` shows the server message.
- [ ] Delete a never-attempted question works; one with attempts shows the 409 message suggesting retire.
- [ ] Rubric editor (short/behavioural): add criteria and levels, save, reload to confirm, delete.
- [ ] "Draft with AI": topic required, count capped at 1-3, creates drafts (one opens directly, several return to the list). Monthly cap (AI_MONTHLY_CAP), rate limit and 502 show readable messages.

## Interview integration (`/interview`)
- [ ] Coding questions show Monaco instead of a textarea, with the language select still working (Node.js and Python 3 map to JavaScript and Python highlighting).
- [ ] Run Code shows a verdict badge plus output; a runtime error shows its stderr (it is no longer reported as a generic failure).
- [ ] The submit request body contains no `executionResults` (Network tab).
- [ ] On the feedback screen a coding answer shows the server-recorded run (verdict, tests passed) when the response carries it, or a note that execution was unavailable. Which response field carries this is a guess (`executionResults` on the response or feedback, `feedback.executionSource`); confirm against the real response.
- [ ] Non-coding questions and the audio/text flow behave exactly as before.

## Known gaps
- No attempt-history endpoint exists, so history is per page session only.
- Lecturer review of short/behavioural answers is not part of Phase 2.
- Monaco language services: JavaScript syntax checking only; no IntelliSense for the other languages.
