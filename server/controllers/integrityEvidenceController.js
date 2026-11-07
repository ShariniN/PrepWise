// Staff-only evidence tools: cohort similarity and code replay. Every call is audited.
import assessmentRepo from '../repositories/assessmentRepo.js';
import courseRepo from '../repositories/courseRepo.js';
import { institutionOf } from '../middleware/tenancy.js';
import { audit } from '../services/audit.js';
import { isId, loadStaffCourse } from '../services/courseAccess.js';
import { runAssessmentSimilarity } from '../services/similarity/run.js';

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const sid = (v) => String(v);

const loadAssessment = async (req, res) => {
  const institutionId = institutionOf(req);
  if (!isId(req.params.id)) { fail(res, 404, 'Assessment not found'); return null; }
  const a = await assessmentRepo.findAssessment(institutionId, req.params.id);
  if (!a || !(await loadStaffCourse(req, a.courseId))) { fail(res, 404, 'Assessment not found'); return null; }
  return a;
};

// POST /api/integrity/assessments/:id/similarity/run   body (optional): { threshold: 0.3-1, minTokens: 10-500 }
export const runSimilarity = async (req, res) => {
  const a = await loadAssessment(req, res);
  if (!a) return;
  const { threshold, minTokens } = req.body || {};
  if (threshold !== undefined && !(typeof threshold === 'number' && threshold >= 0.3 && threshold <= 1)) return fail(res, 400, 'threshold must be a number from 0.3 to 1');
  if (minTokens !== undefined && !(Number.isInteger(minTokens) && minTokens >= 10 && minTokens <= 500)) return fail(res, 400, 'minTokens must be a whole number from 10 to 500');
  const institutionId = institutionOf(req);
  const result = await runAssessmentSimilarity(institutionId, a, { threshold, minTokens });
  await audit({
    actor: req.user.id, action: 'integrity.similarity.run', target: a._id, institutionId,
    meta: { threshold: result.threshold, flaggedPairs: result.flaggedPairs, sessionsFlagged: result.sessionsFlagged },
  });
  res.json({
    success: true, ...result,
    limits: 'Similarity is a lead for a human reviewer, not proof. Short or boilerplate-heavy solutions can look alike without copying.',
  });
};

// GET /api/integrity/assessments/:id/similarity?flagged=1&questionId=
export const listSimilarity = async (req, res) => {
  const a = await loadAssessment(req, res);
  if (!a) return;
  const institutionId = institutionOf(req);
  let pairs = await assessmentRepo.listSimilarity(institutionId, { assessmentId: a._id, flaggedOnly: req.query.flagged === '1' || req.query.flagged === 'true' });
  if (req.query.questionId !== undefined) pairs = pairs.filter((p) => sid(p.questionId) === String(req.query.questionId));
  const ids = [...new Set(pairs.flatMap((p) => [sid(p.userAId), sid(p.userBId)]))];
  const users = ids.length ? await courseRepo.findUsersByIds(institutionId, ids) : [];
  const who = (id) => { const u = users.find((x) => sid(x._id) === sid(id)); return { userId: sid(id), name: u?.name || null, email: u?.email || null }; };
  await audit({ actor: req.user.id, action: 'integrity.similarity.view', target: a._id, institutionId, meta: { pairs: pairs.length } });
  res.json({
    success: true,
    pairs: pairs.map((p) => ({
      id: sid(p._id), questionId: sid(p.questionId), flagged: !!p.flagged, threshold: p.threshold, containment: p.containment, jaccard: p.jaccard,
      sharedFingerprints: p.sharedFingerprints, a: { ...who(p.userAId), sessionId: sid(p.sessionAId), ranges: p.rangesA },
      b: { ...who(p.userBId), sessionId: sid(p.sessionBId), ranges: p.rangesB },
    })),
  });
};
