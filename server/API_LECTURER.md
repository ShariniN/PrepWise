# Lecturer dashboard API: `/api/lecturer`

One dashboard for lecturers: how the university's students do in mock interviews, CV analysis and Practice.

- **Roles:** `lecturer`, `university_admin`. Not signed in: `401`. Any other role (students, and accounts that still carry the
  removed `career_officer` role): `403` (removed roles get `{ code: "ROLE_NOT_SUPPORTED" }`).
- **Scope:** always the caller's own university (`req.user.institutionId`) and only **active students** (`role: "student"`,
  `status: "active"`). Invited and deactivated students are not listed and their ids return `404`. There are no courses: every
  lecturer sees every student of the university. Use `group` to narrow down.
- **Errors:** `{ "success": false, "message": "...", "code"?: "..." }`. Another university's student, a staff member's id, a
  malformed id, or an interview that is not that student's: `404` (never `403`, so ids cannot be probed).
- **Never returned:** CV text (`Interview.resumeText`, `CVAnalysis.resumeText`, the profile CV), passwords, OTPs, invite tokens,
  hidden interview tests, audio URLs, Practice source code.
- **Audit:** every view of one student's data writes an AuditLog entry `lecturer.view_student`
  (`target` = student id, `meta.view` = `"profile"` or `"interview"`, plus `meta.interviewId`). The CSV export writes
  `lecturer.export_students` (`meta: { rows, group }`). List views (overview, table) are not audited. Failed lookups (404) are not audited.
- Dates are ISO 8601 strings. Scores and percentages are numbers 0-100 rounded to 1 decimal, or `null` when there is no data.

## Shared definitions

**Interview score.** Computed from the stored answers of a **completed** interview, not from its stored overall score, so that
fallback-scored answers can be left out:
- an answer counts when it is not skipped, has a numeric `feedback.score`, and `feedback.source !== "fallback"`;
- answers with `feedback.source === "fallback"` (scored by the basic fallback because the AI was unavailable) are **excluded** and counted;
- interview score = mean of the counted answers' scores; `null` if none counted.

**Category scores** (`behavioural`, `technical`, `coding`, `communication`), same counted answers:
- `behavioural`: answers with `questionType` `behavioral`;
- `technical`: `technical`, `system_design`, `problem-solving`;
- `coding`: `coding`;
- `communication`: `feedback.communicationClarity` (0-10) x 10, over all counted answers that have it.

**CV match.** A CV analysis has one result per job. A result counts only when `scoreBreakdown.aiAvailable !== false`, it is not a
non-tech job (`isNonTechRole !== true`, those are always 0 by design) and it has a numeric `matchPercentage`. The **best match** of an
analysis is the highest counted `matchPercentage`. A student's **latest CV match** = best match of their most recent analysis that has
at least one counted result. "Most recent" uses `updatedAt` (falling back to `createdAt`) because re-analysing the same CV updates the
existing analysis in place; so `cvAnalyses` counts distinct CVs analysed, not analysis runs. (Saving/unsaving an analysis also bumps
`updatedAt`.)

**Last active** = the latest of: the user's `lastActive`, any interview created/completed, any CV analysis updated, any Practice run/submit.
(The stored `lastActive` also changes when the user's own record is saved, e.g. profile edits or an admin re-role/reactivate. Setting a
group does not change it.)

**Practice solved** = number of distinct questions with an accepted submission whose score counts (not `fallback`/`ai`, not an
unconfirmed AI suggestion; rows from the removed assessment mode are ignored).

**Needs attention** reasons (array, in this order; empty array = nothing to flag):

| `code` | When | Extra fields |
|---|---|---|
| `no_interview` | no completed mock interview | |
| `no_cv` | no CV analysis | |
| `low_interview_score` | latest interview score (with a score) < 50 | `value`, `threshold: 50` |
| `low_cv_match` | latest CV match < 50 | `value`, `threshold: 50` |
| `inactive_30_days` | last active is 30+ days ago, or no recorded activity | `days` (number or `null`), `threshold: 30` |

Each reason also has a human-readable `message`.

