import mongoose from 'mongoose';

export const CONSENT_TYPES = ['terms', 'privacy', 'ai_processing', 'recording'];

const consentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', default: null },
  type: { type: String, enum: CONSENT_TYPES, required: true },
  version: { type: String, required: true, trim: true, maxlength: 40 },
  acceptedAt: { type: Date, default: Date.now }
}, { collection: 'consentrecords', versionKey: false });

export default mongoose.models.ConsentRecord || mongoose.model('ConsentRecord', consentSchema);
