import mongoose from 'mongoose';

const { Schema } = mongoose;

export const ASSESSMENT_STATUSES = ['draft', 'scheduled', 'open', 'closed'];
// Signals the browser can report. Accommodations can disable any of them for one student.
export const INTEGRITY_SIGNALS = [
  'tab_hidden', 'tab_visible', 'window_blur', 'window_focus', 'fullscreen_exit', 'paste', 'copy', 'cut', 'contextmenu',
  'devtools_hint', 'multiple_screens_hint', 'network_offline', 'network_online',
];

const accommodationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  extraTimePercent: { type: Number, default: 0, min: 0, max: 200 },
  disabledSignals: { type: [String], default: [] },
  note: { type: String, maxlength: 300, default: '' },
}, { _id: false });

const assessmentSchema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  cohortId: { type: Schema.Types.ObjectId, ref: 'Cohort', default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  instructions: { type: String, default: '', maxlength: 5000 },
  questionIds: { type: [Schema.Types.ObjectId], default: [] }, // ordered question set from the bank
  opensAt: { type: Date, required: true },
  closesAt: { type: Date, required: true },
  durationMinutes: { type: Number, required: true, min: 1, max: 600 },
  attemptsAllowed: { type: Number, default: 1, min: 1, max: 5 },
  integrityLevel: { type: Number, enum: [0, 1], default: 0 }, // 2 and 3 arrive in Phase 5
  shuffleQuestions: { type: Boolean, default: true },
  status: { type: String, enum: ASSESSMENT_STATUSES, default: 'draft' },
  releaseResults: { type: Boolean, default: false },
  accommodations: { type: [accommodationSchema], default: [] },
  flagThresholds: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true, collection: 'assessments' });

assessmentSchema.index({ institutionId: 1, courseId: 1, status: 1 });

export default mongoose.models.Assessment || mongoose.model('Assessment', assessmentSchema);
