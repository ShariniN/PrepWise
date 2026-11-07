# Phase 3A API: assessments, integrity (level 1), review queue, similarity, replay

All endpoints need the sign-in cookie (`token`). Role and institution always come from the database. Errors are JSON
`{ "success": false, "message": "...", "code"?: "..." }`. Unknown, other-university and (for lecturers) other-course ids
return `404`, never `403`. Ids are 24-character hex strings. Dates are ISO strings.

Common statuses: `400` bad input, `401` not signed in, `403` wrong role, `404` not found / not yours, `409` state conflict
(`code` says which), `413` too large, `429` rate limited.

## Principles the client must respect

- **The server owns the clock.** Starting a session fixes `deadline`. Every run, submit, autosave, edit-event batch and question read inside a
  session is rejected after `deadline + 10 s` with `409 { code: "TIME_UP" }`. Use `serverNow` / `remainingSeconds` from responses to draw the countdown; never trust the browser clock.
- **Nothing is ever auto-penalised.** No endpoint or model has a score, penalty, deduction or risk field for integrity. Flags are lists of human-readable *reasons* with
  evidence for a lecturer to read. A person decides, and the outcome never changes a mark.
- **Integrity level 1 is browser signals only.** No camera, microphone or screen capture. Levels 2 and 3 are rejected (`400`) until a later phase.
- **Assessment mode differs from practice:** no hints or explanations, the student never sees a verdict, score, test list or explanation after submitting (until the lecturer sets `releaseResults`),
  hidden tests only ever show pass/fail (as in practice).
- While a student has an unfinished assessment (its `closesAt` has not passed and it was not closed), **practice-mode access to those questions is blocked**: `GET /api/practice/questions/:id`,
  `/run`, `/submit`, `/attempts`, `/draft` and the autosave / events routes for them return `409 { code: "ASSESSMENT_IN_PROGRESS" }`, and the questions are hidden from `GET /api/practice/questions`.

---

# 1. Assessments: `/api/assessments`

## Concepts

- **Assessment fields:** `title`, `instructions`, `courseId`, `cohortId` (optional: if set, only that cohort; otherwise anyone enrolled in the course), ordered `questionIds` (published questions from the bank, 1-50),
  `opensAt`, `closesAt`, `durationMinutes` (1-600), `attemptsAllowed` (1-5, default 1), `integrityLevel` (0 or 1, default 0), `shuffleQuestions` (default true), `releaseResults` (default false),
  `status`, `accommodations[]`, `flagThresholds{}`.
- **Status.** Stored `status`: `draft | scheduled | open | closed`. `effectiveStatus` follows the clock: a `scheduled`/`open` assessment is `scheduled` before `opensAt`, `open` between, `closed` after `closesAt`.
  Students only see non-draft assessments. Moves (by effective status): `draft -> scheduled | open`, `scheduled -> draft | open | closed`, `open -> closed`; anything else `409`.
  `scheduled`/`open` re-check that every question is still published (`409 { code: "PUBLISH_BLOCKED" }`). `open` ("open now") moves `opensAt` to now if it was in the future. `draft` is only possible while nobody has started.
- **Deadline** = `min(serverStartedAt + durationMinutes * (1 + extraTimePercent/100), closesAt)` + lecturer extensions. Extensions are added after the cap, so a lecturer can extend past `closesAt`.
- **Per-student order and variants.** At start the server picks, for each question with a `variantGroup`, one published member of the group (own university or seed bank, same type) with
  `hash(userId, assessmentId, group)`, so the same student always gets the same variant (also on a second attempt). The question order is shuffled with `hash(userId, assessmentId)` when `shuffleQuestions` is true.
  The result is frozen in the session (`questions[]`). Staff set `variantGroup` on a question through `POST/PUT /api/questions` (`"variantGroup": "name"`, `null` to clear); the staff question view returns it.
