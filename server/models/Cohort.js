import mongoose from 'mongoose';

const cohortSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null }
}, { timestamps: true, collection: 'cohorts' });

cohortSchema.index({ courseId: 1, name: 1 }, { unique: true });

export default mongoose.models.Cohort || mongoose.model('Cohort', cohortSchema);
