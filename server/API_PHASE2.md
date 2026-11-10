# Phase 2 API: code editor and question bank

All endpoints need the sign-in cookie (`token`, same as Phase 1). Role and institution always come from the database.
Errors are JSON: `{ "success": false, "message": "..." }` (plus `code` or `verdict` where noted). Unknown or
other-university ids return `404`, never `403`, so ids cannot be probed. Ids are 24-character hex strings.

Common statuses: `401` not signed in, `403` wrong role, `404` not found / not yours, `429` rate limited
(`{success:false, message}`), `503` execution sandbox unavailable.

## Concepts

- **Execution unavailable.** If the sandbox cannot run code, run/submit/validate return `503` with
  `{ success:false, verdict:"unavailable", reason, message }`. Nothing is scored or stored. `reason` is `quota`, `network`, `auth`,
  `not_configured`, `bad_response` or `unavailable`; `message` says it in plain words, e.g. "Code execution limit for today has been
  reached. Try again tomorrow. Nothing was scored." The client shows `message` once and lets the student keep editing.
  (`POST /api/code/execute` has the same `reason` and puts the text in `error`.)
- **Verdicts:** `accepted`, `wrong_answer`, `time_limit`, `memory_limit`, `compile_error`, `runtime_error`, `unavailable`
  (never inside a 200; only on 503). Overall verdict for a submission is `accepted` when every test passes, otherwise the most
  serious failure (`compile_error`, `runtime_error`, `time_limit`, `memory_limit`, then `wrong_answer`).
- **Languages:** `javascript`, `python`, `java`, `cpp`, `c`, `csharp`, `go`, `php`. Aliases accepted on input: `js`, `node`, `nodejs`,
  `py`, `python3`, `c++`, `c#`, `cs`, `golang`. Responses always use the canonical names. SQL is not supported yet.
  Java programs must use `public class Main`.
- **Programs read standard input and write standard output.** Output is compared per test with the test's `comparison` mode:
  `trim` (ignores trailing whitespace on lines and at the end), `exact`, or `tokens` (whitespace-insensitive).
- **Question types:** `coding`, `debug` (both run tests), `mcq`, `trace`, `short`, `behavioural`.
- **Seed bank.** Questions with `isSeed: true` are global (every university sees them) and read-only. Staff duplicate them to edit.
- **Limits:** source at most 64 KB, stdin at most 16 KB.

---

# Student API: `/api/practice` (role `student`)

Rate limits (per student, per minute; env `PRACTICE_RUN_LIMIT` / `PRACTICE_SUBMIT_LIMIT`): run 20, submit 20.

## GET /api/practice/questions
Query (all optional): `topic`, `difficulty` (`easy|medium|hard`), `type`, `unseen=1` (hide questions this student already solved with an accepted submission).
Only `published` questions from the student's university plus the seed bank.

Response `200`:
```json
{ "success": true, "questions": [
  { "id": "...", "title": "...", "type": "coding", "topic": ["arrays"], "difficulty": "easy",
    "languages": ["javascript","python","java"], "estimatedMinutes": 10, "isSeed": true } ] }
```

## GET /api/practice/questions/:id
`404` if missing, unpublished, or another university's.

```json
{ "success": true, "question": {
  "id": "...", "title": "...", "statement": "markdown", "type": "coding", "topic": [], "difficulty": "easy",
  "languages": ["javascript","python","java"], "starterCode": { "javascript": "...", "python": "...", "java": "..." },
  "timeLimitMs": 2000, "memoryLimitKb": 256000, "estimatedMinutes": 10, "learningOutcome": "", "version": 1, "isSeed": true,
  "visibleTests": [ { "id": "...", "input": "3", "expectedOutput": "6" } ],
  "hiddenTestCount": 4,
  "options": ["..."], "multi": false } }
```
`options`/`multi` appear for `mcq` only. Reference solutions, hidden tests, correct options, trace answers and explanations are never sent here.

## POST /api/practice/questions/:id/run
Coding/debug questions only. Body: `{ "language": "python", "source": "...", "stdin": "optional" }`.

- With a non-empty `stdin`: one run on that input (`mode: "custom"`).
- Without: runs the visible tests (`mode: "visible_tests"`).

