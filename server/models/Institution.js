import mongoose from 'mongoose';

const institutionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 200 },
  slug: { type: String, required: true, unique: true, trim: true, lowercase: true, match: /^[a-z0-9-]+$/ },
  contractedStudentLimit: { type: Number, required: true, min: 0, default: 0 },
  contractStart: { type: Date, default: null },
  contractEnd: { type: Date, default: null },
  allowedEmailDomains: { type: [String], default: [] },
  monthlyAiCallCap: { type: Number, default: 20000, min: 0 },
  status: { type: String, enum: ['active', 'suspended', 'archived'], default: 'active' },
  // When true, people with an approved email domain can create their own student account.
  selfSignup: { type: Boolean, default: false },
  // Short self-expiring lock that serialises seat-taking (see services/seatLock.js).
  seatLockUntil: { type: Date, default: null },
  // The job roles students practise for. Edited by the university admin.
  targetRoles: [{
    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    skills: { type: [String], default: [] }
  }]
}, { timestamps: true, collection: 'institutions' });

institutionSchema.pre('validate', function (next) {
  this.allowedEmailDomains = (this.allowedEmailDomains || [])
    .map((d) => String(d).trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
  next();
});

export default mongoose.models.Institution || mongoose.model('Institution', institutionSchema);
