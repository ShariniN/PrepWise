import Assessment from '../models/Assessment.js';
import AssessmentSession from '../models/AssessmentSession.js';
import IntegrityEvent from '../models/IntegrityEvent.js';
import ReviewCase from '../models/ReviewCase.js';
import SimilarityPair from '../models/SimilarityPair.js';
import Attempt from '../models/Attempt.js';
import EditEventBatch from '../models/EditEventBatch.js';
import Institution from '../models/Institution.js';

// Every function takes the caller's institutionId first and filters by it.
const assessmentRepo = {
  // ---- assessments ----
  createAssessment: async (doc) => (await Assessment.create(doc)).toObject(),
  findAssessment: (institutionId, id) => Assessment.findOne({ _id: id, institutionId }).lean(),
  listAssessments: (institutionId, { courseIds, notDraft } = {}) => {
    const f = { institutionId };
    if (courseIds) f.courseId = { $in: courseIds };
    if (notDraft) f.status = { $ne: 'draft' };
    return Assessment.find(f).sort({ opensAt: -1 }).limit(500).lean();
  },
  updateAssessment: (institutionId, id, patch) =>
    Assessment.findOneAndUpdate({ _id: id, institutionId }, { $set: patch }, { new: true, runValidators: true }).lean(),

  // ---- sessions ----
  createSession: async (doc) => (await AssessmentSession.create(doc)).toObject(),
  findSession: (institutionId, id) => AssessmentSession.findOne({ _id: id, institutionId }).lean(),
  listSessions: (institutionId, { assessmentId, assessmentIds, userId } = {}) => {
    const f = { institutionId };
    if (assessmentId) f.assessmentId = assessmentId;
    if (assessmentIds) f.assessmentId = { $in: assessmentIds };
    if (userId) f.userId = userId;
    return AssessmentSession.find(f).sort({ serverStartedAt: 1 }).limit(5000).lean();
  },
  updateSession: (institutionId, id, patch) =>
    AssessmentSession.findOneAndUpdate({ _id: id, institutionId }, patch.$push || patch.$inc ? patch : { $set: patch }, { new: true }).lean(),
  // Sessions of this student whose assessment has not closed yet: the questions in them are off limits in practice mode.
  findLockingSessions: (institutionId, userId, now) =>
    AssessmentSession.find({ institutionId, userId, closesAt: { $gt: now } }).select('questions closesAt').lean(),
  closeSessionWindows: (institutionId, assessmentId, now) =>
    AssessmentSession.updateMany({ institutionId, assessmentId }, { $set: { closesAt: now } }),

  // ---- attempts and edit events inside a session ----
  findSessionDraft: (institutionId, sessionId, questionId) =>
    Attempt.findOne({ institutionId, assessmentSessionId: sessionId, questionId, runKind: 'draft' }).lean(),
  listAttemptsForSessions: (institutionId, sessionIds, { runKind } = {}) =>
    Attempt.find({ institutionId, assessmentSessionId: { $in: sessionIds }, ...(runKind ? { runKind } : {}) }).sort({ createdAt: 1 }).limit(20000).lean(),
  listBatchesForSession: (institutionId, sessionId, questionId) =>
    EditEventBatch.find({ institutionId, assessmentSessionId: sessionId, ...(questionId ? { questionId } : {}) }).sort({ seq: 1, createdAt: 1 }).limit(5000).lean(),

  // ---- integrity events ----
  addIntegrityEvents: (docs) => IntegrityEvent.insertMany(docs),
  countIntegrityEvents: (institutionId, sessionId) => IntegrityEvent.countDocuments({ institutionId, sessionId }),
  listIntegrityEvents: (institutionId, sessionId) =>
    IntegrityEvent.find({ institutionId, sessionId }).sort({ t: 1, receivedAt: 1 }).limit(10000).lean(),

  // ---- review cases ----
  findCase: (institutionId, id) => ReviewCase.findOne({ _id: id, institutionId }).lean(),
  findCaseBySession: (institutionId, sessionId) => ReviewCase.findOne({ institutionId, sessionId }).lean(),
  createCase: async (doc) => (await ReviewCase.create(doc)).toObject(),
  updateCase: (institutionId, id, patch) =>
    ReviewCase.findOneAndUpdate({ _id: id, institutionId }, patch.$push ? patch : { $set: patch }, { new: true }).lean(),
  listCases: (institutionId, { courseIds, status, assessmentId, userId } = {}) => {
    const f = { institutionId };
    if (courseIds) f.courseId = { $in: courseIds };
    if (status) f.status = Array.isArray(status) ? { $in: status } : status;
    if (assessmentId) f.assessmentId = assessmentId;
    if (userId) f.userId = userId;
    return ReviewCase.find(f).sort({ updatedAt: -1 }).limit(500).lean();
  },

  // ---- similarity ----
  replaceSimilarity: async (institutionId, assessmentId, pairs) => {
    await SimilarityPair.deleteMany({ institutionId, assessmentId });
    if (pairs.length) await SimilarityPair.insertMany(pairs.map((p) => ({ ...p, institutionId, assessmentId })));
  },
  listSimilarity: (institutionId, { assessmentId, sessionId, flaggedOnly } = {}) => {
    const f = { institutionId };
    if (assessmentId) f.assessmentId = assessmentId;
    if (sessionId) f.$or = [{ sessionAId: sessionId }, { sessionBId: sessionId }];
    if (flaggedOnly) f.flagged = true;
    return SimilarityPair.find(f).sort({ containment: -1 }).limit(5000).lean();
  },

  // ---- retention ----
  listRetentionPolicies: () => Institution.find({}).select('retentionDays').lean(),
  protectedSessionIds: async (institutionId) =>
    (await ReviewCase.find({ institutionId, status: { $in: ['open', 'escalated'] } }).select('sessionId').lean()).map((c) => c.sessionId),
  deleteExpiredEvidence: async (institutionId, cutoff, protectedIds) => {
    const keep = protectedIds.length ? { $nin: protectedIds } : { $exists: true };
    const [events, batches, pairs] = await Promise.all([
      IntegrityEvent.deleteMany({ institutionId, createdAt: { $lt: cutoff }, sessionId: keep }),
      EditEventBatch.deleteMany({ institutionId, createdAt: { $lt: cutoff }, assessmentSessionId: { $ne: null, ...(protectedIds.length ? { $nin: protectedIds } : {}) } }),
      SimilarityPair.deleteMany({ institutionId, createdAt: { $lt: cutoff }, sessionAId: keep, sessionBId: keep }),
    ]);
    return { integrityEvents: events.deletedCount, editEventBatches: batches.deletedCount, similarityPairs: pairs.deletedCount };
  },
  deleteExpiredCases: async (institutionId, cutoff) =>
    (await ReviewCase.deleteMany({ institutionId, status: { $in: ['dismissed', 'resolved'] }, updatedAt: { $lt: cutoff } })).deletedCount,
};

export default assessmentRepo;
