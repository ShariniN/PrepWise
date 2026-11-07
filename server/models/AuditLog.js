import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  actor: { type: String, default: 'system' },       // user id, or a label such as 'owner-script'
  action: { type: String, required: true, index: true },
  target: { type: String, default: '' },            // id or email of the affected record
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', default: null, index: true },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, index: true }
}, { collection: 'auditlogs', versionKey: false });

export default mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
