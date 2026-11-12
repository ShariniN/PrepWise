# PrepWise API reference

Taken from `server/app.js` and every `server/modules/*/*.routes.js`. All paths start with `/api`.

**Conventions**
- Auth is a `token` HTTP-only cookie set by login, accept-invite and verify-email. "Any user" means any signed-in user with a known role.
- Roles: `student`, `lecturer`, `university_admin`. Role, institution and status are read from the database on every request.
- Failures are `{ success: false, message, code? }`. The interviews router is the exception for most of its errors: `{ success: false, error }`, with `code` and `message` added for the coded ones (`CV_REQUIRED`, `TARGET_ROLE_REQUIRED`, `READINESS_REQUIRED`, `ALREADY_ANSWERED`, `INTERVIEW_COMPLETED`, `TRANSCRIPTION_UNAVAILABLE`). Plain errors in that router (404, 400 without a code, 500) carry only `error`. Common to every signed-in route: `401` not signed in or account not active, `403 ROLE_NOT_SUPPORTED` for a removed role, `403` wrong role ("You do not have permission to do this").
- Every query is scoped to the caller's institution.
- An unknown `/api/...` path answers `404 { success: false, message: "Not found" }`.
- Outside production, mail is not sent: sign-up and invitations return the link in the response (`devVerificationLink`, `inviteLink`).

## Auth (`/api/auth`)

| Method and path | Who | Body | Response | Errors |
|---|---|---|---|---|
| POST `/auth/signup` | public, rate limited | `name`, `email` (a `password` field is accepted and ignored; it is chosen at verify) | `{ success, message, devVerificationLink? }`. Stores no password. Same answer for an existing email. | 400 `INVALID_EMAIL`, `INVALID_NAME`, `SIGNUP_DOMAIN_NOT_ALLOWED`; 409 `SEAT_LIMIT_REACHED`; 429 |
| POST `/auth/verify-email` | public | `token` (64 hex), `password` (same rule as accept-invite) | session body (below) and sets the cookie; sets the password; the student takes a seat now | 400 `VERIFY_INVALID`, `VERIFY_EXPIRED`, `WEAK_PASSWORD` (token kept); 409 `SEAT_LIMIT_REACHED` (token kept, no password set); 503 `TRY_AGAIN` |
| POST `/auth/resend-verification` | public, rate limited | `email` | `{ success, message }` always | 429 |
| POST `/auth/accept-invite` | public | `token`, `password`, `name?`, `phoneNumber?` (10 digits) | session body and sets the cookie | 400 `INVITE_INVALID`, `INVITE_EXPIRED`, weak password, bad name or phone; 403 `ROLE_NOT_SUPPORTED` |
| POST `/auth/login` | public | `email`, `password` | session body and sets the cookie | 401 wrong credentials; 403 `EMAIL_NOT_VERIFIED`, deactivated, not yet activated, `ROLE_NOT_SUPPORTED` |
| POST `/auth/logout` | public | none | `{ success, message }`, clears the cookie | |
| GET `/auth/is-auth` | any user | none | `{ success, user: { id, name, email, role, institutionId, status, targetRoleId, targetRoleTitle, needsOnboarding, isAccountVerified, phoneNumber, lastActive, createdAt, updatedAt } }`. `needsOnboarding` is true for a student with no target role. | 401 |
| POST `/auth/send-reset-otp` | public | `email` | `{ success, message }` (mails a 6-digit code, valid 15 minutes) | `success: false` with `message` (status 200) when the email is missing or unknown |
| POST `/auth/reset-password` | public | `email`, `otp`, `newPassword` | `{ success, message }` | `success: false` with `message` (status 200): missing fields, unknown user, invalid or expired OTP |

Session body: `{ success, role, institutionId, accountType, isAccountVerified, needsVerification, userType }`.

Password rule: at least 6 characters with an upper case letter, a digit and a symbol.

## Users (`/api/user`, any user)

