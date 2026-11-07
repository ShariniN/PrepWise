// Runs cohort similarity for one assessment: each student's last submitted source per question, compared within the
// question, with the question's starter code ignored. Stores the pairs and refreshes flags for involved sessions.
import assessmentRepo from '../../repositories/assessmentRepo.js';
import questionRepo from '../../repositories/questionRepo.js';
import { compareCohort, DEFAULTS } from './index.js';
import { analyseSession } from '../integrity/analysis.js';
import { effectiveThresholds } from '../integrity/thresholds.js';

const sid = (v) => String(v);
const toPlain = (m) => (m instanceof Map ? Object.fromEntries(m) : (m || {}));
export const MAX_STORED_PAIRS = 5000;

export const runAssessmentSimilarity = async (institutionId, assessment, { threshold, minTokens } = {}) => {
  const th = threshold ?? effectiveThresholds(assessment).similarityContainment ?? DEFAULTS.threshold;
  const sessions = await assessmentRepo.listSessions(institutionId, { assessmentId: assessment._id });
  const attempts = sessions.length ? await assessmentRepo.listAttemptsForSessions(institutionId, sessions.map((s) => s._id), { runKind: 'submit' }) : [];
  const sessionById = new Map(sessions.map((s) => [sid(s._id), s]));

  // last submission per session and question
  const last = new Map();
  for (const a of attempts) {
    if (!a.source || !a.language) continue;
    const key = `${sid(a.assessmentSessionId)}|${sid(a.questionId)}`;
    if (!last.has(key) || new Date(a.createdAt) >= new Date(last.get(key).createdAt)) last.set(key, a);
  }
  const byQuestion = new Map();
  for (const a of last.values()) {
    if (!byQuestion.has(sid(a.questionId))) byQuestion.set(sid(a.questionId), []);
    byQuestion.get(sid(a.questionId)).push(a);
  }

  const stored = [];
  const summary = [];
  for (const [questionId, subs] of byQuestion) {
    const q = await questionRepo.findVisible(institutionId, questionId);
    const result = compareCohort(
      subs.map((a) => ({ id: sid(a.assessmentSessionId), language: a.language, source: a.source })),
      { starterCode: toPlain(q?.starterCode), threshold: th, ...(minTokens ? { minTokens } : {}) },
    );
    let flagged = 0;
    for (const p of result.pairs) {
      const A = sessionById.get(p.aId);
      const B = sessionById.get(p.bId);
      if (sid(A.userId) === sid(B.userId)) continue; // a student's own two attempts are not collusion
      if (p.flagged) flagged += 1;
      stored.push({
        questionId, sessionAId: A._id, sessionBId: B._id, userAId: A.userId, userBId: B.userId, containment: Number(p.containment.toFixed(4)),
        jaccard: Number(p.jaccard.toFixed(4)), sharedFingerprints: p.shared, flagged: p.flagged, threshold: th, rangesA: p.rangesA, rangesB: p.rangesB,
      });
    }
    summary.push({
      questionId, title: q?.title || null, submissions: subs.length, compared: result.compared, flaggedPairs: flagged,
      skipped: result.skipped.map((s) => ({ sessionId: s.id, reason: s.reason })),
    });
  }
  const previouslyFlagged = await assessmentRepo.listSimilarity(institutionId, { assessmentId: assessment._id, flaggedOnly: true });
  stored.sort((x, y) => y.containment - x.containment);
  const kept = stored.slice(0, MAX_STORED_PAIRS);
  await assessmentRepo.replaceSimilarity(institutionId, assessment._id, kept);

  // Refresh flags (creates or updates review cases) for every session in a flagged pair.
  const touched = new Set([...kept.filter((p) => p.flagged), ...previouslyFlagged].flatMap((p) => [sid(p.sessionAId), sid(p.sessionBId)]));
  for (const id of touched) await analyseSession(institutionId, id);
  return { threshold: th, questions: summary, pairsStored: kept.length, flaggedPairs: kept.filter((p) => p.flagged).length, sessionsFlagged: touched.size, truncated: stored.length > kept.length };
};
