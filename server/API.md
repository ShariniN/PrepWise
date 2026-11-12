# PrepWise API reference

Taken from `server/app.js` and every `server/modules/*/*.routes.js`. All paths start with `/api`.

**Conventions**
- Auth is a `token` HTTP-only cookie set by login, accept-invite and verify-email. "Any user" means any signed-in user with a known role.
- Roles: `student`, `lecturer`, `university_admin`. Role, institution and status are read from the database on every request.
- Failures are `{ success: false, message, code? }`. Common to every signed-in route: `401` not signed in or account not active, `403 ROLE_NOT_SUPPORTED` for a removed role, `403` wrong role ("You do not have permission to do this").
- Every query is scoped to the caller's institution.
- An unknown `/api/...` path answers `404 { success: false, message: "Not found" }`.
- Outside production, mail is not sent: sign-up and invitations return the link in the response (`devVerificationLink`, `inviteLink`).

## Auth (`/api/auth`)

| Method and path | Who | Body | Response | Errors |
|---|---|---|---|---|
| POST `/auth/signup` | public, rate limited | `name`, `email`, `password` | `{ success, message, devVerificationLink? }`. Same answer for an existing email. | 400 `INVALID_EMAIL`, `INVALID_NAME`, `WEAK_PASSWORD`, `SIGNUP_DOMAIN_NOT_ALLOWED`; 409 `SEAT_LIMIT_REACHED`; 429 |
| POST `/auth/verify-email` | public | `token` (64 hex) | session body (below) and sets the cookie; the student takes a seat now | 400 `VERIFY_INVALID`, `VERIFY_EXPIRED`; 409 `SEAT_LIMIT_REACHED`; 503 `TRY_AGAIN` |
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