**Minimum group size.** Averages across students are means of per-student values. Each metric is `{ "average": number|null, "n": number }`
where `n` = students who have that metric; `average` is `null` when `n < 5`. Each block also has `insufficientData`
(`true` when its main metric has fewer than 5 students), `notice` (string to show, or `null`) and `minimum: 5`.

**Delivery metrics** come from `responses[].deliveryMetrics` on interviews (written by the camera feature; older interviews have none):
`{ cameraUsed: boolean, faceVisiblePct: 0-100|null, eyeContactPct: 0-100|null, lookAwayCount: int|null, headMovement: "low"|"medium"|"high"|null,
wordsPerMinute: number|null, fillerWordCount: int|null, durationSec: number|null }`.
On read: wrong types and out-of-range values become `null`; camera values (`faceVisiblePct`, `eyeContactPct`, `lookAwayCount`, `headMovement`)
are used only when `cameraUsed === true`. Only completed interviews count.

**Group.** `?group=` is an exact match on the person's `group` (trimmed, max 60 characters; longer gives `400 INVALID_GROUP`). Empty or absent = all students.
Admins set groups with `POST /api/institution/people/invite` (`group`), the CSV import (`group` column) and
`PATCH /api/institution/people/:id/group` with body `{ "group": "CS 2026" }` (`""` clears). See API_PHASE1.md.

---

## GET /api/lecturer/overview

Query: `group` (optional).

200:
```json
{
  "success": true,
  "group": "Group 1",                       // null when not filtered
  "groups": ["Group 1", "Group 2"],         // every group in the university (unfiltered), sorted; use for the filter dropdown
  "generatedAt": "2026-11-10T12:00:00.000Z",
  "totals": {
    "students": 40, "withMockInterview": 25, "withCvAnalysis": 25,
    "active7d": 13, "active30d": 32,          // by "last active"
    "needingAttention": 25                    // students with at least one needs-attention reason
  },
  "interview": {
    "overall":       { "average": 61.0, "n": 25 },   // mean of students' average interview score
    "behavioural":   { "average": 63.2, "n": 25 },
    "technical":     { "average": 60.1, "n": 25 },
    "coding":        { "average": 55.4, "n": 25 },
    "communication": { "average": 62.0, "n": 25 },
    "excludedFallbackAnswers": 7,             // answers left out because feedback.source === "fallback"
    "insufficientData": false, "notice": null, "minimum": 5
  },
  "cv": {
    "averageBestMatch": { "average": 60.1, "n": 25 },  // mean of students' latest CV match
    "excludedAiUnavailableResults": 0,        // CV results left out because scoreBreakdown.aiAvailable === false
    "topMissingSkills": [ { "skill": "docker", "students": 14 } ],  // up to 10; from each student's latest analysis
                                              // (scoreBreakdown.missingSkills of all its jobs, case-insensitive);
                                              // sorted by students desc, then name;
                                              // [] when fewer than 5 students have a CV analysis (studentsWithAnalysis < 5)
    "topMissingSkillsInsufficientData": false, // true when the chips are held back for that reason
    "studentsWithAnalysis": 25,
    "insufficientData": false, "notice": null, "minimum": 5
  },
  "delivery": {
    "n": 25,                                  // students with at least one answer carrying deliveryMetrics
    "answers": 310,                           // answers carrying deliveryMetrics
    "insufficientData": false, "notice": null, "minimum": 5,
    "cameraUsedPct":   { "average": 68.0, "n": 25 },   // per student: % of their answers with the camera on
    "faceVisiblePct":  { "average": 86.2, "n": 19 },
    "eyeContactPct":   { "average": 53.3, "n": 19 },
    "lookAwayCount":   { "average": 2.1,  "n": 19 },   // per answer
    "wordsPerMinute":  { "average": 129.5, "n": 25 },
    "fillerWordCount": { "average": 3.4,  "n": 25 },   // per answer
    "durationSec":     { "average": 104.0, "n": 25 },  // per answer
    "headMovement": { "lowPct": 48.2, "mediumPct": 40.1, "highPct": 11.7, "answers": 210 }  // share of camera answers; nulls when insufficient
  }
}
```
When `delivery.insufficientData` is true every delivery `average` (and the `headMovement` percentages) is `null`.
Errors: `400 INVALID_GROUP`.

