# PrepWise server API: Phase 1 (university foundation)

All endpoints are JSON, authenticated with the existing `token` httpOnly cookie (send `credentials: 'include'`).
Unless noted, errors look like `{ "success": false, "message": "...", "code": "OPTIONAL_CODE" }`.
Unauthenticated: `401`. Wrong role: `403`. Something in another institution: `404` (never `403`, so ids cannot be probed).

Roles: `student`, `lecturer`, `university_admin`. The `career_officer` role was removed: an account that still carries it (or any other unknown role) cannot log in (`403 ROLE_NOT_SUPPORTED`, no cookie) and an existing token gets `403 ROLE_NOT_SUPPORTED` on every route. An admin can change its role or deactivate it.
Account status: `invited` (cannot log in), `active`, `deactivated` (cannot log in, tokens stop working immediately).

CORS now allows `PATCH`.

## Compatibility with the current client

- `accountType` is still returned by `POST /api/auth/login` and `GET /api/auth/is-auth` and is `"Fresher"` for students (for other roles it equals the role).
- `userType: "fresher"` is still returned by login and is-auth for everyone.
- New fields on login and is-auth: `role`, `institutionId` (is-auth also `status`).
- Profile endpoints (`/api/user/*`) work for all roles. They still accept only `name` and `phoneNumber` on update.
- `POST /api/auth/register` no longer exists (404). The signup page must be replaced by the accept-invite page.

## Invitation links

Invitation emails and (outside production) API responses contain:
`{CLIENT_URL}/accept-invite?token=<64 hex chars>`
The client route `/accept-invite` reads `token` from the query string and calls `POST /api/auth/accept-invite`.
`inviteLink` is returned in API responses only when `NODE_ENV !== 'production'`; in production only the email carries it.
Tokens are valid 7 days and single use.

---

## Auth

### POST /api/auth/accept-invite  (public)
Body: `{ token, password, name?, phoneNumber? }`
- `password`: at least 6 chars, one uppercase letter, one digit, one special character.
- `phoneNumber`: exactly 10 digits, optional. `name`: 1 to 100 chars, optional (replaces the name the admin typed).

200: `{ success: true, message, role, institutionId, accountType, isAccountVerified: true, needsVerification: false, userType: "fresher" }` and sets the login cookie (the user is logged in). The email counts as verified.
400: `{ success: false, code: "INVITE_INVALID" | "INVITE_EXPIRED", message }`, or a validation message (no code) for password/phone/name.

### POST /api/auth/login  (changed)
Same body. Now also returns `role`, `institutionId`.
`401` wrong credentials or unknown email (also for an invited user who has no password).
`403` correct password but account `deactivated` or `invited`, with a message to show the user.

### GET /api/auth/is-auth  (changed)
`user` now also has `role`, `institutionId`, `status`.

OTP endpoints (`send-verify-otp`, `verify-account`, `send-reset-otp`, `reset-password`) are unchanged, except that reset is refused (`success: false`, "User not found") for deactivated and invited accounts.

---

## Manage people: /api/institution  (role: `university_admin` only; always the caller's own institution)

Person object:
```json
{ "id": "...", "name": "...", "email": "...", "role": "student", "status": "active", "group": "CS 2026",
  "isAccountVerified": true, "lastActive": "ISO|null", "createdAt": "ISO", "inviteExpiresAt": "ISO|null" }
```
Students count toward the contract limit while `invited` or `active`. Lecturers and admins are free.
`group` is an optional free-text label (max 60 characters, `""` when not set), e.g. a class or year. It filters the lecturer dashboard (`/api/lecturer`, see API_LECTURER.md).

### GET /api/institution/people
Query (all optional): `role`, `status`, `group` (exact match), `search` (matches name or email, case-insensitive). Max 1000 rows.
200: `{ success, people: [Person], counts: { total, byRole: {student: n, ...}, byStatus: {active: n, ...} }, usage: Usage }`
`counts` covers the whole institution, not just the filtered list. 400 for an unknown `role` or `status`.

### GET /api/institution/usage
200: `{ success, studentLimit, activeStudents, invitedStudents, remaining }`

### POST /api/institution/people/invite
Body: `{ email, name?, role?, group? }` (`role` defaults to `student`; name defaults to the email prefix; `group` is trimmed, max 60 characters).
201: `{ success, user: Person, emailSent: boolean, warning?: string, inviteLink?: string }`
- `warning` is set when students used reaches 90% of the limit or more after this invite.
- `inviteLink` only outside production.
Errors: `400` invalid email/role/group (`code` `INVALID_EMAIL`, `INVALID_ROLE`, `INVALID_GROUP`) or email domain not allowed (`DOMAIN_NOT_ALLOWED`; enforced for every role when the institution has `allowedEmailDomains`). `409` `STUDENT_LIMIT_REACHED` (message says the limit) or `EMAIL_IN_USE` (email exists anywhere on the platform; the message never says where).

