import mongoose from 'mongoose';

const { Schema } = mongoose;

const extensionSchema = new Schema({
  byUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  minutes: { type: Number, required: true },
  reason: { type: String, maxlength: 300 },
  at: { type: Date, default: Date.now },
}, { _id: false });

// One student's sitting of an assessment. The deadline is decided by the server when the session starts.
const sessionSchema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true, index: true },
  courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  attemptNo: { type: Number, default: 1 },
  serverStartedAt: { type: Date, required: true },
  baseDeadline: { type: Date, required: true },   // min(start + duration * (1 + accommodation), closesAt)
  extensionMs: { type: Number, default: 0 },      // added by lecturers
  extensions: { type: [extensionSchema], default: [] },
  closesAt: { type: Date, required: true },        // copy of the assessment close time (used to lock practice access)
  extraTimePercent: { type: Number, default: 0 },
  disabledSignals: { type: [String], default: [] },
  integrityLevel: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'submitted'], default: 'active' },
  submittedAt: { type: Date, default: null },
  // Frozen at start: the questions this student sees, in this student's order (variants already resolved).
  questions: { type: [{ _id: false, slot: Number, questionId: Schema.Types.ObjectId, baseQuestionId: Schema.Types.ObjectId }], default: [] },
}, { timestamps: true, collection: 'assessmentsessions' });

sessionSchema.index({ institutionId: 1, assessmentId: 1, userId: 1 });

export default mongoose.models.AssessmentSession || mongoose.model('AssessmentSession', sessionSchema);