- **Signals.** `tab_hidden, tab_visible, window_blur, window_focus, fullscreen_exit, paste, copy, cut, contextmenu, devtools_hint, multiple_screens_hint, network_offline, network_online`.
- **`flagThresholds`** (all optional, defaults shown): `leftPageCount 5`, `leftPageTotalSeconds 180`, `fullscreenExits 3`, `pasteChars 500`, `clipboardOutCount 15`, `typingBurstCpm 700`,
  `typingJumpRatio 4`, `typingJumpMinCpm 300`, `hintSignalCount 1`, `similarityContainment 0.7`. Unknown keys or out-of-range values are `400`. `effectiveThresholds` in the staff view shows the merged values.

## Staff (roles `lecturer`, `university_admin`; lecturers only for courses they own or are assigned to)

### POST /api/assessments
Body: `{ title, courseId, cohortId?, questionIds[], opensAt, closesAt, durationMinutes, attemptsAllowed?, integrityLevel?, shuffleQuestions?, releaseResults?, instructions?, flagThresholds? }`.
Creates a `draft`. `400` for: missing fields, `closesAt <= opensAt`, repeated / missing / unpublished / other-university questions, `integrityLevel` 2 or 3 (message says not available yet), bad thresholds. `404` unknown course/cohort.
`201 { success, assessment }` (staff view below).

Staff view:
```json
{ "id": "...", "courseId": "...", "cohortId": null, "createdBy": "...", "title": "", "instructions": "", "questionIds": ["..."],
  "opensAt": "...", "closesAt": "...", "durationMinutes": 60, "attemptsAllowed": 1, "integrityLevel": 1, "shuffleQuestions": true,
  "status": "draft", "effectiveStatus": "draft", "releaseResults": false,
  "accommodations": [ { "userId": "...", "extraTimePercent": 50, "disabledSignals": ["fullscreen_exit"], "note": "" } ],
  "flagThresholds": {}, "effectiveThresholds": { "leftPageCount": 5 }, "updatedAt": "..." }
```

### GET /api/assessments  /  GET /api/assessments/:id
Staff: `{ success, assessments: [staff view] }` / `{ success, assessment: { ...staff view, questions: [ { id, title, type } ] } }`. Students get the student view (below) from the same URLs.

### PUT /api/assessments/:id
Same fields as create (all optional; `cohortId: null` clears). Not allowed once `closed` (`409`). After any student started, only `title`, `instructions`, `releaseResults`, `flagThresholds` may change (`409` otherwise). `200 { success, assessment }`.

### PATCH /api/assessments/:id/status
Body `{ "status": "draft|scheduled|open|closed" }`. Closing stops all of that assessment's sessions immediately (`409 { code: "ASSESSMENT_CLOSED" }` on later writes). `200 { success, assessment }`. Audited (`assessment.status`).

### PUT /api/assessments/:id/accommodations/:userId
Body `{ extraTimePercent?: 0-200, disabledSignals?: [signal], note? }`. The student must be enrolled in the assessment's course/cohort (`404` otherwise). Applies to sessions started afterwards; use extend for a running session.
`200 { success, assessment }`. Audited (`assessment.accommodation`). `DELETE /api/assessments/:id/accommodations/:userId` removes it (`404` if none).

### GET /api/assessments/:id/sessions
```json
{ "success": true, "sessions": [ { "id": "...", "userId": "...", "studentName": "", "studentEmail": "", "attemptNo": 1, "status": "active|submitted",
  "serverStartedAt": "...", "baseDeadline": "...", "deadline": "...", "extensionMs": 0,
  "extensions": [ { "minutes": 10, "reason": "power cut", "at": "...", "byUserId": "..." } ], "extraTimePercent": 0,
  "submittedAt": null, "timedOut": false, "caseId": null, "caseStatus": null } ] }
```

### POST /api/assessments/:id/sessions/:sessionId/extend
Body `{ minutes: 1-480, reason: "at least 3 characters" }`. `409` if the session was already submitted or the assessment was closed. `200 { success, session: { id, deadline, extensionMs } }`. Audited (`assessment.extend`, with minutes, reason, previous and new deadline).

## Student (role `student`)

