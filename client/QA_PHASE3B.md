# Phase 3B manual QA checklist

Nothing here has been run against a live API or browser yet. Run with the Phase 3B server and seeded data
(a course with 5+ and with fewer than 5 students, a coding question with hidden tests, a short answer with a rubric).

## Roles and routes
- [ ] Student visiting /staff, /grading, /careers, /admin-overview is redirected to their dashboard.
- [ ] Lecturer: nav shows Dashboard, Grading, Questions. /careers and /admin-overview redirect to /staff.
- [ ] Career officer: nav shows My courses, Career readiness. /grading redirects.
- [ ] University admin: nav shows Manage people, Overview, Grading, Careers, Questions. Manage people page links to the overview.

## Lecturer dashboard (/staff)
- [ ] Course picker lists courses from /api/courses/mine; cohort list follows the course; "All cohorts" works.
- [ ] What to re-teach: failing percent bar, verdict counts, failing tests table; hidden tests are marked "Hidden (staff only)".
- [ ] A question with fewer than 5 students shows the insufficient-data notice and no percentage.
- [ ] "N items not counted" matches the API `excluded` value on each tab.
- [ ] Topic heatmap: cells, dashes for no data, "Show as table" toggle gives the same numbers; dark mode readable.
- [ ] Who to contact: reasons shown as chips, no score or ranking, thresholds apply and Reset restores defaults.
- [ ] Question quality: flags have text and icon; "Suggest edit" opens /questions/:id; over-exposure threshold changes the flag.
- [ ] Activity: period selector, both charts, table toggle.
- [ ] Courses tab still creates courses and cohorts.
- [ ] Course the lecturer does not own (edit the query by hand) shows an error, not data.

## Grading queue (/grading)
- [ ] Queue lists pending items oldest first; Reviewed filter shows score and "human".
- [ ] Detail shows question, rubric and answer. Item without rubric shows the no-rubric message and no grade form.
- [ ] "Get AI suggestion" shows reasons under the label "AI suggestion - not a grade"; asking again replaces it.
- [ ] 429 AI_MONTHLY_CAP shows the server message plus "Manual grading is still available"; manual form still works.
- [ ] 502 shows the same manual-grading hint.
- [ ] Manual grade: out-of-range points are rejected client side; confirming saves, item moves to Reviewed.
- [ ] Confirm AI suggestion as-is, and "Copy into inputs" then edit, both work. Second confirm shows the 409 message.
- [ ] Bulk: only items with a suggestion are tickable; there is no select-all; the dialog lists the selected items;
      the result list shows confirmed and skipped reasons.

## Career officer (/careers)
- [ ] Filters by programme and cohort; institution coverage cards show; cohort bars and student table work.
- [ ] Fallback interviews excluded count is shown.
- [ ] Skills gap threshold slider; fewer than 5 assessed students shows insufficient data.
- [ ] CSV download starts, file opens, a formula-looking cell is prefixed with an apostrophe, an audit entry `analytics.export.readiness` exists.

## Admin overview (/admin-overview)
- [ ] Adoption cards and limit bar; limit not set shows "not set" and no bar.
- [ ] Improvement per cohort; cohort under 5 shows insufficient data.
- [ ] AI usage bar; note appears at 80% or more.
- [ ] Evidence download without students works with no dialog; ticking "Include students" shows the confirm dialog first,
      and an `analytics.export.evidence_students` audit entry is written after confirming. Cancel writes nothing.

## Accessibility
- [ ] Tabs, dialogs and toggles reachable by keyboard; Escape closes the dialog.
- [ ] Every chart has a text label and a table view.
