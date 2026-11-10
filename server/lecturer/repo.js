// Mongo access for the lecturer dashboard. Every function takes institutionId first and filters by it, so a
// controller that passes the caller's institution can never read another university's rows. Tests replace these.
//
// Projections never select CV text (Interview.resumeText, CVAnalysis.resumeText, User.currentCV), secrets
// (password, OTPs, invite tokens), hidden interview tests or audio URLs. The controller whitelists fields again.
import userModel from '../models/userModel.js';
import Interview from '../models/InterviewModel.js';
import CVAnalysis from '../models/CVAnalysisModel.js';
import SkillsAssessment from '../models/SkillAssessorModel.js';
import Attempt from '../models/Attempt.js';

const MAX_ROWS = 100000;
const STUDENT_FIELDS = 'name email group role status lastActive createdAt';
const STUDENT_FILTER = { role: 'student', status: 'active' };

const INTERVIEW_SUMMARY_FIELDS = [
  'userId', 'status', 'createdAt', 'completedAt', 'startedAt', 'jobDescription',
  'overallFeedback.score', 'overallFeedback.readinessLevel', 'overallFeedback.feedback.readinessLevel',
  'responses.questionType', 'responses.skipped', 'responses.feedback.score', 'responses.feedback.source',
  'responses.feedback.communicationClarity', 'responses.deliveryMetrics',
].join(' ');

const CV_FIELDS = [
  'userId', 'createdAt', 'updatedAt', 'jobDescriptions',
  'results.jobIndex', 'results.jobTitle', 'results.company', 'results.matchPercentage', 'results.isNonTechRole', 'results.scoreBreakdown',
  'results.strengths', 'results.contentWeaknesses', 'results.structureWeaknesses', 'results.skillsMatched', 'results.skillsMissing',
].join(' ');

const lecturerRepo = {
  // Active students of the institution, optionally one group.
  listStudents: (institutionId, { group } = {}) => {
    const q = { institutionId, ...STUDENT_FILTER };
    if (group) q.group = group;
    return userModel.find(q).select(STUDENT_FIELDS).limit(MAX_ROWS).lean();
  },

  distinctGroups: async (institutionId) =>
    (await userModel.distinct('group', { institutionId, ...STUDENT_FILTER })).filter((g) => typeof g === 'string' && g.trim()),

  findStudent: (institutionId, id) => userModel.findOne({ _id: id, institutionId, ...STUDENT_FILTER }).select(STUDENT_FIELDS).lean(),

  interviewsFor: (institutionId, userIds) => {
    if (!userIds.length) return Promise.resolve([]);
    return Interview.find({ institutionId, userId: { $in: userIds } }).select(INTERVIEW_SUMMARY_FIELDS).limit(MAX_ROWS).lean();
  },

  // One full interview of one student. Excludes CV text, hidden tests and audio.
  findInterview: (institutionId, userId, interviewId) =>
    Interview.findOne({ _id: interviewId, institutionId, userId }).select('-resumeText -questions.tests -responses.audioUrl').lean(),

  cvAnalysesFor: (institutionId, userIds) => {
    if (!userIds.length) return Promise.resolve([]);
    return CVAnalysis.find({ institutionId, userId: { $in: userIds } }).select(CV_FIELDS).limit(MAX_ROWS).lean();
  },

  latestSkillAssessment: (institutionId, userId) =>
    SkillsAssessment.findOne({ institutionId, userId }).sort({ createdAt: -1 })
      .select('userId createdAt updatedAt skills.name skills.category skills.proficiencyLevel').lean(),

  // Run and submit attempts (no source code, no answers). Legacy assessment-mode rows are left out.
  attemptsFor: (institutionId, userIds) => {
    if (!userIds.length) return Promise.resolve([]);
    return Attempt.find({ institutionId, userId: { $in: userIds }, runKind: { $in: ['run', 'submit'] }, assessmentSessionId: null })
      .select('userId questionId runKind verdict score scoreSource createdAt needsReview review.aiSuggestion.at review.final.at')
      .limit(MAX_ROWS).lean();
  },
};

export default lecturerRepo;