## GET /api/lecturer/students

Query (all optional):

| Param | Meaning |
|---|---|
| `group` | exact group |
| `search` | case-insensitive substring of name or email (max 100 chars) |
| `sort` | one of `name` (default), `lastActive`, `interviewsCompleted`, `latestInterviewScore`, `avgInterviewScore`, `latestCvMatch`, `cvAnalyses`, `practiceSolved`; prefix `-` for descending (e.g. `-avgInterviewScore`). `null` values always sort last; ties by name, then id. Anything else: `400`. |
| `page` | 1-based, default 1 |
| `pageSize` | default 25, 1-100 |
| `needsAttention` | `1` or `true`: only students with at least one reason |
| `attention` | one reason code (table above): only students with that reason. Unknown code: `400` |

200:
```json
{
  "success": true,
  "students": [
    {
      "id": "6650...", "name": "Amara Adams", "email": "student@email.com", "group": "Group 1",
      "lastActive": "2026-11-03T09:12:00.000Z",     // or null
      "interviewsCompleted": 2,
      "latestInterviewScore": 58.4,                 // null if no scored completed interview
      "avgInterviewScore": 55.0,                    // mean of the student's interview scores; null if none
      "latestCvMatch": 63,                          // null if no counted CV result
      "cvAnalyses": 1,
      "practiceSolved": 4,
      "needsAttention": [ { "code": "low_interview_score", "message": "Latest mock interview score is 46.2 (below 50)", "value": 46.2, "threshold": 50 } ]
    }
  ],
  "page": 1, "pageSize": 25, "total": 40, "totalPages": 2,
  "sort": "name",            // as applied, e.g. "-avgInterviewScore"
  "group": null
}
```
`total` counts after `group`, `search`, `needsAttention` and `attention`. A `page` past the end returns `students: []`.
Errors: `400` bad `sort`, bad `attention`, `INVALID_GROUP`.

## GET /api/lecturer/students.csv

Same query as `/students` (`group`, `search`, `sort`, `needsAttention`, `attention`), no paging: every matching row.
200 `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="students.csv"`. CRLF line endings. Header:
```
name,email,group,last_active,interviews_completed,latest_interview_score,avg_interview_score,latest_cv_match,cv_analyses,practice_solved,needs_attention
```
`needs_attention` = reason codes joined with `;`. Empty cell = no value. Cells starting with `=`, `+`, `-`, `@`, tab or CR are prefixed
with `'` (spreadsheet formula injection); cells with commas, quotes or newlines are quoted. No CV text.
Writes AuditLog `lecturer.export_students`. Errors: as `/students`.

## GET /api/lecturer/students/:id

`:id` = a student id from the table. `404` unless it is an active student of the caller's university. Audited (`lecturer.view_student`, `meta.view: "profile"`).