Student assessment view:
```json
{ "id": "...", "courseId": "...", "cohortId": null, "title": "", "instructions": "", "opensAt": "...", "closesAt": "...", "durationMinutes": 60,
  "attemptsAllowed": 1, "integrityLevel": 1, "questionCount": 4, "status": "scheduled|open|closed", "releaseResults": false, "canStart": true,
  "sessions": [ { "id": "...", "attemptNo": 1, "status": "active", "serverStartedAt": "...", "deadline": "...", "submittedAt": null } ] }
```
`GET /api/assessments` lists only non-draft assessments of the student's cohorts/courses. `GET /api/assessments/:id` is `404` for drafts and for assessments of courses the student is not enrolled in.

### POST /api/assessments/:id/start
No body needed (anything about time in the body is ignored). `201 { success, resumed: false, session }` for a new session, or `200 { success, resumed: true, session }` when an unexpired active session exists.
Errors: `404`, `409 NOT_OPEN` (not open yet / closed), `409 NO_ATTEMPTS_LEFT`, `409 QUESTION_MISSING`.

Session view (also returned by `GET /api/assessments/sessions/:sessionId`):
```json
{ "id": "...", "assessmentId": "...", "title": "", "attemptNo": 1, "status": "active|submitted", "serverStartedAt": "...", "deadline": "...", "serverNow": "...",
  "remainingSeconds": 3300, "submittedAt": null, "integrityLevel": 1,
  "signals": ["tab_hidden", "..."], "releaseResults": false,
  "questions": [ { "index": 0, "questionId": "...", "title": "", "type": "coding" } ] }
```
`signals` is what the browser should report: empty at level 0, and without any signal the student's accommodation disabled. `questions` is this student's order with variants already resolved.

### GET /api/assessments/sessions/:sessionId/questions/:questionId
```json
{ "success": true, "question": { "...same as practice student question, without learningOutcome / estimatedMinutes..." },
  "draft": { "attemptId": "...", "language": "python", "source": "...", "updatedAt": "..." } , "deadline": "...", "serverNow": "..." }
```
`draft` is `null` if nothing was saved. The question never contains hints, reference solutions, hidden tests or explanations. `404` if the question is not part of the session.

### POST .../questions/:questionId/run
Same body and response as `POST /api/practice/questions/:id/run` (custom stdin or visible tests; hidden tests are not run). Stored as an attempt linked to the session. Rate limit as practice run.

### POST .../questions/:questionId/submit
Same body as practice submit (coding/debug `{language, source}`, mcq `{selected}`, trace/short `{answer}`), same server-side marking, stored with `assessmentSessionId`. The response never marks the student:
```json
{ "success": true, "attemptId": "...", "submitted": true, "message": "Answer recorded. Results are released by your lecturer." }
```
If the assessment has `releaseResults: true` the response is the practice submit response without `explanation` (verdict, score, passed, total, tests). Errors as practice (`400`, `409`, `413`, `429`, `503`) plus the timer errors below.
Students may submit a question several times; the last submission counts.

### PUT .../questions/:questionId/autosave
Body `{ language, source }` (source at most 64 KB). Creates or updates this session's draft for the question. `200 { success, draft: { attemptId, questionId, language, source, updatedAt } }`.

### POST .../questions/:questionId/events
Edit-event batches for replay; body and limits as `POST /api/practice/attempts/:id/events` (`{ seq, events:[{t,type,len,pos,text}] }`). `201 { success, stored }`. Stored against the session.

### POST /api/assessments/sessions/:sessionId/finish
Ends the session (idempotent). Then the flagging rules run for the session (a review case is created only if there is something to show a reviewer). `200 { success, session: { id, status: "submitted", submittedAt } }`.
The response never mentions flags.

### GET /api/assessments/sessions/:sessionId/results
`403 { code: "RESULTS_NOT_RELEASED" }` unless the lecturer set `releaseResults` and the session has ended (submitted or past its deadline). Otherwise
`{ success, results: [ { index, questionId, title, answered, verdict, score, pendingReview } ] }` using the last submission per question.

### Timer and session errors (all session write routes)
| Status | `code` | Meaning |
|---|---|---|
| 409 | `TIME_UP` | past `deadline + 10 s` (also returns `deadline`, `serverNow`). Applies to run, submit, autosave, events and question reads. Nothing is stored. |
| 409 | `SESSION_ENDED` | the student already finished the session |
| 409 | `ASSESSMENT_CLOSED` | the lecturer closed the assessment |
| 404 | | not your session / unknown session / question not in the session |

