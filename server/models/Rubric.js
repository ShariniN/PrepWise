import mongoose from 'mongoose';

const levelSchema = new mongoose.Schema({
  label: { type: String, trim: true, maxlength: 80 },
  points: { type: Number, min: 0 },
  description: { type: String, trim: true, maxlength: 500 },
}, { _id: false });

const criterionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  maxPoints: { type: Number, required: true, min: 0, max: 100 },
  levels: { type: [levelSchema], default: [] },
}, { _id: false });

const rubricSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', default: null, index: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true, unique: true },
  criteria: { type: [criterionSchema], default: [] },
}, { timestamps: true, collection: 'rubrics' });

export default mongoose.models.Rubric || mongoose.model('Rubric', rubricSchema);
