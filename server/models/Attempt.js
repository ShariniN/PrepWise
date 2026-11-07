import mongoose from 'mongoose';

// What is stored per test. For hidden tests only pass/fail and the verdict are kept: never input or expected output.
const perTestSchema = new mongoose.Schema({
  testId: { type: String },
  visible: { type: Boolean },
  passed: { type: Boolean },
  timeMs: { type: Number, default: null },
  verdict: { type: String },
}, { _id: false });

const attemptSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  questionVersion: { type: Number, default: 1 },
  // draft = the autosaved working copy (one per student per question); run and submit are executions
  runKind: { type: String, enum: ['draft', 'run', 'submit'], required: true },
  language: { type: String, maxlength: 20 },
  source: { type: String, maxlength: 65536, default: '' },
  verdict: { type: String },
  perTest: { type: [perTestSchema], default: [] },
  score: { type: Number, min: 0, max: 100, default: null },
  answer: { type: mongoose.Schema.Types.Mixed, default: null }, // mcq selection, trace answer, or short text
  needsReview: { type: Boolean, default: false },               // short and behavioural answers wait for a lecturer
}, { timestamps: true, collection: 'attempts' });

attemptSchema.index({ institutionId: 1, userId: 1, questionId: 1, runKind: 1 });

export default mongoose.models.Attempt || mongoose.model('Attempt', attemptSchema);
