import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  code: { type: String, required: true, trim: true, maxlength: 40 },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true, collection: 'courses' });

courseSchema.index({ institutionId: 1, code: 1 }, { unique: true });

export default mongoose.models.Course || mongoose.model('Course', courseSchema);