| Method and path | Body | Response | Errors |
|---|---|---|---|
| GET `/user/profile` | none | `{ success, data: user }` (no password or OTP fields) | 404 |
| PUT `/user/profile` | `name` (1-100 chars), `phoneNumber?` (10-15 digits; `""` or `null` clears it) | `{ success, message, data: user }` | 400 bad name or phone |
| PUT `/user/change-password` | `currentPassword`, `newPassword` | `{ success, message }` | 400 missing field, weak password, wrong current password |
| PUT `/user/upload-cv` | multipart, PDF in field `cv` (max 10 MB) | `{ success, message, data: { fileName, fileSize, uploadedAt, hasCV } }` | 400 not a PDF, no file, no readable text |
| GET `/user/cv` | none | `{ success, data: { fileName, uploadedAt, fileSize, hasText, textLength } }` | 404 `No CV uploaded yet` |
| DELETE `/user/cv` | none | `{ success, message }` | 404 `No CV to delete` |
| GET `/user/saved-analyses` | none | same as GET `/analyze/saved` | |
| DELETE `/user/analysis/:id` | none | same as DELETE `/analyze/delete/:id` | |

## CV analysis (`/api/analyze`, any user; students are scored against their target role)

| Method and path | Body | Response | Errors |
|---|---|---|---|
| POST `/analyze/analyze-resume` | multipart: PDF in field `resume` (or `useProfileCV=true` to use the CV on file), `jobDescriptions` (JSON string array, optional for students) | `{ success, analysisId, resumeHash, extractedTechnologies, technologiesUnavailable, analysis: [result], metadata }`. A student's first result has `kind: "target_role"`; pasted descriptions give `kind: "job_description"`. Each result has `matchPercentage`, `scoreBreakdown { keywordScore, aiScore, aiAvailable, matchedSkills, missingSkills, ... }`, strengths, weaknesses, recommendations. With no AI, `aiAvailable` is false and `matchPercentage` is null. | 400 bad job descriptions, no file, unreadable PDF, no profile CV, no description for a non-student; 409 `TARGET_ROLE_REQUIRED` (student without a role); 500 |
| POST `/analyze/save` | `id` or `resumeHash`, `shouldSave?` (default true) | `{ success, message, saved, data: { id, isSaved, resumeHash } }`. Only marks a stored analysis; scores are never taken from the request. | 400 neither id nor hash; 404 `Analyse your CV first.` |
| GET `/analyze/saved` | none | `{ success, message, data: [analysis], count }` (up to 50, newest first) | |
| DELETE `/analyze/delete/:id` | none | `{ success, message, deletedId, deletedAnalysis }` | 400 bad id; 404 not found or not yours |

## Interviews (`/api/interviews`, any user; the flow is built for students)

An adaptive mock interview has 5 slots in the order behavioural, technical, coding, technical, behavioural. Each answer moves the level one step: score 75 or more goes up, below 45 goes down, otherwise it stays (an answer scored by the basic fallback keeps the level). The first interview starts at the level from the readiness answer (`just_starting` easy, `some_practice` medium, `ready` hard); later ones start at the level the last one ended on.

| Method and path | Body | Response | Errors |
|---|---|---|---|
| GET `/interviews/setup` | none | `{ success, cv: { onFile, fileName, uploadedAt }, targetRole: { id, title } or null, firstInterview, startLevel, totalSlots }` | |
| POST `/interviews/create` | `readiness?` (needed on a first interview), `jobDescription?` (extra text, max 5000 chars) | 201 `{ success, usedFallbackQuestions, interview: { id, questions: [first question], totalSlots, startLevel, status, usedFallbackQuestions, createdAt } }`. The question pool stays on the server. `usedFallbackQuestions` is true when the AI could not write the pool. | 409 `CV_REQUIRED`, `TARGET_ROLE_REQUIRED`; 400 `READINESS_REQUIRED`; 500 |
| GET `/interviews/history` | query `page`, `limit` | `{ success, interviews: [{ status, overallFeedback, createdAt, completedAt, totalDuration }], pagination }` | |
| GET `/interviews/:interviewId` | none | `{ success, interview }` with the questions asked so far; never the pool or hidden tests | 404 |
| PUT `/interviews/:interviewId/start` | none | `{ success, firstQuestion, totalQuestions, questions }` | 400 already started; 404 |
| POST `/interviews/:interviewId/submit-answer` | `questionId`, `answerMode` (`text`, `audio` or `code`), `responseText`, `code?`, `language?`, `responseTime`, `skipped?`, `deliveryMetrics?` (numbers only, coaching only, never scored) | `{ success, feedback, deliveryMetrics, nextQuestion, level, done, progress: { current, total, completed } }`. `nextQuestion` is at the new level; null after the fifth answer, which also completes the interview and sets `levelReached`. Coding answers are marked on the server against the seeded practice question's tests. `feedback.source` is `ai`, `tests` or `fallback`. | 400 unknown question, missing text, language not allowed; 404; 409 `ALREADY_ANSWERED` (also when sent twice at once), `INTERVIEW_COMPLETED` |
| PUT `/interviews/:interviewId/complete` | none | `{ success, results: { ...scores, feedback, questionsAnswered, totalQuestions, startLevel, levelReached, deliverySummary } }`. Ends early; the level reached follows the last answer. | 404 |
| GET `/interviews/:interviewId/feedback` | none | `{ success, feedback: { ...scores, feedback, responses, startLevel, levelReached, questions, deliverySummary, excludedFallbackAnswers } }` | 404 |
| POST `/interviews/transcribe` | multipart audio in field `audio` (max 25 MB, 20 a minute) | `{ success, text, durationSec }`. Speech to text with Groq Whisper; audio is not stored. | 400 no audio or not audio; 503 `TRANSCRIPTION_UNAVAILABLE` (no `GROQ_API_KEY` or provider failure) |
| POST `/interviews/execute-code` | same as `/code/execute` | same as `/code/execute` (10 a minute) | |

