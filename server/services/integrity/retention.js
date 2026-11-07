// Evidence retention. Each university sets Institution.retentionDays; integrity events, assessment edit-event
// batches and similarity pairs older than that are deleted. Closed (dismissed / resolved) cases older than the
// window are deleted too. Evidence belonging to a case that is still open or escalated is NEVER purged, so a
// live investigation cannot lose its evidence to the clock.
import assessmentRepo from '../../repositories/assessmentRepo.js';
import { audit } from '../audit.js';

const DAY = 24 * 60 * 60 * 1000;

export const cutoffFor = (now, retentionDays) => new Date(new Date(now).getTime() - Math.max(1, retentionDays || 90) * DAY);

export const purgeExpiredEvidence = async (now = new Date(), { repo = assessmentRepo, auditFn = audit } = {}) => {
  const policies = await repo.listRetentionPolicies();
  const results = [];
  for (const inst of policies) {
    const institutionId = String(inst._id);
    const cutoff = cutoffFor(now, inst.retentionDays);
    const protectedIds = await repo.protectedSessionIds(institutionId);
    const deleted = await repo.deleteExpiredEvidence(institutionId, cutoff, protectedIds);
    const casesDeleted = await repo.deleteExpiredCases(institutionId, cutoff);
    const row = { institutionId, retentionDays: inst.retentionDays ?? 90, cutoff, ...deleted, closedCases: casesDeleted };
    results.push(row);
    const total = Object.values(deleted).reduce((n, v) => n + v, 0) + casesDeleted;
    if (total > 0) await auditFn({ actor: 'retention-script', action: 'integrity.purge', target: institutionId, institutionId, meta: { ...deleted, closedCases: casesDeleted, cutoff } });
  }
  return results;
};
