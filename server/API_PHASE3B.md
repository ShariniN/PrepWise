# Phase 3B API: analytics and grading

All endpoints need the sign-in cookie. Role and institution always come from the database. Errors are
`{ "success": false, "message": "..." }` (plus `code` where noted). Statuses: `401` not signed in, `403` wrong role
(students always get `403`), `404` unknown / not yours / another university (never `403`, so ids cannot be probed).
Ids are 24-character hex strings. Students never call these APIs.

## Principles (read before building screens)

- Each view leads to a decision. Lecturer: what needs judgement (grading queue; the student dashboard is in API_LECTURER.md).
  Admin: adoption and renewal evidence. Do not show the same metric at the same level of detail on two dashboards.
- **Minimum group size.** Where a response would show percentages for a group, fewer than **5 students** returns
  `{ "insufficientData": true, "n": 3, "minimum": 5, "notice": "..." }` instead of any percentage. Render the `notice`.
- **Exclusions.** Scores with `scoreSource` `fallback` or `ai`, and short/behavioural answers that only have an unconfirmed AI suggestion,
  are left out of every aggregate. Responses carry the count: `excluded` (attempts) or `excluded.fallbackInterviews` (interviews).
  Show it as "N items not counted". Existing attempts without `scoreSource` are sandbox-marked and count. Human-confirmed scores count.
- **No risk score.** Nothing is ranked; lists are alphabetical or deterministic by data, with reasons.
- Percentages are rounded to 1 decimal, other ratios to 2.

---

# Removed: course-scoped lecturer analytics and career officer analytics

These endpoints no longer exist (JSON `404`): `GET /api/analytics/lecturer/failure-patterns`, `/lecturer/topic-heatmap`,
`/lecturer/students-needing-help`, `/lecturer/question-quality`, `/lecturer/activity`, `/careers/readiness`, `/careers/readiness.csv`,
`/careers/coverage`, `/careers/skills-gap`. They depended on courses and the career officer role, both removed.
The lecturer dashboard is now `/api/lecturer`: see **API_LECTURER.md**.

---

# Admin analytics (role `university_admin`)

## GET /api/analytics/admin/overview
```json
{ "success": true,
  "adoption": { "activeStudents7d": 41, "activeStudents30d": 88, "registeredActiveStudents": 120, "contractedStudentLimit": 150,
                "percentOfLimitActive30d": 58.7, "contractEnd": null },
  "improvement": { "definition": "...", "excludedAttempts": 3,
                   "students": 24, "pairs": 61, "meanFirst": 40, "meanLatest": 80, "delta": 40, "excluded": 0 },
  "aiUsage": { "month": "2026-11", "calls": 150, "cap": 20000, "percentOfCap": 0.8 } }
```
"Active" = a run/submit attempt or a mock interview in the window. Improvement compares, per student and question with 2+ eligible submissions,
the first score with the latest score, averaged over the whole university (there are no cohorts any more). With fewer than 5 such students `improvement`
is `{ insufficientData: true, n, minimum: 5, notice, excluded, excludedAttempts, definition }` instead.

## GET /api/analytics/admin/evidence
Query: `format=json` (default) or `csv`; `includeStudents=1` optional.
JSON: `{ success, includesStudents, summary: { institution, generatedAt, month, registeredActiveStudents, contractedStudentLimit, activeStudents7d, activeStudents30d, practiceSubmissionsTotal, practiceSubmissionsLast30d, mockInterviewsCompleted, cvAnalysesTotal, aiCallsThisMonth, aiMonthlyCap }, students?: [...] }`.
(`summary.courses`, `summary.cohorts` and the `cohorts` table were removed with courses.)
CSV: a `metric,value` block (and, with `includeStudents=1`, a blank line and a student table).
Counts only by default. With `includeStudents=1` it adds `students: [ { name, email, active30d, practiceSubmissions, mockInterviewsCompleted } ]` (alphabetical) and writes an AuditLog entry
`analytics.export.evidence_students` (meta: row count, format).

---

# Grading queue (roles `lecturer`, `university_admin`)

Covers `short` and `behavioural` practice answers (Phase 2 submit returns `verdict: "pending_review"`). Lecturers and admins see every answer from their own
university (there are no courses any more). Another university's items are `404`. Requires the question to have a rubric (Phase 2 `/api/questions/:id/rubric`).

**The AI only suggests.** A suggestion is stored with `source: "ai"` and never becomes the score. The final score exists only after a human confirms:
`score = round(total / rubricTotal * 100)`, `scoreSource: "human"`, `review.final.source: "human"`, `confirmedBy` = the lecturer. Verdict becomes `reviewed`.

Item (list entry) fields: `id`, `questionId`, `questionTitle`, `questionType`, `studentId`, `studentName`, `submittedAt`,
`status` (`pending_review` | `reviewed`), `hasAiSuggestion`, `score` (null until confirmed), `scoreSource` (null | `human`).

## GET /api/grading/queue
Query optional: `status=pending` (default) or `reviewed`, `questionId` (`400` if not an id). `courseId` is no longer accepted (ignored). Oldest first, at most 500.
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
Only items listed with `decision` exactly `accept_ai_suggestion` are confirmed, and only when they belong to the caller's university, still pending, have a rubric and a stored AI suggestion.
There is no "accept all": the client must send the ids the lecturer selected.
`200 { success, results: [ { "attemptId": "...", "status": "confirmed", "score": 80 } | { "attemptId": "...", "status": "skipped", "reason": "..." } ] }`.
Errors: `400` empty / not an array / more than 50.

## Audit log entries
`grading.suggest`, `grading.confirm` (meta: total, maxTotal, acceptedAiSuggestion, overrodeAi), `grading.bulk_confirm` (meta: requested, confirmed),
`analytics.export.evidence_students`. (`analytics.export.readiness` is no longer written.)

## Data model additions (Attempt)
`scoreSource` (`tests|human|ai|fallback`, absent on older attempts = sandbox), `review.aiSuggestion`, `review.final`. No migration is needed.
