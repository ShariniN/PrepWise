import courseRepo from '../repositories/courseRepo.js';
import { institutionOf } from '../middleware/tenancy.js';
import { audit } from '../services/audit.js';

const isId = (v) => /^[a-f\d]{24}$/i.test(String(v));
const MAX_EMAILS = 500;
const uniq = (arr) => [...new Set(arr.map(String))];

const fail = (res, status, message) => res.status(status).json({ success: false, message });

// Loads a course inside the caller's institution. Lecturers only see courses they own or are assigned to;
// anything else is reported as "not found" so other courses cannot be probed.
const loadCourse = async (req, courseId) => {
  if (!isId(courseId)) return null;
  const institutionId = institutionOf(req);
  const course = await courseRepo.findCourse(institutionId, courseId);
  if (!course) return null;
  if (req.user.role === 'university_admin') return course;
  if (String(course.ownerId) === String(req.user.id)) return course;
  const assigned = await courseRepo.findEnrollments(institutionId, 'lecturer', { courseId: course._id, userId: req.user.id });
  return assigned.length ? course : null;
};

const shapeCourses = async (institutionId, courses, { withCounts, onlyCohortIds }) => {
  if (!courses.length) return [];
  const courseIds = courses.map((c) => c._id);
  let cohorts = await courseRepo.listCohorts(institutionId, courseIds);
  if (onlyCohortIds) cohorts = cohorts.filter((h) => onlyCohortIds.has(String(h._id)));
  const counts = {};
  if (withCounts) {
    const enrolments = await courseRepo.findEnrollments(institutionId, 'student', { courseId: { $in: courseIds } });
    for (const e of enrolments) counts[String(e.cohortId)] = (counts[String(e.cohortId)] || 0) + 1;
  }
  return courses.map((c) => {
    const shaped = cohorts
      .filter((h) => String(h.courseId) === String(c._id))
      .map((h) => ({
        id: String(h._id), name: h.name, startsAt: h.startsAt || null, endsAt: h.endsAt || null,
        ...(withCounts ? { studentCount: counts[String(h._id)] || 0 } : {}),
      }));
    return {
      id: String(c._id), code: c.code, title: c.title, description: c.description || '', ownerId: String(c.ownerId),
      cohorts: shaped,
      ...(withCounts ? { studentCount: shaped.reduce((n, h) => n + h.studentCount, 0) } : {}),
    };
  });
};

export const createCourse = async (req, res) => {
  const institutionId = institutionOf(req);
  const { code, title, description } = req.body || {};
  if (!code?.trim() || !title?.trim()) return fail(res, 400, 'Course code and title are required');
  try {
    const course = await courseRepo.createCourse({
      institutionId, code: code.trim(), title: title.trim(), description: (description || '').trim(), ownerId: req.user.id,
    });
    await audit({ actor: req.user.id, action: 'course.create', target: course._id, institutionId });
    const [shaped] = await shapeCourses(institutionId, [course], { withCounts: true });
    res.status(201).json({ success: true, course: shaped });
  } catch (error) {
    if (error.code === 11000) return fail(res, 409, 'A course with this code already exists');
    throw error;
  }
};

export const myCourses = async (req, res) => {
  const institutionId = institutionOf(req);
  const { role, id } = req.user;
  let courses;
  let options = { withCounts: true };

  if (role === 'university_admin' || role === 'career_officer') {
    courses = await courseRepo.listCourses(institutionId);
  } else if (role === 'lecturer') {
    const owned = await courseRepo.listCoursesOwnedBy(institutionId, id);
    const assigned = await courseRepo.findEnrollments(institutionId, 'lecturer', { userId: id });
    const extraIds = uniq(assigned.map((a) => a.courseId)).filter((cid) => !owned.some((c) => String(c._id) === cid));
    const extra = extraIds.length ? await courseRepo.listCourses(institutionId, extraIds) : [];
    courses = [...owned, ...extra];
  } else {
    const mine = await courseRepo.findEnrollments(institutionId, 'student', { userId: id });
    const courseIds = uniq(mine.map((e) => e.courseId));
    courses = courseIds.length ? await courseRepo.listCourses(institutionId, courseIds) : [];
    options = { withCounts: false, onlyCohortIds: new Set(mine.map((e) => String(e.cohortId))) };
  }
  res.json({ success: true, courses: await shapeCourses(institutionId, courses, options) });
};

export const getCourse = async (req, res) => {
  const course = await loadCourse(req, req.params.courseId);
  if (!course) return fail(res, 404, 'Course not found');
  const [shaped] = await shapeCourses(institutionOf(req), [course], { withCounts: true });
  res.json({ success: true, course: shaped });
};

