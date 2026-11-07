import mongoose from 'mongoose';

// Compact keystroke-level events for later replay. One document per batch the editor flushes.
const eventSchema = new mongoose.Schema({
  t: { type: Number, required: true },                       // ms since the editing session started
  type: { type: String, enum: ['insert', 'delete', 'paste', 'focus', 'blur'], required: true },
  len: { type: Number, default: 0 },
  pos: { type: Number },
  text: { type: String, maxlength: 2000 },
}, { _id: false });

const editEventBatchSchema = new mongoose.Schema({
  attemptId: { type: mongoose.Schema.Types.ObjectId, ref: 'Attempt', required: true, index: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  seq: { type: Number, default: 0 },
  assessmentSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssessmentSession', default: null, index: true },
  events: { type: [eventSchema], default: [] },
}, { timestamps: true, collection: 'editeventbatches' });

export default mongoose.models.EditEventBatch || mongoose.model('EditEventBatch', editEventBatchSchema);
