import Question from '../models/Question.js';
import TestCase from '../models/TestCase.js';
import Rubric from '../models/Rubric.js';
import Attempt from '../models/Attempt.js';
import EditEventBatch from '../models/EditEventBatch.js';

// Every function takes the caller's institutionId and filters by it. The global seed bank has institutionId null
// and is readable from every tenant but never writable: write functions match only `institutionId` exactly.
const STAFF_ONLY = '+referenceSolution +altReferenceSolutions +wrongSolution +correct +traceAnswer +explanation +validation';
const readable = (institutionId) => ({ institutionId: { $in: [null, institutionId] } });

const questionRepo = {
  // ---- questions ----
  listVisible: (institutionId, { status, type, topic, difficulty, authorId, excludeIds } = {}) => {
    const f = readable(institutionId);
    if (status) f.status = status;
    if (type) f.type = type;
    if (topic) f.topic = topic;
    if (difficulty) f.difficulty = difficulty;
    if (authorId) f.authorId = authorId;
    if (excludeIds?.length) f._id = { $nin: excludeIds };
    return Question.find(f).sort({ createdAt: -1 }).limit(500).lean();
  },
  findVisible: (institutionId, id, { staff = false } = {}) =>
    Question.findOne({ _id: id, ...readable(institutionId) }).select(staff ? STAFF_ONLY : '').lean(),
  findOwn: (institutionId, id) => Question.findOne({ _id: id, institutionId }).select(STAFF_ONLY).lean(),
  createQuestion: async (doc) => (await Question.create(doc)).toObject(),
  updateQuestion: (institutionId, id, patch) =>
    Question.findOneAndUpdate({ _id: id, institutionId }, { $set: patch }, { new: true, runValidators: true }).select(STAFF_ONLY).lean(),
  deleteQuestion: async (institutionId, id) => (await Question.deleteOne({ _id: id, institutionId })).deletedCount > 0,
  upsertSeedBySlug: (slug, doc) =>
    Question.findOneAndUpdate({ slug, institutionId: null }, { $set: { ...doc, institutionId: null, slug } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean(),

  // ---- tests ----
  listTests: (questionId) => TestCase.find({ questionId }).sort({ order: 1, _id: 1 }).lean(),
  addTest: async (doc) => (await TestCase.create(doc)).toObject(),
  updateTest: (institutionId, questionId, testId, patch) =>
    TestCase.findOneAndUpdate({ _id: testId, questionId, institutionId }, { $set: patch }, { new: true, runValidators: true }).lean(),
  deleteTest: async (institutionId, questionId, testId) =>
    (await TestCase.deleteOne({ _id: testId, questionId, institutionId })).deletedCount > 0,
  deleteTestsOf: (institutionId, questionId) => TestCase.deleteMany({ questionId, institutionId }),
  replaceSeedTests: async (questionId, tests) => {
    await TestCase.deleteMany({ questionId, institutionId: null });
    if (tests.length) await TestCase.insertMany(tests.map((t, order) => ({ ...t, questionId, institutionId: null, order })));
  },

  // ---- rubrics ----
  getRubric: (institutionId, questionId) => Rubric.findOne({ questionId, ...readable(institutionId) }).lean(),
  saveRubric: (institutionId, questionId, criteria) =>
    Rubric.findOneAndUpdate({ questionId, institutionId }, { $set: { criteria, institutionId, questionId } }, { upsert: true, new: true }).lean(),
  deleteRubric: async (institutionId, questionId) => (await Rubric.deleteOne({ questionId, institutionId })).deletedCount > 0,

  // ---- attempts ----
  createAttempt: async (doc) => (await Attempt.create(doc)).toObject(),
  findAttempt: (institutionId, userId, id) => Attempt.findOne({ _id: id, institutionId, userId }).lean(),
  updateAttempt: (institutionId, userId, id, patch) =>
    Attempt.findOneAndUpdate({ _id: id, institutionId, userId }, { $set: patch }, { new: true }).lean(),
  findDraft: (institutionId, userId, questionId) =>
    Attempt.findOne({ institutionId, userId, questionId, runKind: 'draft' }).lean(),
  solvedQuestionIds: (institutionId, userId) =>
    Attempt.distinct('questionId', { institutionId, userId, runKind: 'submit', verdict: 'accepted' }),
  countAttemptsFor: (questionId) => Attempt.countDocuments({ questionId }),

  // ---- edit events ----
  addEventBatch: async (doc) => (await EditEventBatch.create(doc)).toObject(),
  countEventBatches: (institutionId, attemptId) => EditEventBatch.countDocuments({ institutionId, attemptId }),
};

export default questionRepo;
