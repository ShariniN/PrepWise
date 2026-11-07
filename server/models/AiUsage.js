import mongoose from 'mongoose';

const aiUsageSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
  month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
  calls: { type: Number, default: 0 }
}, { collection: 'aiusage', versionKey: false });

aiUsageSchema.index({ institutionId: 1, month: 1 }, { unique: true });

export default mongoose.models.AiUsage || mongoose.model('AiUsage', aiUsageSchema);