---

# 2. Integrity events (Level 1): student

### POST /api/assessments/sessions/:sessionId/integrity-events
Body `{ "events": [ { "type": "paste", "t": 843000, "len": 1840, "inEditor": true, "questionId": "...", "detail": "" } ] }`
- `type`: one of the 13 signals (required). `t`: ms since the session started, as measured by the browser (required, >= 0).
- `len` (optional, paste length in characters), `inEditor` (optional boolean), `questionId` (optional, must be in the session), `detail` (optional, cut to 100 characters).
- Batch limits: 100 events and 16 KB per request (`413`), 5000 events per session (`429`). Rate limit 120 requests per minute per student.
- Level 0 assessments: `200 { success, stored: 0, ignored: n }`. Signals disabled by the student's accommodation are counted in `ignored` and not stored.
- Accepted until 5 minutes after the deadline (`409 SESSION_ENDED` after).
`201 { success, stored, ignored }`. `network_offline` / `network_online` are stored with `technical: true`.

Suggested client behaviour: batch every few seconds and on `visibilitychange`/`pagehide` (use `fetch` with `keepalive`), queue while offline and send after reconnect. `t` should come from `performance.now()` offset by
the server's `serverStartedAt`/`serverNow`, not from the wall clock.

---

# 3. Review queue: `/api/integrity`

Staff (`lecturer`, `university_admin`; lecturers only for their courses) except the three `/my/...` routes (students).
Every evidence view or change writes an AuditLog entry with `actor`, `target`, `institutionId` and `meta`.

## Concepts

- A **review case** (one per session at most) is created or updated when a session is analysed (on finish, on `POST /api/integrity/.../analyse`, after a similarity run). Status: `open | dismissed | escalated | resolved`.
  Allowed moves: `open -> dismissed | escalated | resolved`, `escalated -> dismissed | resolved`, `dismissed -> open`, `resolved -> open`. Resolving needs an `outcome`. Dismissing without an outcome sets `no_action`. Reopening clears the outcome.
- `outcome`: `no_action | technical_issue | informal_warning | referred_formal | inconclusive` (a record for the institution; it never changes a mark).
- **Reason** (what the case lists; there is no score):
```json
{ "code": "left_page", "kind": "behaviour|hint|similarity|technical",
  "text": "left the page 6 times for a total of 4m12s",
  "measured": { "count": 6, "totalMs": 252000, "longestMs": 60000 },
  "threshold": { "leftPageCount": 5, "leftPageTotalSeconds": 180 },
  "evidence": [ { "kind": "integrity_event", "id": "...", "type": "tab_hidden", "at": 100000, "durationMs": 30000 } ] }
```
  Codes: `left_page`, `fullscreen_exit`, `large_paste` ("pasted 1,840 characters in one event at 00:14:03"), `clipboard_out`, `typing_speed` ("typing speed jumped to about 900 characters/minute at 00:08:00 (typical for this session: 60)"),
  `devtools_hint`, `multiple_screens_hint` (both labelled low confidence), `similar_submission` ("submission similar to 2 others"). `evidence[].kind`: `integrity_event`, `edit_batch`, `similarity_pair`. `at` is ms since session start.
- **Technical events** (offline/online) never produce reasons and never count towards "left the page". They are summarised in `case.technical` (`offlineCount`, `offlineMs`, `note`) and shown in the timeline with `technical: true`.
- **Timeline** items (ms since session start in `at`): `{kind:"session", type:"started|submitted|deadline"}`, `{kind:"integrity", type, technical, questionId, len?, inEditor?, ref}`,
  `{kind:"editing", at, until, questionId, events, inserted, deleted, pasted, pasteCount, ref}` (one per stored edit batch, positioned from the batch flush time), `{kind:"attempt", type:"run|submit", questionId, verdict, language, ref}`. Max 3000 items (`truncated`).