### POST /api/institution/people/import
Body: CSV text with `Content-Type: text/csv` (or `text/plain`), or JSON `{ "csv": "..." }`.
Columns: `email` (required), `name`, `role` (default `student`), `group` (optional, max 60 characters; a longer value makes only that row `error`). Header row required, case-insensitive. UTF-8 BOM, CRLF and quoted fields are fine. Maximum 2000 data rows (more gives `413`, nothing imported).
200:
```json
{ "success": true,
  "results": [ { "line": 2, "email": "a@x.edu", "role": "student",
                 "status": "invited|skipped|blocked_limit|error", "reason": "...", "emailSent": true, "inviteLink": "(non-production only)" } ],
  "summary": { "total": 5, "invited": 3, "skipped": 1, "blocked_limit": 1 },
  "limitReached": true, "warning": "..." }
```
`line` is the CSV line number including the header, so it matches a spreadsheet. Student rows after the limit is reached get `blocked_limit`; staff rows in the same file are still added. `skipped` = email already exists or is repeated in the file. `error` = invalid email, role, group or domain.
`400` empty CSV / missing `email` column (`INVALID_CSV`).

### PATCH /api/institution/people/:id/deactivate
200: `{ success, user: Person }`. `400` own account (`SELF`). `409` already deactivated, or the only active administrator (`LAST_ADMIN`). `404` unknown or other institution.
Also cancels a pending invitation: an `invited` person becomes `deactivated`, the invite link stops working and the student seat is freed
(audit `user.deactivate` with `meta: { inviteCancelled: true }`). Reactivating them later sends a fresh invitation.

### PATCH /api/institution/people/:id/reactivate
200: `{ success, user: Person, inviteLink?, emailSent? }`. Counts against the limit for students: `409 STUDENT_LIMIT_REACHED`. `409 NOT_DEACTIVATED`.
A person who never accepted their invitation returns to `invited` and gets a fresh invitation (`inviteLink` outside production).

### POST /api/institution/people/:id/resend-invite
200: `{ success, user: Person, emailSent, inviteLink? }` (new token, old one stops working). `409 NOT_INVITED` unless the status is `invited`.

### PATCH /api/institution/people/:id/role
Body: `{ role }` (`student`, `lecturer` or `university_admin`). 200: `{ success, user: Person }`. Audited. `400` own role or invalid role; `409` same role, student limit (when turning someone into a student), or last administrator.

### PATCH /api/institution/people/:id/group
Body: `{ group }` (string, max 60 characters after trimming; `""` clears it). 200: `{ success, user: Person }`. Audited (`user.group_change`, meta `{ from, to }`).
`400 INVALID_GROUP` missing, not text or too long. `404` unknown or other institution.

---

## Courses: removed

`/api/courses` (courses, cohorts, enrolment, lecturer assignment) was removed: universities manage courses in their own LMS.
Lecturers now see every student of their university; use the optional person `group` (below) to split them.

---

## Compliance

### GET /api/me/export  (any logged-in role; own data only)
Downloads JSON (`Content-Disposition: attachment`): `{ exportedAt, profile, interviews, analyses, skills, consents }`. No password, OTP or invite fields. Audited (`user.export`).

### DELETE /api/me  (any logged-in role)
Body: `{ password }`. Deletes the account and its interviews, analyses, skills and consents (plus any enrolment rows left from the removed courses feature), clears the cookie, writes audit `user.delete` (ids only).
`400` no password, `403` wrong password, `409` the only active administrator.
200: `{ success, message, deleted: { interviews, analyses, skills, consents } }`

### POST /api/me/consent
Body: `{ type: "terms"|"privacy"|"ai_processing"|"recording", version: "2026-11" }`. 201: `{ success, consent: { type, version, acceptedAt } }`.
There is no endpoint to list consents except inside `/api/me/export`.

### GET /api/compliance/subprocessors  (public, no login)
`{ success, updated, subprocessors: [{ name, purpose, status: "in_use"|"planned", data, note? }] }`
In use today: MongoDB Atlas, Google Gemini API, Google (Gmail SMTP), JDoodle, AssemblyAI. Planned: Judge0, Vercel, Cloudflare.

---

## Other behaviour the client may see

- AI limit: when a university reaches its monthly AI call cap (default 20000, `Institution.monthlyAiCallCap`), the interview answer endpoint still succeeds but its `feedback.source` is `"fallback"` (basic scoring). Other AI endpoints (CV analysis, question generation) catch errors in their own way and may report a generic failure; only an uncaught cap error reaches the global handler as `429 { code: "AI_MONTHLY_CAP" }`.
- `feedback.source` on interview answers is `"ai"` or `"fallback"` (`"tests"` and `"human"` are reserved for later phases). Dashboards must exclude `"fallback"`. Older stored responses have no `source`.
- Interviews, CV analyses and skills assessments now store `institutionId` (set at creation).

## Audit actions written

`user.invite`, `user.invite_resend`, `user.invite_accept`, `user.import`, `user.deactivate`, `user.reactivate`, `user.role_change`, `user.group_change`, `user.export`, `user.delete`, `institution.create` (script). (`course.*` and `cohort.*` are no longer written.) Login failures are not logged.

## Owner scripts (run in `server/`, need `MONGODB_URI` in `.env`)

```
npm run owner:create-institution -- --name "Example University" --limit 200 --domains example.edu --admin-email admin@example.edu --admin-name "Ada Admin"
npm run owner:usage-report            # table;  add -- --csv for CSV
npm run owner:import-users -- --institution example-university --file students.csv
npm run seed:demo                     # two fake universities (University A also gets fake interview/CV activity); refuses when NODE_ENV=production; add -- --reset to replace
node scripts/migrate-default-institution.js   # existing prototype users -> "Default Institution" (run once before deploying this)
```