Custom response:
```json
{ "success": true, "mode": "custom", "verdict": "accepted", "stdout": "42\n", "stderr": "", "compileOutput": "", "timeMs": 12, "memoryKb": 3000 }
```
Visible-tests response:
```json
{ "success": true, "mode": "visible_tests", "verdict": "wrong_answer", "tests": [
  { "index": 1, "testId": "...", "visible": true, "passed": false, "verdict": "wrong_answer", "timeMs": 14, "memoryKb": 3000,
    "input": "3", "expectedOutput": "6", "actualOutput": "5\n", "error": "" } ] }
```
Errors: `400` bad language/source/stdin or not a coding question, `404`, `409` no visible tests (send `stdin`), `413` too large, `429`, `503`.
Runs are stored as attempts (`runKind: run`) but never scored.

## POST /api/practice/questions/:id/submit
The server decides the result. Anything execution-related in the body (`verdict`, `score`, `tests`, `executionResults`...) is ignored.

**coding / debug.** Body `{ "language": "...", "source": "..." }`. Runs **all** tests as one batch.
```json
{ "success": true, "attemptId": "...", "verdict": "wrong_answer", "score": 75, "passed": 3, "total": 4, "tests": [
  { "index": 1, "testId": "...", "visible": true, "passed": true, "verdict": "accepted", "timeMs": 10, "memoryKb": 3000,
    "input": "3", "expectedOutput": "6", "actualOutput": "6\n", "error": "" },
  { "index": 2, "visible": false, "passed": false, "verdict": "wrong_answer", "timeMs": 11 } ] }
```
`score` (0-100) is the weight-adjusted share of passed tests. **Hidden tests contain only `index`, `visible:false`, `passed`, `verdict`, `timeMs`**:
no input, expected output, actual output, error text or id.

**mcq.** Body `{ "selected": [1] }` (option indexes; for multi-select send all chosen). Response
`{ success, attemptId, verdict: "accepted"|"wrong_answer", score: 100|0, explanation }`.

**trace.** Body `{ "answer": "what the program prints" }` (trimmed, trailing spaces per line ignored). Same response shape as mcq.

**short / behavioural.** Body `{ "answer": "text" }` (max 8000 chars). Response `{ success, attemptId, verdict: "pending_review", score: null, message }`. A lecturer reviews these later (review UI is not part of Phase 2).

Errors: `400`, `404`, `409` (coding question without tests), `413`, `429`, `503`.

## Autosave

### POST /api/practice/questions/:id/attempts
Gets or creates this student's single working draft for the question. `200 { success, draft: { attemptId, questionId, language, source, updatedAt } }`.

### GET /api/practice/questions/:id/draft
`200 { success, draft: { attemptId, questionId, language, source, updatedAt } | null }`. Use on page load to restore work.

### PUT /api/practice/attempts/:id/autosave
Body `{ "language": "python", "source": "..." }` (source at most 64 KB). `200 { success, draft }`.
`400` bad input, `404` if the attempt is not this student's draft.

## POST /api/practice/attempts/:id/events
Edit-event batches for later replay. Works with any of the student's own attempt ids (normally the draft's `attemptId`).
Body:
```json
{ "seq": 3, "events": [ { "t": 1520, "type": "insert", "len": 1, "pos": 14, "text": "x" },
                        { "t": 4100, "type": "paste", "len": 220, "pos": 0, "text": "..." } ] }
```
`type` is `insert|delete|paste|focus|blur`; `t` is ms since the editing session started; `len`, `pos`, `text` are optional (`text` is cut to 2000 chars).
Limits: 500 events and 64 KB per batch, 1000 batches per attempt.
`201 { success, stored }`. Errors: `400` invalid event, `404` not your attempt, `413` batch too large, `429` too many batches.

---

# Lecturer API: `/api/questions` (roles `lecturer`, `university_admin`)

Lecturers read everything in their university (plus seeds) but edit only questions they authored. University admins edit any question in their university. Seeds can be read by everyone, edited by nobody (`403` with a message to duplicate).

