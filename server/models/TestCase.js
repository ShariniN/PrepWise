import mongoose from 'mongoose';

const testCaseSchema = new mongoose.Schema({
  // copied from the question so a query by institution is always possible; null for seed tests
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', default: null, index: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true, index: true },
  input: { type: String, default: '', maxlength: 16384 },
  expectedOutput: { type: String, default: '', maxlength: 16384 },
  visible: { type: Boolean, default: false },
  weight: { type: Number, default: 1, min: 0, max: 100 },
  comparison: { type: String, enum: ['trim', 'exact', 'tokens'], default: 'trim' },
  order: { type: Number, default: 0 },
}, { timestamps: true, collection: 'testcases' });

export default mongoose.models.TestCase || mongoose.model('TestCase', testCaseSchema);
