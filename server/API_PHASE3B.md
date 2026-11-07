# Phase 3B API: analytics and grading

All endpoints need the sign-in cookie. Role and institution always come from the database. Errors are
`{ "success": false, "message": "..." }` (plus `code` where noted). Statuses: `401` not signed in, `403` wrong role
(students always get `403`), `404` unknown / not yours / another university (never `403`, so ids cannot be probed).
Ids are 24-character hex strings. Students never call these APIs.

## Principles (read before building screens)

- Each view leads to a decision. Lecturer: what to re-teach, who needs help, what needs judgement. Career officer: who is ready for what.
  Admin: adoption and renewal evidence. Do not show the same metric at the same level of detail on two dashboards.
- **Minimum cohort size.** Where a response would show percentages for a group, fewer than **5 students** returns
  `{ "insufficientData": true, "n": 3, "minimum": 5, "notice": "..." }` instead of any percentage. Render the `notice`.
- **Exclusions.** Scores with `scoreSource` `fallback` or `ai`, and short/behavioural answers that only have an unconfirmed AI suggestion,
  are left out of every aggregate. Responses carry the count: `excluded` (attempts) or `excluded.fallbackInterviews` (interviews).
  Show it as "N items not counted". Existing attempts without `scoreSource` are sandbox-marked and count. Human-confirmed scores count.
  Interviews count only if none of their responses has `feedback.source === "fallback"`.
- **No risk score.** Nothing is ranked; lists are alphabetical or deterministic by data, with reasons.
- Percentages are rounded to 1 decimal, other ratios to 2.

---

# Lecturer analytics (roles `lecturer`, `university_admin`)

Query on every endpoint: `courseId` (required), `cohortId` (optional, must belong to the course).
A lecturer may only use courses they own or are assigned to; admins any course in their university. Otherwise `404`
(`Course not found` / `Cohort not found`); `400` if `courseId` is missing. Students in scope are those enrolled in the course (or cohort).

Every response includes `scope`:
`{ "courseId", "courseCode", "cohortId": null|"...", "cohortName": null|"...", "students": 24 }`.

## GET /api/analytics/lecturer/failure-patterns
Coding/debug questions students submitted. Uses each student's **latest** submission per question.
```json
{ "success": true, "scope": {}, "minimumStudents": 5, "excluded": 0, "note": "...",
  "questions": [
    { "questionId": "...", "title": "Sum", "n": 24, "failingStudents": 9, "failingPercent": 37.5,
      "verdicts": { "accepted": 15, "wrong_answer": 7, "time_limit": 2 },
      "tests": [ { "index": 2, "testId": "...", "visible": false, "failCount": 8, "failPercent": 33.3, "input": "2", "expectedOutput": "4" } ] },
    { "insufficientData": true, "n": 3, "minimum": 5, "notice": "...", "questionId": "...", "title": "..." } ] }
```
`tests` is sorted by `failCount` descending (ties by `index`) and includes **hidden** tests with their input and expected output (staff only).
`index` is the 1-based position of the test, matching `perTest` order. Questions are ordered by `failingPercent` descending; insufficient ones last.