export const createCohort = async (req, res) => {
  const course = await loadCourse(req, req.params.courseId);
  if (!course) return fail(res, 404, 'Course not found');
  const institutionId = institutionOf(req);
  const { name, startsAt, endsAt } = req.body || {};
  if (!name?.trim()) return fail(res, 400, 'Cohort name is required');
  try {
    const cohort = await courseRepo.createCohort({
      institutionId, courseId: course._id, name: name.trim(), startsAt: startsAt || null, endsAt: endsAt || null,
    });
    await audit({ actor: req.user.id, action: 'cohort.create', target: cohort._id, institutionId });
    res.status(201).json({
      success: true,
      cohort: { id: String(cohort._id), courseId: String(course._id), name: cohort.name, startsAt: cohort.startsAt || null, endsAt: cohort.endsAt || null, studentCount: 0 },
    });
  } catch (error) {
    if (error.code === 11000) return fail(res, 409, 'A cohort with this name already exists in the course');
    throw error;
  }
};

const loadCohort = async (req) => {
  const course = await loadCourse(req, req.params.courseId);
  if (!course || !isId(req.params.cohortId)) return {};
  const cohort = await courseRepo.findCohort(institutionOf(req), course._id, req.params.cohortId);
  return cohort ? { course, cohort } : {};
};

export const enrolStudents = async (req, res) => {
  const { course, cohort } = await loadCohort(req);
  if (!cohort) return fail(res, 404, 'Cohort not found');
  const institutionId = institutionOf(req);

  const emails = uniq((Array.isArray(req.body?.emails) ? req.body.emails : []).map((e) => String(e).trim().toLowerCase()).filter(Boolean));
  if (!emails.length) return fail(res, 400, 'Send {"emails": ["student@university.edu", ...]}');
  if (emails.length > MAX_EMAILS) return fail(res, 413, `At most ${MAX_EMAILS} emails per request`);

  // The lookup is scoped to the institution, so an email from another university is simply "not_found".
  const users = await courseRepo.findUsersByEmails(institutionId, emails);
  const byEmail = new Map(users.map((u) => [u.email, u]));
  const results = [];
  for (const email of emails) {
    const u = byEmail.get(email);
    if (!u) { results.push({ email, status: 'not_found' }); continue; }
    if (u.role !== 'student') { results.push({ email, status: 'not_a_student' }); continue; }
    if (u.status === 'deactivated') { results.push({ email, status: 'deactivated' }); continue; }
    const { created } = await courseRepo.addEnrollment(institutionId, {
      kind: 'student', userId: u._id, courseId: course._id, cohortId: cohort._id,
    });
    results.push({ email, status: created ? 'enrolled' : 'already_enrolled' });
  }
  const enrolled = results.filter((r) => r.status === 'enrolled').length;
  await audit({ actor: req.user.id, action: 'cohort.enrol', target: cohort._id, institutionId, meta: { requested: emails.length, enrolled } });
  res.json({ success: true, enrolled, results });
};

export const cohortStudents = async (req, res) => {
  const { cohort } = await loadCohort(req);
  if (!cohort) return fail(res, 404, 'Cohort not found');
  const institutionId = institutionOf(req);
  const enrolments = await courseRepo.findEnrollments(institutionId, 'student', { cohortId: cohort._id });
  const users = enrolments.length ? await courseRepo.findUsersByIds(institutionId, enrolments.map((e) => e.userId)) : [];
  res.json({
    success: true,
    students: users.map((u) => ({ id: String(u._id), name: u.name, email: u.email, status: u.status })),
  });
};

// Administrator only (enforced in the router): give a lecturer access to a course they do not own.
export const assignLecturer = async (req, res) => {
  const course = await loadCourse(req, req.params.courseId);
  if (!course) return fail(res, 404, 'Course not found');
  const institutionId = institutionOf(req);
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) return fail(res, 400, 'Lecturer email is required');
  const [user] = await courseRepo.findUsersByEmails(institutionId, [email]);
  if (!user || user.role !== 'lecturer' || user.status === 'deactivated') return fail(res, 404, 'No active lecturer with this email in your institution');
  const { created } = await courseRepo.addEnrollment(institutionId, { kind: 'lecturer', userId: user._id, courseId: course._id });
  await audit({ actor: req.user.id, action: 'course.assign_lecturer', target: course._id, institutionId, meta: { lecturerId: String(user._id) } });
  res.json({ success: true, assigned: created });
};
