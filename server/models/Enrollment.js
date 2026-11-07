import mongoose from 'mongoose';

// kind 'student': links a student to a cohort (courseId is kept for easy lookup).
// kind 'lecturer': links a lecturer to a course (cohortId is empty).
const enrollmentSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  kind: { type: String, enum: ['student', 'lecturer'], required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  cohortId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cohort', default: null, index: true }
}, { timestamps: true, collection: 'enrollments' });

enrollmentSchema.index(
  { cohortId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { kind: 'student' }, name: 'student_cohort_unique' }
);
enrollmentSchema.index(
  { courseId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { kind: 'lecturer' }, name: 'lecturer_course_unique' }
);

export default mongoose.models.Enrollment || mongoose.model('Enrollment', enrollmentSchema);