## GET /api/analytics/lecturer/topic-heatmap
Students x topics. A cell is the mean, over the questions in the topic, of the student's **best** eligible score; `null` when the student has none.
Questions with no topic fall under `untagged`.
```json
{ "success": true, "scope": {}, "excluded": 0, "topics": ["arrays", "recursion"],
  "columns": [ { "topic": "arrays", "mean": 73.3, "studentsWithData": 18, "studentsTotal": 24, "belowFiftyPercent": 22.2 } ],
  "rows": [ { "studentId": "...", "name": "Ann", "values": [100, null], "mean": 100 } ] }
```
Deterministic order: columns by column mean descending then topic name; rows by overall mean descending (students with no data last) then name then id.
`values[i]` lines up with `topics[i]` / `columns[i]`. This view is per student by design (it is the lecturer's own course).

## GET /api/analytics/lecturer/students-needing-help
Optional query thresholds (integers, clamped): `inactiveDays` (default 14), `declineWindow` (3), `declineMin` (10, points), `compileErrors` (3), `compileWindow` (5).
```json
{ "success": true, "scope": {}, "excluded": 0, "note": "...",
  "thresholds": { "inactiveDays": 14, "declineWindow": 3, "declineMin": 10, "compileErrors": 3, "compileWindow": 5 },
  "students": [ { "studentId": "...", "name": "Bob", "email": "...", "reasons": [
    { "code": "declining_topic", "message": "Declining over last 3 attempt sets on topic recursion", "topic": "recursion", "scores": [80, 60, 40] } ] } ] }
```
Reason `code` values and their extra fields:
- `never_submitted` (`hadRuns`): no submission at all (even if they ran code).
- `no_recent_attempts` (`days`, `threshold`, `lastSubmissionAt`): last submission is `inactiveDays` or more days old.
- `declining_topic` (`topic`, `scores`): the last `declineWindow` scored submissions on the topic strictly fall and drop by at least `declineMin` overall.
- `repeated_compile_errors` (`count`, `window`): at least `compileErrors` of the last `compileWindow` submissions were `compile_error`.

Only students with at least one reason are listed, alphabetically by name. There is no score and no ranking; do not invent one client-side.

## GET /api/analytics/lecturer/question-quality
Query optional: `overExposurePct` (default 90).
```json
{ "success": true, "scope": {}, "minimumStudents": 5, "excluded": 0,
  "questions": [ { "questionId": "...", "title": "Fact", "topic": ["recursion"], "difficulty": "easy",
    "attempts": 31, "students": 24, "passRatePercent": 62.5,
    "discriminationIndex": 0.5, "topQuartilePassRate": 1, "bottomQuartilePassRate": 0.5, "rankedStudents": 22,
    "medianMinutesToSolve": 14.5, "solvers": 15,
    "flags": { "maybeBadlyWorded": false, "lowDiscrimination": false },
    "usage": { "studentsAttempted": 24, "studentsInScope": 24, "percentOfScope": 100, "overExposed": true } },
    { "insufficientData": true, "n": 3, "minimum": 5, "notice": "...", "questionId": "...", "title": "...", "attempts": 3, "usage": {} } ] }
```
Definitions:
- `passRatePercent`: share of students who submitted whose eligible submissions include an `accepted` one.
- `discriminationIndex` D = pass rate of the top quartile minus pass rate of the bottom quartile (range -1..1). Students are ranked by their mean best score
  on the **other** questions; quartile size is `max(1, floor(rankedStudents / 4))`. `null` when fewer than 5 students can be ranked.
- `maybeBadlyWorded`: top-quartile pass rate is below 0.5 (strong students also fail; review the wording and tests). `lowDiscrimination`: D < 0.1.
- `medianMinutesToSolve`: median of (first touch of the question, including drafts and runs, to first accepted submission) over solvers.
- `usage.overExposed`: `percentOfScope` is at least `overExposurePct` and the scope has at least 5 students.
Questions nobody touched are omitted.

## GET /api/analytics/lecturer/activity
Query optional: `days` (default 30, 1-180). Runs and submissions (not drafts), UTC days, zero filled, oldest first.
`{ "success": true, "scope": {}, "days": 30, "daily": [ { "date": "2026-11-07", "attempts": 12, "submissions": 5, "activeStudents": 4 } ] }`

---

# Career officer analytics (roles `career_officer`, `university_admin`)

Institution-wide. Optional query on readiness, coverage and skills-gap: `courseId`, `cohortId` (`404` if not in the caller's university).
Programme = course. These responses never contain source code, hidden tests, CV text, interview answers or resume text.

## GET /api/analytics/careers/readiness
```json
{ "success": true, "note": "...", "excluded": { "fallbackInterviews": 1, "unconfirmedOrFallbackAttempts": 0 },
  "programmes": [ { "courseId": "...", "code": "CS101", "title": "Intro", "cohorts": [ {
    "cohortId": "...", "name": "G1", "studentCount": 6, "withCvAnalysisPercent": 16.7, "withMockInterviewPercent": 33.3, "withBothPercent": 16.7, "withPracticeSolvedPercent": 16.7, "students": [
      { "studentId": "...", "name": "Ann", "email": "...", "cvAnalyses": 1, "mockInterviewsCompleted": 2, "mockInterviewsScored": 2, "practiceSolved": 1,
        "interviewAverages": { "behavioralSkills": 60, "technicalKnowledge": 40, "codingAbility": 20, "communication": 50 } } ],
    "meanInterviewAverages": { "behavioralSkills": 60, "technicalKnowledge": 40, "codingAbility": 20, "communication": 50 } } ] } ] }
```
Cohort keys: `cohortId`, `name`, `studentCount`, `withCvAnalysisPercent`, `withMockInterviewPercent`, `withBothPercent`, `withPracticeSolvedPercent`,
`meanInterviewAverages`, `students` (the rows).
`mockInterviewsCompleted` counts all completed interviews; `mockInterviewsScored` excludes fallback-sourced ones, and `interviewAverages`
(0-100, `null` if none) are means over scored interviews only. `practiceSolved` = distinct questions with an eligible accepted submission.
Percentages here are for the cohort as a whole; `/coverage` gives the same percentages without student rows.

## GET /api/analytics/careers/coverage
Aggregates only, no student rows.
```json
{ "success": true,
  "institution": { "students": 120, "withCvAnalysisPercent": 33.3, "withMockInterviewPercent": 16.7, "withBothPercent": 10, "withPracticeSolvedPercent": 80 },
  "programmes": [ { "courseId": "...", "code": "CS101", "title": "Intro", "cohorts": [
    { "cohortId": "...", "name": "G1", "studentCount": 24, "withCvAnalysisPercent": 33.3, "withMockInterviewPercent": 16.7, "withBothPercent": 10 } ] } ] }
```
(Practice coverage appears only at institution level and on the readiness table.)

## GET /api/analytics/careers/readiness.csv
CSV download (`text/csv`, `Content-Disposition: attachment; filename="readiness.csv"`), same scope query. Columns:
`programme,cohort,student,email,cv_analyses,mock_interviews_completed,practice_solved,avg_behavioral,avg_technical,avg_coding,avg_communication`.
No CV text. Cells starting with `= + - @` are prefixed with `'` to block spreadsheet formula injection. Writes an AuditLog entry `analytics.export.readiness`.

## GET /api/analytics/careers/skills-gap
Query optional: `threshold` (1-10, default 5). Uses each student's latest skills assessment (the self-reported proficiency 1-10 from the CV skills analysis).
A skill is listed only when at least 5 students have it. A gap is a skill whose mean proficiency is below the threshold.
```json
{ "success": true, "students": 40, "threshold": 5, "minStudentsPerSkill": 5, "note": "...",
  "gaps": [ { "skill": "SQL", "category": "Data", "students": 30, "meanProficiency": 3.2, "belowThreshold": true } ],
  "skills": [ { "skill": "SQL", "category": "Data", "students": 30, "meanProficiency": 3.2, "belowThreshold": true } ] }
```
With fewer than 5 assessed students: `{ success, insufficientData: true, n, minimum: 5, notice }`.

---

# Admin analytics (role `university_admin`)

## GET /api/analytics/admin/overview
```json
{ "success": true,
  "adoption": { "activeStudents7d": 41, "activeStudents30d": 88, "registeredActiveStudents": 120, "contractedStudentLimit": 150,
                "percentOfLimitActive30d": 58.7, "contractEnd": null },
  "improvement": { "definition": "...", "excludedAttempts": 3, "cohorts": [
    { "cohortId": "...", "cohort": "G1", "courseCode": "CS101", "students": 24,
      "meanFirst": 40, "meanLatest": 80, "delta": 40, "pairs": 61, "excluded": 0 },
    { "cohortId": "...", "cohort": "G2", "courseCode": "CS101", "students": 3, "insufficientData": true, "n": 2, "minimum": 5, "notice": "..." } ] },
  "aiUsage": { "month": "2026-11", "calls": 150, "cap": 20000, "percentOfCap": 0.8 } }
```
"Active" = a run/submit attempt or a mock interview in the window. Improvement compares, per student and question with 2+ eligible submissions,
the first score with the latest score, averaged; `students` inside an insufficient cohort entry is the cohort size and `n` the number with repeat attempts.

## GET /api/analytics/admin/evidence
Query: `format=json` (default) or `csv`; `includeStudents=1` optional.
JSON: `{ success, includesStudents, summary: { institution, generatedAt, month, registeredActiveStudents, contractedStudentLimit, activeStudents7d, activeStudents30d, courses, cohorts, practiceSubmissionsTotal, practiceSubmissionsLast30d, mockInterviewsCompleted, cvAnalysesTotal, aiCallsThisMonth, aiMonthlyCap }, cohorts: [ { course, cohort, students, active30d, practiceSubmissions } ], students?: [...] }`.
CSV: a `metric,value` block, a blank line, then the cohort table (and, with `includeStudents=1`, a blank line and a student table).
Counts only by default. With `includeStudents=1` it adds `students: [ { name, email, active30d, practiceSubmissions, mockInterviewsCompleted } ]` (alphabetical) and writes an AuditLog entry
`analytics.export.evidence_students` (meta: row count, format).

---

# Grading queue (roles `lecturer`, `university_admin`)

Covers `short` and `behavioural` practice answers (Phase 2 submit returns `verdict: "pending_review"`). Lecturers see answers from students enrolled in
courses they own or are assigned to; admins see the whole university. Anything else is `404`. Requires the question to have a rubric (Phase 2 `/api/questions/:id/rubric`).

**The AI only suggests.** A suggestion is stored with `source: "ai"` and never becomes the score. The final score exists only after a human confirms:
`score = round(total / rubricTotal * 100)`, `scoreSource: "human"`, `review.final.source: "human"`, `confirmedBy` = the lecturer. Verdict becomes `reviewed`.

Item (list entry) fields: `id`, `questionId`, `questionTitle`, `questionType`, `studentId`, `studentName`, `submittedAt`,
`status` (`pending_review` | `reviewed`), `hasAiSuggestion`, `score` (null until confirmed), `scoreSource` (null | `human`).

## GET /api/grading/queue
Query optional: `status=pending` (default) or `reviewed`, `courseId` (`404` if not accessible), `questionId`. Oldest first, at most 500.
`200 { success, status, count, items: [ ...list entries ] }`

## GET /api/grading/:id
`200 { success, item }` where item = list entry plus
`rubricTotal`, `question: { statement, type, topic }`, `rubric: [ { name, description, maxPoints, levels } ] | null`, `answer` (student text),
`aiSuggestion: null | { source: "ai", criteria: [ { name, maxPoints, points, reason } ], total, maxTotal, summary, at }`,
`final: null | { source: "human", criteria: [ { name, maxPoints, points, comment } ], total, maxTotal, comment, confirmedBy, acceptedAiSuggestion, overrodeAi, at }`.

## POST /api/grading/:id/suggest
No body. Asks the AI (through the shared AI service, so it counts against the university's monthly cap). Output is forced onto the rubric: unknown criteria dropped,
missing criteria get 0, points clamped to `[0, maxPoints]`. Calling it again replaces the stored suggestion.
`200 { success, aiSuggestion, note }`.
Errors: `404`; `409` already reviewed or the question has no rubric; **`429 { code: "AI_MONTHLY_CAP", manualGradingAvailable: true, message }`** when the cap is reached
(show the message and keep manual grading available); `502 { manualGradingAvailable: true }` when the AI produced nothing usable.

## PATCH /api/grading/:id
Confirm or override. Body:
`{ "criteria": [ { "name": "Accuracy", "points": 3, "comment": "optional" } ], "comment": "optional overall comment" }`
Every rubric criterion must appear exactly once (names matched case-insensitively), points between 0 and the criterion's `maxPoints`.
Alternatively `{ "acceptAiSuggestion": true }` without `criteria` confirms the stored suggestion as-is.
`final.overrodeAi` is true when a suggestion exists and the points differ.
`200 { success, item }`. Errors: `400` invalid points / missing criteria / nothing to accept; `404`; `409` already reviewed (confirming twice never overwrites) or no rubric.

## POST /api/grading/bulk-confirm
Body `{ "items": [ { "attemptId": "...", "decision": "accept_ai_suggestion", "comment": "optional" } ] }`, 1-50 items.
Only items listed with `decision` exactly `accept_ai_suggestion` are confirmed, and only when they are visible to the caller, still pending, have a rubric and a stored AI suggestion.
There is no "accept all": the client must send the ids the lecturer selected.
`200 { success, results: [ { "attemptId": "...", "status": "confirmed", "score": 80 } | { "attemptId": "...", "status": "skipped", "reason": "..." } ] }`.
Errors: `400` empty / not an array / more than 50.

## Audit log entries
`grading.suggest`, `grading.confirm` (meta: total, maxTotal, acceptedAiSuggestion, overrodeAi), `grading.bulk_confirm` (meta: requested, confirmed),
`analytics.export.readiness`, `analytics.export.evidence_students`.

## Data model additions (Attempt)
`scoreSource` (`tests|human|ai|fallback`, absent on older attempts = sandbox), `review.aiSuggestion`, `review.final`. No migration is needed.
