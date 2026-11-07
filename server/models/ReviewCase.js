import mongoose from 'mongoose';

const { Schema } = mongoose;

export const CASE_STATUSES = ['open', 'dismissed', 'escalated', 'resolved'];
export const CASE_OUTCOMES = ['no_action', 'technical_issue', 'informal_warning', 'referred_formal', 'inconclusive'];

const reasonSchema = new Schema({
  code: { type: String, required: true },
  kind: { type: String, enum: ['behaviour', 'hint', 'similarity', 'technical'], default: 'behaviour' },
  text: { type: String, required: true },
  measured: { type: Schema.Types.Mixed, default: {} },
  threshold: { type: Schema.Types.Mixed, default: {} },
  evidence: { type: [Schema.Types.Mixed], default: [] },
}, { _id: false });

// A human review of a session that tripped one or more reasons. There is deliberately no score, penalty or mark
// adjustment anywhere on this model: a person decides, and the outcome is a record, not a grade change.
const reviewCaseSchema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true, index: true },
  courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
  sessionId: { type: Schema.Types.ObjectId, ref: 'AssessmentSession', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: CASE_STATUSES, default: 'open' },
  reasons: { type: [reasonSchema], default: [] },
  technical: { type: Schema.Types.Mixed, default: {} },   // offline/reconnect summary, shown separately
  reviewerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  outcome: { type: String, enum: [...CASE_OUTCOMES, null], default: null },
  notes: { type: String, maxlength: 4000, default: '' },
  studentResponse: { type: new Schema({ text: String, at: Date }, { _id: false }), default: null },
  history: { type: [new Schema({ at: Date, by: String, action: String, from: String, to: String }, { _id: false })], default: [] },
}, { timestamps: true, collection: 'reviewcases' });

reviewCaseSchema.index({ institutionId: 1, sessionId: 1 }, { unique: true });

export default mongoose.models.ReviewCase || mongoose.model('ReviewCase', reviewCaseSchema);
