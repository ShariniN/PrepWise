import mongoose from 'mongoose';

const { Schema } = mongoose;

export const QUESTION_TYPES = ['coding', 'trace', 'mcq'];
export const QUESTION_STATUSES = ['draft', 'published', 'retired'];
export const DIFFICULTIES = ['easy', 'medium', 'hard'];

const codeSchema = new Schema({
  language: { type: String, trim: true, maxlength: 20 },
  source: { type: String, maxlength: 65536 },
}, { _id: false });

const questionSchema = new Schema({
  // null institutionId = the global seed bank: readable by every tenant, editable by nobody
  institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', default: null, index: true },
  slug: { type: String, trim: true, maxlength: 120 },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  statement: { type: String, default: '', maxlength: 20000 },
  type: { type: String, enum: QUESTION_TYPES, required: true },
  topic: [{ type: String, trim: true, maxlength: 60 }],
  difficulty: { type: String, enum: DIFFICULTIES, default: 'easy' },
  languages: [{ type: String, trim: true, maxlength: 20 }],
  starterCode: { type: Map, of: String, default: {} },
  timeLimitMs: { type: Number, default: 2000, min: 100, max: 15000 },
  memoryLimitKb: { type: Number, default: 256000, min: 16000, max: 512000 },
  estimatedMinutes: { type: Number, min: 1, max: 240 },
  learningOutcome: { type: String, trim: true, maxlength: 500, default: '' },
  source: { type: String, enum: ['seed'] },
  status: { type: String, enum: QUESTION_STATUSES, default: 'draft' },
  version: { type: Number, default: 1, min: 1 },
  // Staff-only fields. Student serializers whitelist fields, but keep these out of default selects too.
  referenceSolution: { type: codeSchema, select: false },
  altReferenceSolutions: { type: [codeSchema], select: false },
  wrongSolution: { type: codeSchema, select: false },
  options: [{ type: String, maxlength: 500 }],          // mcq
  correct: { type: [Number], select: false },           // mcq: indexes of correct options
  multi: { type: Boolean, default: false },             // mcq: more than one correct option
  traceAnswer: { type: String, select: false, maxlength: 2000 }, // trace: expected output
  explanation: { type: String, select: false, maxlength: 4000 }, // shown only after an answer is submitted
}, { timestamps: true, collection: 'questions' });

questionSchema.index({ institutionId: 1, status: 1, type: 1 });
questionSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { slug: { $type: 'string' } } });

export default mongoose.models.Question || mongoose.model('Question', questionSchema);