200:
```json
{
  "success": true,
  "student": { "id": "...", "name": "...", "email": "...", "group": "Group 1" },
  "summary": { /* the same row object as in GET /students, including needsAttention */ },
  "interviews": [                                  // every interview of the student, newest first
    {
      "id": "...", "status": "completed",          // created | in_progress | completed | cancelled
      "date": "ISO",                               // completedAt, else createdAt
      "jobExcerpt": "Junior Backend Developer at Northwind Labs. Skills: ...",   // first 120 chars of the job description
      "score": 58.4,                               // interview score (null unless completed)
      "categoryScores": { "behavioural": 61, "technical": 55, "coding": 40, "communication": 60 },  // each may be null
      "readinessLevel": "Nearly Ready",            // as stored by the interview, or null
      "answered": 5, "skipped": 0, "excludedFallbackAnswers": 0
    }
  ],
  "cvAnalyses": [                                  // newest first
    {
      "id": "...", "date": "ISO",                  // last analysed (updatedAt)
      "firstAnalysedAt": "ISO",                    // createdAt
      "bestMatch": 63,                             // best counted match, or null
      "results": [
        {
          "jobTitle": "Graduate Software Engineer", "company": "Bluebridge Systems",
          "jobExcerpt": "first 120 chars of that job description",
          "isNonTechRole": false,
          "matchPercentage": 63,                   // or null
          "countsTowardAverage": true,             // false when scoreBreakdown.aiAvailable === false or isNonTechRole
          "scoreBreakdown": {                      // or null on older analyses
            "aiAvailable": true, "aiScore": 0.62, "keywordScore": 0.667, "model": "gemini-...",
            "requiredSkills": ["java", "sql"], "matchedSkills": ["java"], "missingSkills": ["sql"]
          },
          "strengths": ["..."],
          "weaknesses": ["..."]                    // content weaknesses then structure weaknesses
        }
      ]
    }
  ],
  "skills": {                                      // latest skills self-assessment, or null
    "assessedAt": "ISO", "skillsRated": 12, "averageProficiency": 6.4,   // proficiency 1-10
    "strongest": [ { "name": "JavaScript", "category": "Languages", "proficiencyLevel": 9 } ],  // up to 5
    "weakest":   [ { "name": "Docker", "category": "Tools", "proficiencyLevel": 2 } ],          // up to 5, weakest first
    "skills":    [ /* all, strongest first */ ]
  },
  "practice": { "submissions": 9, "solved": 4, "averageScore": 72.5, "excludedScores": 1, "lastSubmissionAt": "ISO|null" },
  "delivery": {                                    // this student's answers with deliveryMetrics (completed interviews)
    "answers": 10, "hasData": true,
    "cameraUsedPct": 80,                           // % of those answers with the camera on
    "faceVisiblePct":  { "average": 84, "n": 8 },  // n = answers that had the value
    "eyeContactPct":   { "average": 61.4, "n": 8 },
    "lookAwayCount":   { "average": 2, "n": 8 },
    "wordsPerMinute":  { "average": 131, "n": 8 },
    "fillerWordCount": { "average": 3.5, "n": 8 },
    "durationSec":     { "average": 98, "n": 10 },
    "headMovement": { "low": 5, "medium": 3, "high": 0, "n": 8 }       // answer counts
  }
}
```
With no delivery data `delivery` is `{ "answers": 0, "hasData": false }`. The 5-student minimum does not apply to one student's own figures.

## GET /api/lecturer/students/:id/interviews/:interviewId

`404` unless the student is an active student of the caller's university **and** the interview belongs to that student.
Audited (`lecturer.view_student`, `meta: { view: "interview", interviewId }`).

200:
```json
{
  "success": true,
  "student": { "id": "...", "name": "...", "email": "...", "group": "..." },
  "interview": {
    "id": "...", "status": "completed", "createdAt": "ISO", "startedAt": "ISO|null", "completedAt": "ISO|null",
    "jobDescription": "full job description text",
    "score": 58.4, "categoryScores": { "behavioural": 61, "technical": 55, "coding": 40, "communication": 60 },
    "storedOverallScore": 57,                      // the score the interview stored itself (includes fallback answers); for reference only
    "readinessLevel": "Nearly Ready",
    "excludedFallbackAnswers": 1,
    "summary": { "strengths": [], "improvements": [], "recommendations": [], "generalFeedback": "" },  // as stored, often empty
    "delivery": { /* same shape as the profile's delivery, for this interview only */ },
    "questions": [                                 // in interview order; answers without a matching question are appended
      {
        "questionId": "...", "type": "behavioral", "category": "Behavioural", "difficulty": "medium",
        "question": "Tell me about a time ...",
        "answered": true, "skipped": false,
        "answer": {                                // null when the question was never answered
          "text": "typed answer", "transcript": "voice transcription", "code": "", "language": null,
          "submittedAt": "ISO|null", "responseTimeSec": 95, "recordingDurationSec": null
        },
        "feedback": {                              // null when there is no feedback
          "source": "ai",                          // ai | tests | human | fallback | null (older answers)
          "executionSource": null, "responseType": "mostly-relevant",
          "score": 68, "questionRelevance": 7, "correctness": null, "syntax": null, "languageBestPractices": null,
          "efficiency": null, "structureAndReadability": null, "edgeCaseHandling": null, "communicationClarity": 7,
          "technicalAccuracy": 6, "structuredResponse": 7, "codeQuality": null, "timeEfficiency": null,
          "strengths": ["..."], "improvements": ["..."], "detailedAnalysis": "...", "overallAssessment": "..."
        },
        "feedbackSource": "ai",                    // same as feedback.source, for convenience
        "executionResults": {                      // coding answers only, else null
          "success": true, "verdict": "accepted", "serverVerified": true, "unavailable": false,
          "testsPassed": 4, "testsTotal": 5, "output": "...", "error": "", "executionTime": "0.04", "memory": null, "executedAt": "ISO|null"
        },
        "deliveryMetrics": { "cameraUsed": true, "faceVisiblePct": 90, "eyeContactPct": 62, "lookAwayCount": 2,
                             "headMovement": "low", "wordsPerMinute": 128, "fillerWordCount": 3, "durationSec": 74 }   // cleaned, or null
      }
    ]
  }
}
```
Show "scored by basic fallback, not counted" next to answers whose `feedbackSource` is `"fallback"`.

