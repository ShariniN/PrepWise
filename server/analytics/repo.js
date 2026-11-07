// Thin Mongo access for analytics. Every function takes institutionId first and filters by it, so a controller
// that passes the caller's institution can never read another university's rows. Tests replace these functions.
// Nothing here selects source code, CV text or interview resume text.
import mongoose from 'mongoose';
import Attempt from '../models/Attempt.js';
import Question from '../models/Question.js';
import TestCase from '../models/TestCase.js';
import Interview from '../models/InterviewModel.js';
import CVAnalysis from '../models/CVAnalysisModel.js';
import SkillsAssessment from '../models/SkillAssessorModel.js';

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const MAX_ROWS = 100000;

const ATTEMPT_FIELDS = 'userId questionId runKind verdict score scoreSource perTest createdAt needsReview review.aiSuggestion.at review.final.at';

const analyticsRepo = {
  // kinds defaults to every kind (draft, run, submit). `since` is a Date.
  attemptsForStudents: (institutionId, userIds, { since = null, kinds = null } = {}) => {
    if (!userIds.length) return Promise.resolve([]);
    const q = { institutionId, userId: { $in: userIds } };
    if (since) q.createdAt = { $gte: since };
    if (kinds) q.runKind = { $in: kinds };
    return Attempt.find(q).select(ATTEMPT_FIELDS).sort({ createdAt: 1 }).limit(MAX_ROWS).lean();
  },

  // Questions visible to the institution (its own plus the global seed bank).
  questionsByIds: (institutionId, ids) => {
    if (!ids.length) return Promise.resolve([]);
    return Question.find({ _id: { $in: ids }, $or: [{ institutionId }, { institutionId: null }] }).select('title type topic difficulty').lean();
  },

  // Staff view of tests (includes hidden). Returns { [questionId]: [test] } ordered as the sandbox ran them.
  testsByQuestion: async (questionIds) => {
    if (!questionIds.length) return {};
    const rows = await TestCase.find({ questionId: { $in: questionIds } }).sort({ order: 1, _id: 1 }).select('questionId input expectedOutput visible').lean();
    const out = {};
    for (const t of rows) (out[String(t.questionId)] ||= []).push(t);
    return out;
  },

  interviewsForStudents: (institutionId, userIds) => {
    if (!userIds.length) return Promise.resolve([]);
    return Interview.find({ institutionId, userId: { $in: userIds } })
      .select('userId status createdAt completedAt overallFeedback.feedback.categoryScores responses.feedback.source')
      .limit(MAX_ROWS).lean();
  },

  // Returns [{ userId, count }]
  cvCounts: async (institutionId, userIds) => {
    if (!userIds.length) return [];
    const rows = await CVAnalysis.aggregate([
      { $match: { institutionId: oid(institutionId), userId: { $in: userIds.map(oid) } } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
    ]);
    return rows.map((r) => ({ userId: String(r._id), count: r.count }));
  },

  skillAssessments: (institutionId, userIds) => {
    if (!userIds.length) return Promise.resolve([]);
    return SkillsAssessment.find({ institutionId, userId: { $in: userIds } }).select('userId createdAt skills.name skills.category skills.proficiencyLevel').limit(MAX_ROWS).lean();
  },

  // Student ids with a run/submit attempt or an interview since `since`.
  activeUserIds: async (institutionId, userIds, since) => {
    if (!userIds.length) return [];
    const [a, i] = await Promise.all([
      Attempt.distinct('userId', { institutionId, userId: { $in: userIds }, runKind: { $in: ['run', 'submit'] }, createdAt: { $gte: since } }),
      Interview.distinct('userId', { institutionId, userId: { $in: userIds }, createdAt: { $gte: since } }),
    ]);
    return [...new Set([...a, ...i].map(String))];
  },
};

export default analyticsRepo;
