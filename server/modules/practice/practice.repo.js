import mongoose from 'mongoose';
import Question from '../../models/Question.js';
import TestCase from '../../models/TestCase.js';
import Attempt from '../../models/Attempt.js';

// Every function takes the caller's institutionId and filters by it. The global seed bank has institutionId null
// and is readable from every tenant but never writable: write functions match only `institutionId` exactly.
const STAFF_ONLY = '+referenceSolution +altReferenceSolutions +wrongSolution +correct +traceAnswer +explanation';
const readable = (institutionId) => ({ institutionId: { $in: [null, institutionId] } });

// The filter findCodingQuestion runs: a published seeded coding question at this difficulty that allows this language.
// Aggregation does not cast ids the way find() does, so ids are cast here.
const toId = (v) => (mongoose.Types.ObjectId.isValid(String(v)) ? new mongoose.Types.ObjectId(String(v)) : v);
export const codingQuestionFilter = ({ institutionId, difficulty, language, excludeIds = [] }) => ({
  ...readable(toId(institutionId)),
  source: 'seed',
  type: 'coding',
  status: 'published',
  difficulty,
  languages: language,
  ...(excludeIds.length ? { _id: { $nin: excludeIds.map(toId) } } : {}),
});

const practiceRepo = {
  // ---- questions ----
  listVisible: (institutionId, { status, type, topic, difficulty, excludeIds } = {}) => {
    const f = readable(institutionId);
    if (status) f.status = status;
    if (type) f.type = type;
    if (topic) f.topic = topic;
    if (difficulty) f.difficulty = difficulty;
    if (excludeIds?.length) f._id = { $nin: excludeIds };
    return Question.find(f).sort({ createdAt: -1 }).limit(500).lean();
  },
  findVisible: (institutionId, id, { staff = false } = {}) =>
    Question.findOne({ _id: id, ...readable(institutionId) }).select(staff ? STAFF_ONLY : '').lean(),
  // One random published seeded coding question, or null when nothing matches.
  findCodingQuestion: async ({ institutionId, difficulty, language, excludeIds = [] }) => {
    const [picked] = await Question.aggregate([
      { $match: codingQuestionFilter({ institutionId, difficulty, language, excludeIds }) },
      { $sample: { size: 1 } },
    ]);
    return picked || null;
  },
  upsertSeedBySlug: (slug, doc) =>
    Question.findOneAndUpdate({ slug, institutionId: null }, { $set: { ...doc, institutionId: null, slug } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean(),

  // ---- tests ----
  listTests: (questionId) => TestCase.find({ questionId }).sort({ order: 1, _id: 1 }).lean(),
  replaceSeedTests: async (questionId, tests) => {
    await TestCase.deleteMany({ questionId, institutionId: null });
    if (tests.length) await TestCase.insertMany(tests.map((t, order) => ({ ...t, questionId, institutionId: null, order })));
  },

  // ---- attempts ----
  createAttempt: async (doc) => (await Attempt.create(doc)).toObject(),
  // `assessmentSessionId: null` keeps rows written by the removed assessment mode (older databases) out of practice.
  findAttempt: (institutionId, userId, id) => Attempt.findOne({ _id: id, institutionId, userId, assessmentSessionId: null }).lean(),
  updateAttempt: (institutionId, userId, id, patch) =>
    Attempt.findOneAndUpdate({ _id: id, institutionId, userId }, { $set: patch }, { new: true }).lean(),
  findDraft: (institutionId, userId, questionId) =>
    Attempt.findOne({ institutionId, userId, questionId, runKind: 'draft', assessmentSessionId: null }).lean(),
  solvedQuestionIds: (institutionId, userId) =>
    Attempt.distinct('questionId', { institutionId, userId, runKind: 'submit', verdict: 'accepted', assessmentSessionId: null }),
};

export default practiceRepo;
