# Phase 3A manual QA checklist

Nothing in Phase 3A was exercised against a live API or browser when it was written. Walk through this list before release.
Use one lecturer, one university admin, two students in the same cohort, and an assessment with a coding, an MCQ and a short question.

## Lecturer: set up (/assessments/manage)
- [ ] New assessment: question picker lists published questions only; add, reorder (Up/Down) and remove work; variant-group chip shows (the list API may not return `variantGroup`; confirm).
- [ ] Integrity level offers 0 and 1 only. Create saves a draft; the page then shows Accommodations and the effective limits.
- [ ] Accommodation: add a student, set extra time 50%, switch off `fullscreen_exit`, Save; reload and confirm it persisted. Remove works.
- [ ] Status buttons follow draft -> scheduled/open -> closed. Open and Close ask for confirmation. A bad move shows the server message.
- [ ] After a student has started, editing structure fields is refused with a clear message; title/instructions/release still save.

## Student: before starting (/assessments, /assessments/:id)
- [ ] List groups Open now / Upcoming / Closed with windows; an active attempt shows "In progress".
- [ ] Level 1 start page lists what is recorded and what is NOT (no camera, microphone, screen recording). Start stays disabled until the box is ticked. Level 0 shows no checkbox.
- [ ] The start request is accepted with the extra body fields `integrityAcknowledged` and `acknowledgedAt` (no consent endpoint exists in the API; if the server rejects unknown fields, remove them in `AssessmentIntro.jsx`).
- [ ] Resume attempt reopens the same session with the timer still running.

## Student: exam view (/assessments/session/:id)
- [ ] Timer matches the server deadline (compare with the sessions table on the lecturer side), not the PC clock: change the PC clock by 10 minutes and reload; timer must not move.
- [ ] Warning banners appear at 10, 5 and 1 minutes and can be dismissed.
- [ ] Coding question: Run shows only output (no verdict, no tests); Submit shows "Answer saved" and no score, verdict, test list or explanation. MCQ and short answers autosave (as submissions) and also submit manually.
- [ ] Switch tab for 20 s: on return a calm banner says it was recorded and nothing else happens. The page is never blocked.
- [ ] Paste a large block, copy, cut, right-click inside the editor: events recorded (see the case timeline later).
- [ ] Go offline (DevTools): reassuring offline banner appears, edits still work, the draft shows "Not saved yet, will retry" and is saved after reconnect; connection events show as technical on the case.
- [ ] Reload mid-attempt: draft code is restored (the newer of server draft or local backup).
- [ ] Let time run out: "Time is up, your saved answers were submitted" appears; further saves are not attempted. A lecturer extension (see below) is picked up within about a minute.
- [ ] Finish asks for confirmation and lists questions with no submitted answer. After finishing, no results unless released.
- [ ] Practice mode for the same questions is blocked while the attempt is unfinished (API `ASSESSMENT_IN_PROGRESS`).
- [ ] Release results on the assessment: the results page lists verdict and score per question; before release it says results are not released.

## Lecturer: live session
- [ ] Sessions panel lists students, deadlines, accommodations and extensions. Extend time needs minutes (1-480) and a reason (3+ characters) and updates the deadline.

## Staff: review queue (/integrity)
- [ ] Cases list filters by status and assessment; rows show the student, assessment and reasons as neutral chips; no score, no word "cheating" anywhere.
- [ ] Case page: reasons in the server's words with expandable evidence; technical notes shown separately and not as a reason.
- [ ] Timeline: lanes for session, page/clipboard, editing, run/submit; hover/focus shows detail; table view lists all items; deadline dashed.
- [ ] Notes save. Status moves offered match the allowed transitions; Resolve requires an outcome; reopen clears it. Escalate explains what the student will see.
- [ ] Run similarity: confirmation, then pairs that include this student with matching line ranges for both sides and the limits note.
- [ ] Replay: scrubber, play/pause, 1x-8x, back/next; quiet stretches skipped during playback; paste/blur markers; "approximate" / mismatch / truncated banners when the API reports them.

## Student: escalations (/my-cases)
- [ ] The nav link appears only when a case is escalated. The page shows reasons in plain text, no evidence, no notes, no other students.
- [ ] Sending and updating a response works (max 4000 characters). After resolve/dismiss the case disappears.

## Accessibility and misc
- [ ] Keyboard: question navigator, timeline marks (focusable), replay slider and buttons.
- [ ] Narrow screen: exam view, case page and tables scroll without breaking layout.
- [ ] Known gaps: dark mode for the charts is not provided (the app is light only); flag thresholds are shown but not editable in the UI; no multiple-attempt chooser on the results page.
