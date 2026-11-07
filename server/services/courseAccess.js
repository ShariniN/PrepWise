// Which courses may this staff member see? Admins: every course in their university. Lecturers: courses they own
// or are assigned to. Anything else is reported as "not found" by callers so other courses cannot be probed.
import courseRepo from '../repositories/courseRepo.js';
import { institutionOf } from '../middleware/tenancy.js';

export const isId = (v) => /^[a-f\d]{24}$/i.test(String(v));

export const loadStaffCourse = async (req, courseId) => {
  if (!isId(courseId)) return null;
  const institutionId = institutionOf(req);
  const course = await courseRepo.findCourse(institutionId, courseId);
  if (!course) return null;
  if (req.user.role === 'university_admin') return course;
  if (String(course.ownerId) === String(req.user.id)) return course;
  const assigned = await courseRepo.findEnrollments(institutionId, 'lecturer', { courseId: course._id, userId: req.user.id });
  return assigned.length ? course : null;
};

// null = every course in the university (admin); otherwise the list of course ids the lecturer may see.
export const staffCourseIds = async (req) => {
  const institutionId = institutionOf(req);
  if (req.user.role === 'university_admin') return null;
  const owned = await courseRepo.listCoursesOwnedBy(institutionId, req.user.id);
  const assigned = await courseRepo.findEnrollments(institutionId, 'lecturer', { userId: req.user.id });
  return [...new Set([...owned.map((c) => String(c._id)), ...assigned.map((e) => String(e.courseId))])];
};

export const canSeeCourse = (courseIds, courseId) => courseIds === null || courseIds.includes(String(courseId));