## Code (`/api/code`, any user)

| Method and path | Body | Response | Errors |
|---|---|---|---|
| POST `/code/execute` | `script`, `language`, `stdin?` | `{ success, verdict, output, error, executionTime, memory, statusCode }` | 400 missing field or unsupported language; 413 too large; 503 `verdict: "unavailable"` with `reason` when no runner is set up (nothing is scored); 429 (50 per 15 minutes) |
| GET `/code/health` and GET `/code/languages` | none | `{ success, provider, configured, supportedLanguages, languages, warning?, timestamp }` | |

## People (`/api/institution`, university admin)

Everything here works on the admin's own university. A person outside it is `404 NOT_FOUND`. Errors carry `{ success: false, message, code }`.

`person` = `{ id, name, email, role, status, group, assignedGroups, isAccountVerified, lastActive, createdAt, inviteExpiresAt }`. `status` is `invited`, `active` or `deactivated`.

| Method and path | Body or query | Response | Errors |
|---|---|---|---|
| GET `/institution/people` | query `role`, `status` (`invited`, `unverified`, `active`, `deactivated`), `search`, `group` | `{ success, people, counts: { total, byRole, byStatus }, usage }` | 400 unknown role or status filter, bad group |
| GET `/institution/usage` | none | `{ success, studentLimit, activeStudents, invitedStudents, remaining }` | |
| GET `/institution/groups` | none | `{ success, groups: [name] }` (student groups in use) | |
| POST `/institution/people/invite` | `email`, `name?`, `role?` (default `student`), `group?` | 201 `{ success, user, emailSent, warning?, inviteLink? }` (`inviteLink` outside production only) | 400 `INVALID_EMAIL`, `INVALID_ROLE`, `INVALID_GROUP`, `DOMAIN_NOT_ALLOWED`; 409 `EMAIL_IN_USE`, `STUDENT_LIMIT_REACHED` |
| POST `/institution/people/import` | CSV as the body (`Content-Type: text/csv`) or `{ csv }`. Columns: `email` (required), `name`, `role`, `group`. Up to 2000 rows. | `{ success, results: [{ line, email, role, status, reason?, inviteLink? }], summary, limitReached?, warning? }`. Row status is `invited`, `skipped`, `blocked_limit` or `error`. | 400 `INVALID_CSV`; 413 `TOO_MANY_ROWS` |
| PATCH `/institution/people/:id/deactivate` | none | `{ success, user }` | 400 `SELF`; 404; 409 `ALREADY`, `LAST_ADMIN` |
| PATCH `/institution/people/:id/reactivate` | none | `{ success, user, inviteLink?, emailSent? }` (someone who never accepted goes back to `invited`) | 404; 409 `NOT_DEACTIVATED`, `STUDENT_LIMIT_REACHED` |
| PATCH `/institution/people/:id/role` | `role` | `{ success, user }` | 400 `INVALID_ROLE`, `SELF`, `ACCOUNT_NOT_VERIFIED` (a self-signup that has not verified); 404; 409 `SAME_ROLE`, `LAST_ADMIN` |
| PATCH `/institution/people/:id/group` | `group` (text up to 60 chars; `""` clears) | `{ success, user }` | 400 `INVALID_GROUP`; 404 |
| PATCH `/institution/people/:id/assigned-groups` | `groups` (list of names, up to 20) | `{ success, user }`. These are the groups a lecturer sees on the dashboard. | 400 `NOT_A_LECTURER`, `INVALID_GROUPS`, `TOO_MANY_GROUPS`; 404 |
| POST `/institution/people/:id/resend-invite` | none | `{ success, user, emailSent, inviteLink? }` | 404; 409 `NOT_INVITED` |
| POST `/institution/people/:id/cancel-signup` | none | `{ success, cancelled: true, id }`. Removes an unverified self-signup, so the address can be invited or sign up again. | 404; 409 `NOT_UNVERIFIED` |