## GET /api/integrity/cases   (audit: `integrity.list`)
Query (all optional): `status` (comma list), `assessmentId`, `courseId`, `userId`. Lecturers only get cases of their courses.
`200 { success, cases: [ { id, assessmentId, assessmentTitle, courseId, sessionId, userId, studentName, studentEmail, status, reasonCodes[], reasonCount, reviewerId, outcome, hasStudentResponse, createdAt, updatedAt } ] }`. `400` for a bad `status`.

## GET /api/integrity/cases/:id   (audit: `integrity.view`)
```json
{ "success": true, "case": { "...summary fields", "reasons": [], "technical": {}, "notes": "", "studentResponse": { "text": "", "at": "..." }, "history": [ { "at": "...", "by": "...", "action": "", "from": "", "to": "" } ] },
  "timeline": { "startedAt": "...", "items": [], "truncated": false },
  "similarity": [ { "id": "...", "questionId": "...", "otherSessionId": "...", "otherUserId": "...", "containment": 0.93, "jaccard": 0.88, "sharedFingerprints": 31, "ranges": [ { "startLine": 3, "endLine": 12 } ] } ] }
```

## PATCH /api/integrity/cases/:id   (audit: `integrity.update`)
Body, any of `{ status, outcome, notes }` (`notes` at most 4000 characters, private to staff). `409` for a forbidden move, `400` for bad values / resolving without an outcome / empty body. Records the caller as `reviewerId` and adds a `history` entry.
`200 { success, case }`.

## POST /api/integrity/sessions/:id/analyse   (audit: `integrity.analyse`)
Re-runs the flagging rules for one session (for example after changing thresholds). `200 { success, reasons, technical, caseId }`.
## POST /api/integrity/assessments/:id/analyse   (audit: `integrity.analyse`)
All sessions of the assessment. `200 { success, sessions, sessionsWithCases }`.

## Student: own escalated cases
- `GET /api/integrity/my/cases` -> `{ success, cases: [ { id, assessmentId, assessmentTitle, status:"escalated", reasons:[{code,kind,text}], studentResponse, escalatedAt } ] }`. Only the student's own cases with status `escalated`.
  No evidence, no thresholds, no reviewer notes, no technical reasons, no other students' names.
- `GET /api/integrity/my/cases/:id` -> `{ success, case }`; `404` for anything that is not the student's own escalated case.
- `POST /api/integrity/my/cases/:id/response` body `{ "text": "up to 4000 characters" }` -> `201 { success, case }`. Replaces any earlier response. Audit `integrity.student_response`. `400` empty text, `404` as above.
After a case is resolved or dismissed it disappears from the student's list.

---

# 4. Cohort similarity (staff)

### POST /api/integrity/assessments/:id/similarity/run   (audit: `integrity.similarity.run`)
Body (optional): `{ "threshold": 0.3-1, "minTokens": 10-500 }`. Default threshold is the assessment's `similarityContainment` (0.7). Uses each student's **last submitted source per question** (coding/debug), compares students within the same question and language,
ignores the question's starter code, skips solutions with fewer than `minTokens` (default 40) tokens of their own, and ignores boilerplate shared by more than half of a cohort of 5 or more.
Replaces the stored pairs for the assessment, then re-analyses every session in a flagged pair (adds the reason "submission similar to N others" to its case, creating the case if needed).
```json
{ "success": true, "threshold": 0.7, "pairsStored": 4, "flaggedPairs": 1, "sessionsFlagged": 2, "truncated": false,
  "questions": [ { "questionId": "...", "title": "", "submissions": 30, "compared": 28, "flaggedPairs": 1, "skipped": [ { "sessionId": "...", "reason": "too_short" } ] } ],
  "limits": "Similarity is a lead for a human reviewer, not proof. ..." }
```
`400` bad parameters. Running while students are still sitting compares partial work; run after the assessment closes.

### GET /api/integrity/assessments/:id/similarity?flagged=1&questionId=   (audit: `integrity.similarity.view`)
`{ success, pairs: [ { id, questionId, flagged, threshold, containment, jaccard, sharedFingerprints, a: { userId, name, email, sessionId, ranges }, b: { ... } } ] }`, most similar first.
`containment` = shared fingerprints / fingerprints of the smaller submission; `jaccard` = shared / union. `ranges` are 1-based inclusive line ranges of matching fragments in that student's submission. Pairs under 0.3 are not stored.