## GET /api/questions
Query (optional): `status`, `type`, `topic`, `difficulty`, `mine=1`.
`200 { success, questions: [ { id, title, type, topic, difficulty, source, status, version, authorId, isSeed, editable, updatedAt } ] }`

## POST /api/questions
Create a draft. Body fields (only these are read): `type` (required), `title` (required), `statement`, `topic[]`, `difficulty`, `languages[]`,
`starterCode {lang: source}`, `timeLimitMs`, `memoryLimitKb`, `estimatedMinutes`, `learningOutcome`,
`referenceSolution {language, source}`, `wrongSolution {language, source}`, `options[]`, `correct[]`, `multi`, `traceAnswer`, `explanation`.
`status`, `version`, `source`, `authorId`, `institutionId` are always set by the server (`status: "draft"`, `source: "lecturer"`).
`201 { success, question }` where `question` is the full staff view (below).

Staff question view:
```json
{ "id": "...", "institutionId": "...|null", "authorId": "...", "slug": null, "title": "", "statement": "", "type": "coding",
  "topic": [], "difficulty": "easy", "languages": [], "starterCode": {}, "timeLimitMs": 2000, "memoryLimitKb": 256000,
  "estimatedMinutes": null, "learningOutcome": "", "source": "lecturer|ai_drafted|seed", "status": "draft|in_review|published|retired",
  "version": 1, "referenceSolution": {"language":"python","source":"..."}, "altReferenceSolutions": [], "wrongSolution": null,
  "options": [], "correct": [], "multi": false, "traceAnswer": null, "explanation": null,
  "validation": { "passed": true, "current": true, "referencePassed": true, "wrongSolutionChecked": true, "wrongSolutionFailed": true, "testsRun": 5, "at": "...", "version": 1 },
  "editable": true, "tests": [ { "id": "...", "input": "", "expectedOutput": "", "visible": true, "weight": 1, "comparison": "trim" } ] }
```
`validation.current` is `false` when the question changed since it was validated. `tests` is present for coding/debug.

## GET /api/questions/:id
`200 { success, question }`. `404` for another university's question.

## PUT /api/questions/:id
Same editable fields as create except `type` (fixed). `403` not yours / seed, `400` nothing to change.
Editing a `published` question moves it back to `draft` (it disappears from students until it is validated and published again).

## DELETE /api/questions/:id
`200 { success }`. `409` if students have attempted it (retire it instead). Also removes its tests and rubric.

## POST /api/questions/:id/duplicate
Copies any visible question (including seeds) into the caller's university as a `draft` owned by the caller, with its tests. `201 { success, question }`.

## Tests (coding / debug only)

- `GET /api/questions/:id/tests` -> `{ success, tests: [...] }` (any staff who can read the question; includes hidden tests).
- `POST /api/questions/:id/tests` body `{ input, expectedOutput (required), visible, weight (0-100), comparison }` -> `201 { success, test }`. Max 50 tests.
- `PUT /api/questions/:id/tests/:testId` same fields, all optional -> `{ success, test }`.
- `DELETE /api/questions/:id/tests/:testId` -> `{ success }`.

Any test change on a `published` question moves it back to `draft`. Errors: `400` (not a coding question / no fields), `403`, `404`, `409` (50 test limit).

## POST /api/questions/:id/validate  (the validation gate)
Rate limit: 20 per minute per user. Coding/debug only. Body (optional): `{ "wrongSolution": { "language", "source" } }` (also saved on the question).

The server runs the reference solution against **all** tests in the sandbox (must pass every one) and, if a wrong solution is present, runs it too
(it must **fail at least one** test). AI-drafted questions must have a wrong solution. The result is recorded against the question's current content.

```json
{ "success": true, "passed": true, "referencePassed": true, "wrongSolutionChecked": true, "wrongSolutionFailed": true,
  "reference": [ { "index": 1, "testId": "...", "visible": true, "passed": true, "verdict": "accepted", "timeMs": 12 } ],
  "wrong": [ { "index": 1, "testId": "...", "visible": true, "passed": false, "verdict": "wrong_answer", "timeMs": 12, "stdout": "...", "stderr": "" } ],
  "message": "Validation passed. The question can now be published." }
```
`passed:false` is a normal `200` (look at `message`). Errors: `400` no reference solution / no tests / AI draft without wrong solution, `403`, `404`, `429`, `503` (sandbox down; nothing recorded).