## University settings and target roles (`/api/institution`, university admin)

`role` = `{ id, title, description, skills }`. Up to 30 roles; title up to 80 chars; description up to 2000; up to 30 skills of up to 60 chars.

| Method and path | Body | Response | Errors |
|---|---|---|---|
| GET `/institution/settings` | none | `{ success, allowedEmailDomains, selfSignup, contractedStudentLimit, targetRoles }` | 404 |
| PATCH `/institution/settings` | `allowedEmailDomains?` (list), `selfSignup?` (boolean) | the same as GET | 400 bad domain, not a boolean, nothing to change, `LIMIT_NOT_EDITABLE` (the student limit is set by contract) |
| POST `/institution/target-roles` | `title`, `description?`, `skills?` | 201 `{ success, targetRole, targetRoles }` | 400 missing or too long fields, too many roles |
| PATCH `/institution/target-roles/:id` | any of `title`, `description`, `skills` | `{ success, targetRole, targetRoles }` | 400 nothing to change; 404 |
| DELETE `/institution/target-roles/:id` | none | `{ success, targetRoles }`. Students who had the role are cleared and see onboarding again. | 404; 409 `LAST_TARGET_ROLE` |

## Me, target role and data rights (`/api/me`, any signed-in user unless noted)

| Method and path | Who | Body | Response | Errors |
|---|---|---|---|---|
| GET `/me/target-roles` | any user | none | plain array `[{ id, title, description }]` of the university's roles | |
| PUT `/me/target-role` | student | `targetRoleId` | `{ success, targetRoleId, targetRoleTitle }` | 400 `TARGET_ROLE_INVALID` |
| GET `/me/export` | any user | none | a JSON download of the caller's own data (profile, CV text, interviews, analyses, attempts) | 404 |
| POST `/me/consent` | any user | `type`, `version` | 201 `{ success, consent: { type, version, acceptedAt } }` | 400 bad type or version |
| DELETE `/me` | any user | `password` | `{ success, message, deleted }`, clears the cookie. Deletes the account and its data. | 400 no password; 403 wrong password; 409 only administrator |

## Compliance (`/api/compliance`)

| Method and path | Who | Response |
|---|---|---|
| GET `/compliance/subprocessors` | public | `{ success, updated, subprocessors: [{ name, purpose, status, data, note? }] }` (`status` is `in_use` or `planned`) |

## Practice (`/api/practice`, student)

Coding, multiple-choice (`mcq`) and `trace` questions from the seeded question bank. Only server-side sandbox results are scored; any result in a request body is ignored. A missing or unpublished question is `404 Question not found`.

| Method and path | Body or query | Response | Errors |
|---|---|---|---|
| GET `/practice/questions` | query `topic`, `difficulty`, `type`, `unseen=1` (hide solved) | `{ success, questions: [{ id, title, type, topic, difficulty, languages, estimatedMinutes, isSeed }] }` | |
| GET `/practice/questions/:id` | none | `{ success, question: { id, title, statement, type, topic, difficulty, languages, starterCode, timeLimitMs, memoryLimitKb, estimatedMinutes, learningOutcome, options?, multi?, visibleTests, hiddenTestCount } }`. Hidden tests are never sent. | 404 |
| POST `/practice/questions/:id/run` | `language`, `source`, `stdin?` | With `stdin`: `{ success, mode: "custom", verdict, stdout, stderr, compileOutput, timeMs, memoryKb }`. Without: runs the visible tests, `{ success, mode: "visible_tests", verdict, tests }`. Not scored. Limit 20 a minute. | 400 not a coding question, unsupported or disallowed language, no source, bad stdin; 409 no visible tests; 413 too large; 429; 503 `verdict: "unavailable"` with `reason` (no runner; nothing scored) |
| POST `/practice/questions/:id/browser-run` | `language`, `source` | 201 `{ success, recorded: true, verified: false }`. Records that the student ran code in their own browser; never scored. Limit 60 a minute. | 400, 413, 429 |
| POST `/practice/questions/:id/submit` | coding: `language`, `source`. `mcq`: `selected` (list of option indexes). `trace`: `answer`. | MCQ and trace: `{ success, attemptId, verdict, score, explanation }`. Coding: `{ success, attemptId, verdict, score, passed, total, notRun, message?, tests }`. Visible tests run first; hidden tests run only if all visible tests pass, otherwise they count as not passed. Limit 20 a minute. | 400 bad answer, language or type; 409 no tests; 413; 429; 503 unavailable |
| POST `/practice/questions/:id/attempts` | none | `{ success, draft: { attemptId, questionId, language, source, updatedAt } }` (returns the existing draft if there is one) | 404 |
| GET `/practice/questions/:id/draft` | none | `{ success, draft }` (null when none) | 404 |
| PUT `/practice/attempts/:id/autosave` | `language`, `source` (up to 64 KB) | `{ success, draft }` | 400 bad source or language; 404 |

