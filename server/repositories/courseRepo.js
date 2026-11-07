import Course from '../models/Course.js';
import Cohort from '../models/Cohort.js';
import Enrollment from '../models/Enrollment.js';
import userModel from '../models/userModel.js';

// Every function takes institutionId first and filters by it.
const courseRepo = {
  createCourse: (data) => Course.create(data),
  findCourse: (institutionId, courseId) => Course.findOne({ _id: courseId, institutionId }).lean(),
  listCourses: (institutionId, ids) =>
    Course.find(ids ? { institutionId, _id: { $in: ids } } : { institutionId }).sort({ code: 1 }).lean(),
  listCoursesOwnedBy: (institutionId, ownerId) => Course.find({ institutionId, ownerId }).sort({ code: 1 }).lean(),

  createCohort: (data) => Cohort.create(data),
  findCohort: (institutionId, courseId, cohortId) => Cohort.findOne({ _id: cohortId, courseId, institutionId }).lean(),
  listCohorts: (institutionId, courseIds) => Cohort.find({ institutionId, courseId: { $in: courseIds } }).sort({ name: 1 }).lean(),

  // Returns { created } so enrolling the same student twice is harmless.
  addEnrollment: async (institutionId, doc) => {
    const filter = doc.kind === 'student'
      ? { institutionId, kind: 'student', cohortId: doc.cohortId, userId: doc.userId }
      : { institutionId, kind: 'lecturer', courseId: doc.courseId, userId: doc.userId };
    const r = await Enrollment.updateOne(filter, { $setOnInsert: { ...doc, institutionId } }, { upsert: true });
    return { created: r.upsertedCount === 1 };
  },
  // kind: 'student' | 'lecturer'. Optional extra filter such as { userId, courseId, cohortId }.
  findEnrollments: (institutionId, kind, extra = {}) => Enrollment.find({ institutionId, kind, ...extra }).lean(),

  findUsersByEmails: (institutionId, emails) =>
    userModel.find({ institutionId, email: { $in: emails } }).select('name email role status').lean(),
  findUsersByIds: (institutionId, ids) =>
    userModel.find({ institutionId, _id: { $in: ids } }).select('name email role status').lean(),
};

export default courseRepo;