### Honest limits
Short solutions and boilerplate (reading input the standard way, a lecture example everyone followed) look alike without any copying, so a flag is only a reason to look. Copying that restructures the program, changes the algorithm or splits code differently can score low.
Only the submitted source is compared: no comparison against the web or earlier cohorts. Method: original tokenizer for JavaScript, Python, Java and C-like sources (C, C++, C#, Go, PHP) that normalises identifiers, literals, comments and whitespace; 5-token k-grams hashed with FNV-1a; winnowing with window 4.

---

# 5. Code replay (staff)

### GET /api/integrity/sessions/:id/replay?questionId=   (audit: `integrity.replay`)
```json
{ "success": true, "sessionId": "...", "questionId": "...", "language": "python", "initialSource": "starter|empty", "matchesFinal": true, "approximate": false,
  "truncated": null, "totalEvents": 214, "durationMs": 912000,
  "states": [ { "t": 0, "text": "def f():\n    pass\n", "markers": ["start"] },
              { "t": 1520, "patch": { "pos": 13, "del": 4, "ins": "return 1" }, "markers": [] },
              { "t": 40000, "patch": null, "markers": ["blur"] } ],
  "limits": { "maxStates": 2000, "maxChars": 200000, "outputBudget": 500000, "snapshotEvery": 50, "largePaste": 500 } }
```
- A state has `text` (full document: first state, a snapshot about every 50 states so a player can seek, or the final state) and/or `patch` (apply to the previous document: delete `del` characters at `pos`, then insert `ins`). `patch: null` is a marker-only state (focus/blur).
- `t` is ms since the first editing session started; if the editor reloaded and its clock restarted, times continue upward and the state carries `editor_restarted`.
- `markers`: `start`, `paste`, `large_paste` (>= 500 characters), `truncated` (the stored paste text was cut at 2000 characters), `approximate` (the client did not send inserted text, placeholders are used), `focus`, `blur`, `editor_restarted`, `final_submission` (appended when the reconstruction does not equal the final saved source: also `drift` or `approximate`).
- The starting document is the question's starter code when that reproduces the final source, otherwise an empty document. `truncated` is `max_states`, `output_budget` or `document_too_large` when output was capped. `note` is set when no edit events were recorded.
- Client advice for good replays: send the inserted `text` with every `insert`, and keep `t` monotonic per editing session.
`404` unknown session / question not in the session / not your course.

---

# 6. Retention

`npm run purge:evidence` (inside `server/`, needs `MONGODB_URI`) deletes, per university, evidence older than `Institution.retentionDays` (default 90): integrity events, assessment edit-event batches and similarity pairs,
plus dismissed/resolved cases older than the window. Evidence of sessions whose case is `open` or `escalated` is kept. Practice-mode edit events are not touched. Writes an `integrity.purge` audit entry per university. Safe to run daily.
The pure function is `purgeExpiredEvidence(now)` in `services/integrity/retention.js`.

# 7. Audit actions written by this phase
`assessment.create`, `assessment.update`, `assessment.status`, `assessment.accommodation`, `assessment.extend`, `assessment.start`, `assessment.finish`, `integrity.list`, `integrity.view`, `integrity.update`, `integrity.analyse`,
`integrity.similarity.run`, `integrity.similarity.view`, `integrity.replay`, `integrity.student_response`, `integrity.purge`.

# 8. Changes to existing APIs
- `POST/PUT /api/questions` accept `variantGroup` (string, max 80, `null` clears); staff question view includes it.
- Practice routes return `409 ASSESSMENT_IN_PROGRESS` for questions inside an unfinished assessment of the caller (see principles). Otherwise unchanged; run/submit now share one service with assessment mode.
- Practice autosave / edit-event routes return `404` for attempts that belong to an assessment session, and assessment answers are ignored by practice `?unseen=1` (so correctness is not revealed before results are released).
- Extending a session also extends that session's practice lock, so the lock lasts until the extended deadline.
- New collections: `assessments`, `assessmentsessions`, `integrityevents`, `reviewcases`, `similaritypairs`. `attempts` and `editeventbatches` gained `assessmentSessionId`.
