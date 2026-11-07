import AuditLog from '../models/AuditLog.js';

export const auditRepo = {
  create: (doc) => AuditLog.create(doc),
};

// An audit failure is logged but never blocks the user's action.
export const audit = async ({ actor, action, target = '', institutionId = null, meta = {} }) => {
  try {
    await auditRepo.create({
      actor: actor ? String(actor) : 'system',
      action,
      target: target ? String(target) : '',
      institutionId: institutionId || null,
      meta,
    });
  } catch (error) {
    console.error('Audit log write failed:', action, error.message);
  }
};