---

## Removed endpoints (all return JSON `404` now)

Courses (`/api/courses`): `GET /mine`, `POST /`, `GET /:courseId`, `POST /:courseId/cohorts`, `POST /:courseId/cohorts/:cohortId/enrol`,
`GET /:courseId/cohorts/:cohortId/students`, `POST /:courseId/lecturers`.

Assessments (`/api/assessments`): `GET /`, `POST /`, `GET /:id`, `PUT /:id`, `PATCH /:id/status`, `POST /:id/start`,
`PUT /:id/accommodations/:userId`, `DELETE /:id/accommodations/:userId`, `GET /:id/sessions`, `POST /:id/sessions/:sessionId/extend`,
`GET /sessions/:sessionId`, `GET /sessions/:sessionId/results`, `GET /sessions/:sessionId/questions/:questionId`,
`POST /sessions/:sessionId/questions/:questionId/run`, `POST /sessions/:sessionId/questions/:questionId/submit`,
`PUT /sessions/:sessionId/questions/:questionId/autosave`, `POST /sessions/:sessionId/questions/:questionId/events`,
`POST /sessions/:sessionId/integrity-events`, `POST /sessions/:sessionId/finish`.

Integrity (`/api/integrity`): `GET /my/cases`, `GET /my/cases/:id`, `POST /my/cases/:id/response`, `GET /cases`, `GET /cases/:id`,
`PATCH /cases/:id`, `POST /sessions/:id/analyse`, `POST /assessments/:id/analyse`, `POST /assessments/:id/similarity/run`,
`GET /assessments/:id/similarity`, `GET /sessions/:id/replay`.

Old analytics (`/api/analytics`): `GET /lecturer/failure-patterns`, `GET /lecturer/topic-heatmap`, `GET /lecturer/students-needing-help`,
`GET /lecturer/question-quality`, `GET /lecturer/activity`, `GET /careers/readiness`, `GET /careers/readiness.csv`, `GET /careers/coverage`,
`GET /careers/skills-gap`. (Anonymous calls under `/api/analytics` get `401` before the `404`.)

Other changes the client must know:
- Practice no longer returns `409 ASSESSMENT_IN_PROGRESS`; questions are never locked.
- `GET /api/grading/queue` ignores `courseId`; lecturers grade every answer in their university.
- `GET /api/analytics/admin/overview`: `improvement` is one university-wide block (no `cohorts`). `GET /api/analytics/admin/evidence`:
  no `summary.courses`, `summary.cohorts` or `cohorts` table.
- `GET /api/me/export` no longer has `enrollments`; `DELETE /api/me` no longer reports `deleted.enrollments`.
- Role `career_officer` removed (see the top of this file); `group` added to people (API_PHASE1.md).
- Script `npm run purge:evidence` removed.
