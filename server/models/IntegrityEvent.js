import mongoose from 'mongoose';

// One browser-reported signal. Level 1 only: no camera, no audio, no screen capture.
const integrityEventSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssessmentSession', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, default: null },
  type: { type: String, required: true },
  t: { type: Number, required: true },                 // ms since the session started, as measured by the client
  receivedAt: { type: Date, default: Date.now },
  len: { type: Number, default: null },                // paste: number of characters
  inEditor: { type: Boolean, default: null },          // paste/copy/cut: happened inside the code editor
  detail: { type: String, maxlength: 100, default: '' },
  technical: { type: Boolean, default: false },        // offline/online: connectivity, not behaviour
}, { timestamps: { createdAt: 'createdAt', updatedAt: false }, collection: 'integrityevents' });

export default mongoose.models.IntegrityEvent || mongoose.model('IntegrityEvent', integrityEventSchema);
