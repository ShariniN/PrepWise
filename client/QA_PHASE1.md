# Phase 1 client: manual QA checklist

Nothing here has been run against a live API. Use the demo seed (`npm run seed:demo` in server/) with fake data only.

## Auth and routing
- [ ] `/login` has no Sign Up link; it says "Your university invites you by email."
- [ ] `/register` no longer exists (falls through to login).
- [ ] `/accept-invite` without `?token=` shows the "missing token" message.
- [ ] `/accept-invite?token=bad` -> submit -> shows INVITE_INVALID message and a link to login.
- [ ] Expired token shows the INVITE_EXPIRED message.
- [ ] Password checklist ticks live; weak password and mismatched confirm are rejected client-side; phone must be 10 digits.
- [ ] Valid invite logs the user in and lands on: student `/fresher-dashboard`, lecturer or career officer `/staff`, admin `/manage-people`.
- [ ] Login lands on the same homes by role. A deactivated or invited account shows the server's 403 message.
- [ ] Signed out: visiting `/staff`, `/manage-people`, `/fresher-dashboard`, `/profile-settings` redirects to `/login`.
- [ ] Student visiting `/staff` or `/manage-people` goes to `/fresher-dashboard`; staff visiting `/interview`, `/cv-analyzer`, `/swot` goes to `/staff`; admin visiting a student page goes to `/manage-people`.
- [ ] Page refresh keeps the session and role (no flash redirect to login while loading).
- [ ] NavBar: students see Dashboard/CV analyzer/Skills/Interview; staff see only "My courses"; admin sees "Manage people". Logout clears state.

## Manage people (admin)
- [ ] Usage header shows used of limit, progress bar; amber banner at 90% or more; red banner at the limit.
- [ ] Table loads; search (debounced), role and status filters work; empty and error states show.
- [ ] Invite: valid email sends; a 409 STUDENT_LIMIT_REACHED shows a clear message; EMAIL_IN_USE and DOMAIN_NOT_ALLOWED show the server message.
- [ ] In non-production a "Copy invite link" button appears after invite, resend and reactivate; absent in production.
- [ ] Deactivate, reactivate, resend invite, change role each open a confirm dialog (Esc cancels). Deactivating yourself or the last admin shows the server error.
- [ ] CSV: choose a file or paste text; result table shows invited, skipped, blocked limit and error rows with line numbers; limit banner appears; template download works.
- [ ] A CSV with more than 2000 rows shows the 413 message.

## Courses (admin tab and /staff)
- [ ] Create course (duplicate code shows 409 message), add cohort, expand cohort, paste emails and enrol; per-email results and roster appear; counts update.
- [ ] Admin can assign a lecturer by email. Career officers see an empty state and no forms.

## Privacy and data (Profile settings, any role)
- [ ] "Privacy & data" tab: subprocessors list loads (works even if logged out of the API call).
- [ ] "Show my consent records" lists consents; "Download my data" saves a JSON file.
- [ ] Delete account: wrong password shows the error; last-admin shows 409 message; success logs out and returns to login.

## Misc
- [ ] Demo banner shows by default and disappears with `VITE_DEMO_BANNER=false`.
- [ ] Layouts usable at phone width (tables scroll horizontally inside their card).