## Dashboard (`/api/dashboard`, lecturer and university admin)

An admin sees the whole university. A lecturer sees only the students in the groups assigned to them (see `assigned-groups` above); with none assigned, lists are empty and `noGroupsAssigned` is true. A student outside the caller's scope is `404 Student not found`. Viewing a student, an interview or the CSV is written to the audit log. Only active students are counted. Query `group` narrows to one group: `400 INVALID_GROUP` if malformed, `403 GROUP_NOT_ASSIGNED` for a lecturer asking for a group that is not theirs.

Attention flags (`code`, label): `no_cv` "No CV yet", `no_interview` "No interview yet", `inactive_14_days` "Inactive 14+ days", `score_drop_15` "Score dropped 15+ points" (the latest interview scored 15 or more points under the one before).

Student row: `{ id, name, email, group, targetRoleTitle, cvScore, lastInterviewScore, lastLevelReached, trend (last three scores), practiceSolved, lastActive, attention: [{ code, label }] }`. `cvScore` is the latest target-role CV result with an AI score. Answers scored by the basic fallback are left out of every average.

| Method and path | Query | Response | Errors |
|---|---|---|---|
| GET `/dashboard/overview` | `group?` | `{ success, noGroupsAssigned, group, groups, generatedAt, students, activeLast14Days, needingAttention, avgCvScore, studentsWithCvScore, avgInterviewScore, studentsWithInterviewScore, levelReachedCounts: { easy, medium, hard }, topMissingSkills (null below 5 students with a CV score), minimumForSkills, practiceSolved, seats? }`. `seats { used, limit, invited }` is for admins only. | 400, 403 |
| GET `/dashboard/students` | `group`, `search` (name or email), `needsAttention=1`, `attention=<code>`, `sort` (`name`, `group`, `targetRoleTitle`, `cvScore`, `lastInterviewScore`, `practiceSolved`, `lastActive`; prefix `-` for descending), `page`, `pageSize` (1-100, default 25) | `{ success, noGroupsAssigned, students: [row], page, pageSize, total, totalPages, sort, group }` | 400 bad sort or attention code, 403 |
| GET `/dashboard/students.csv` | the same filters as above | CSV download `students.csv` with columns `id, name, email, group, target_role, cv_score, last_interview_score, last_level_reached, trend, practice_solved, last_active, attention` | 400, 403 |
| GET `/dashboard/students/:id` | none | `{ success, student: { id, name, email, group }, summary: row, interviews: [{ id, status, date, jobExcerpt, score, categoryScores, readinessLevel, levelReached, answered, skipped, excludedFallbackAnswers }], cvAnalyses: [{ id, date, firstAnalysedAt, bestMatch, results: [{ kind, jobTitle, matchPercentage, countsTowardAverage, scoreBreakdown, strengths, weaknesses, ... }] }], practice, delivery }` | 404 |
| GET `/dashboard/students/:id/interviews/:interviewId` | none | `{ success, student, interview: { id, status, dates, jobDescription, score, categoryScores, readinessLevel, levelReached, excludedFallbackAnswers, summary, delivery, questions: [{ questionId, type, category, difficulty, level, question, answered, skipped, answer, feedback, feedbackSource, executionResults, deliveryMetrics }] } }`. No CV text, hidden tests or question pool. | 404 |

## Other

- Any path outside `/api` serves the built web app (`client/dist`).
- Express body limit is 2 MB (JSON and CSV text); file uploads have their own limits above.
