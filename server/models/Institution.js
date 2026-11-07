import mongoose from 'mongoose';

const institutionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 200 },
  slug: { type: String, required: true, unique: true, trim: true, lowercase: true, match: /^[a-z0-9-]+$/ },
  contractedStudentLimit: { type: Number, required: true, min: 0, default: 0 },
  contractStart: { type: Date, default: null },
  contractEnd: { type: Date, default: null },
  allowedEmailDomains: { type: [String], default: [] },
  retentionDays: { type: Number, default: 90, min: 1 },
  monthlyAiCallCap: { type: Number, default: 20000, min: 0 },
  status: { type: String, enum: ['active', 'suspended', 'archived'], default: 'active' }
}, { timestamps: true, collection: 'institutions' });

institutionSchema.pre('validate', function (next) {
  this.allowedEmailDomains = (this.allowedEmailDomains || [])
    .map((d) => String(d).trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
  next();
});

export default mongoose.models.Institution || mongoose.model('Institution', institutionSchema);
