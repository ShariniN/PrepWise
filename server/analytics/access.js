// Resolves which courses, cohorts and students a caller may see. Everything starts from the caller's institution.
import courseRepo from '../repositories/courseRepo.js';
import { institutionOf } from '../middleware/tenancy.js';

export const isId = (v) => /^[a-f\d]{24}$/i.test(String(v));
const uniq = (arr) => [...new Set(arr.map(String))];
export const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

export const intParam = (v, def, min, max) => {
  if (v === undefined || v === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
};

// Courses the caller may see: admins and career officers see all in the institution; lecturers only those they own or are assigned to.
export const accessibleCourses = async (req) => {
  const institutionId = institutionOf(req);
  if (req.user.role === 'university_admin' || req.user.role === 'career_officer') return courseRepo.listCourses(institutionId);
  const owned = await courseRepo.listCoursesOwnedBy(institutionId, req.user.id);
  const assigned = await courseRepo.findEnrollments(institutionId, 'lecturer', { userId: req.user.id });
  const extraIds = uniq(assigned.map((a) => a.courseId)).filter((cid) => !owned.some((c) => String(c._id) === cid));
  const extra = extraIds.length ? await courseRepo.listCourses(institutionId, extraIds) : [];
  return [...owned, ...extra];
};

export const loadCourse = async (req, courseId) => {
  if (!isId(courseId)) return null;
  const institutionId = institutionOf(req);
  const course = await courseRepo.findCourse(institutionId, courseId);
  if (!course) return null;
  if (req.user.role === 'university_admin') return course;
  if (String(course.ownerId) === String(req.user.id)) return course;
  const assigned = await courseRepo.findEnrollments(institutionId, 'lecturer', { courseId: course._id, userId: req.user.id });
  return assigned.length ? course : null;
};

// Student user documents enrolled in the given courses (optionally one cohort), plus the enrolment rows.
export const studentsOf = async (institutionId, { courseIds, cohortId = null }) => {
  const enrolments = await courseRepo.findEnrollments(institutionId, 'student', { courseId: { $in: courseIds }, ...(cohortId ? { cohortId } : {}) });
  const ids = uniq(enrolments.map((e) => e.userId));
  if (!ids.length) return { students: [], enrolments };
  const users = await courseRepo.findUsersByIds(institutionId, ids);
  const students = users.filter((u) => u.role === 'student' && u.status !== 'deactivated');
  return { students, enrolments };
};

// Lecturer scope: courseId (required) and optional cohortId. Sends the 4xx itself and returns null on failure.
export const resolveLecturerScope = async (req, res) => {
  const institutionId = institutionOf(req);
  const { courseId, cohortId } = req.query;
  if (!courseId) { fail(res, 400, 'courseId is required'); return null; }
  const course = await loadCourse(req, courseId);
  if (!course) { fail(res, 404, 'Course not found'); return null; }
  let cohort = null;
  if (cohortId) {
    cohort = isId(cohortId) ? await courseRepo.findCohort(institutionId, course._id, cohortId) : null;
    if (!cohort) { fail(res, 404, 'Cohort not found'); return null; }
  }
  const { students } = await studentsOf(institutionId, { courseIds: [course._id], cohortId: cohort?._id });
  return { institutionId, course, cohort, students };
};