## PATCH /api/questions/:id/status
Body `{ "status": "draft|in_review|published|retired" }`.
Allowed moves: `draft -> in_review|published`, `in_review -> draft|published`, `published -> retired|draft`, `retired -> draft`; otherwise `409`.
Publishing is blocked with `409 { code: "PUBLISH_BLOCKED", message }` unless:
- coding/debug: at least one test, at least one **visible** test, and a validation that **passed for the current content**;
- mcq: at least 2 options and valid `correct` indexes; trace: a `traceAnswer`.

The version stays at 1 on first publish and increases by 1 on a later publish whose content differs from the last published content. Attempts record the version.
`200 { success, question }`.

## Rubrics (short / behavioural questions)
- `GET /api/questions/:id/rubric` -> `{ success, rubric: { criteria } | null }`
- `PUT /api/questions/:id/rubric` body `{ criteria: [ { name, description?, maxPoints (0-100), levels?: [ { label, points, description } ] } ] }` (1-20 criteria) -> `{ success, rubric }`; `400` for other question types.
- `DELETE /api/questions/:id/rubric` -> `{ success }`

## POST /api/questions/draft  (AI drafting)
Rate limit: 6 per minute per user. Counts against the university's monthly AI cap (`429` with `code: "AI_MONTHLY_CAP"` when exceeded).
Body `{ "topic": "recursion", "difficulty": "medium", "language": "python", "count": 1 }` (`count` 1-3, default 1).
Creates `coding` questions with `status: "draft"`, `source: "ai_drafted"`, including tests, a reference solution and a wrong solution.
`201 { success, questions: [ staff view ], note }`. Errors: `400` input, `429` AI cap or rate limit, `502` the AI produced nothing usable.
Drafts are **not** validated automatically. Call `/validate`, review, then publish. Publishing is impossible until validation passes.

---

# Code execution (existing endpoints, now one service)

`POST /api/code/execute` (also reachable as `POST /api/interviews/execute` and `/api/interviews/execute-code`)
Body `{ "script": "...", "language": "python3", "stdin": "" }` (`versionIndex` is accepted and ignored).
Response shape is unchanged for the client: `{ success, output, error, executionTime, memory, statusCode }`
(`executionTime` in seconds as a string, `memory` in KB as a string). New: `verdict`. `success` is true only for `verdict: "accepted"`.
Errors: `400` missing fields / unsupported language, `413`, `429`, `503 { success:false, verdict:"unavailable", error }` when no provider works.
`GET /api/code/health` and `GET /api/code/languages` return `{ success, provider, configured, supportedLanguages, languages:[{name}] }`.

Mock interviews: `POST /api/interviews/:id/submit-answer` (and `/answer`) no longer reads `executionResults` from the body. For coding
questions the server runs the code itself and stores `responses[].executionResults` with `serverVerified: true`, a `verdict`, `output`, `error`
(or `testsPassed`/`testsTotal` when the question has tests). If the sandbox is down it stores `{ unavailable: true, success: false, serverVerified: false }`
and the AI feedback gets no execution result. `feedback.executionSource` is `server`, `unavailable` or `none`.

# Environment

`EXECUTION_PROVIDER` (`judge0` | `jdoodle`, optional auto-detect), `JUDGE0_URL`, `JUDGE0_API_KEY`, `JUDGE0_API_HOST`, `JUDGE0_LANGUAGE_IDS`,
`JDOODLE_CLIENT_ID`, `JDOODLE_CLIENT_SECRET`. Identical runs (provider + language + source + stdin) are cached in memory for 10 minutes.

# Scripts (run inside `server/`)

- `npm run seed:questions` upserts the global seed bank by slug (idempotent; needs `MONGODB_URI`).
- `npm run validate:seed [-- --only slug]` runs every seed reference solution (JavaScript and Python) through the configured provider and prints a table.
- `npm run build:seed` regenerates `seed/questions/*.json` from `tests/seed-build/defs` (dev tool; needs `node` and `python`).
