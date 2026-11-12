// Mongo access for the dashboard. Every function takes institutionId first and filters by it, so a controller
// that passes the caller's institution can never read another university's rows. Tests replace these.
//
// Group scope: `groups` is null for "every group" (admins) or an array of group names (a lecturer's assigned
// groups). An empty array matches nobody; it never means "no filter".
//
// Projections never select CV text (Interview.resumeText, CVAnalysis.resumeText, User.currentCV), secrets
// (password, OTPs, invite tokens), hidden interview tests, the question pool or audio URLs. The controller whitelists fields again.
import userModel from '../../models/User.js';
import Institution from '../../models/Institution.js';
import Interview from '../../models/Interview.js';
import CVAnalysis from '../../models/CvAnalysis.js';
import Attempt from '../../models/Attempt.js';

const MAX_ROWS = 100000;
const STUDENT_FIELDS = 'name email group role status lastActive createdAt targetRoleId';
const STUDENT_FILTER = { role: 'student', status: 'active' };

const INTERVIEW_SUMMARY_FIELDS = [
  'userId', 'status', 'createdAt', 'completedAt', 'startedAt', 'jobDescription', 'levelReached',
  'overallFeedback.score', 'overallFeedback.readinessLevel', 'overallFeedback.feedback.readinessLevel',
  'responses.questionType', 'responses.skipped', 'responses.feedback.score', 'responses.feedback.source',
  'responses.feedback.communicationClarity', 'responses.deliveryMetrics',
].join(' ');

const CV_FIELDS = [
  'userId', 'createdAt', 'updatedAt', 'jobDescriptions', 'targetRoleId',
  'results.jobIndex', 'results.kind', 'results.jobTitle', 'results.company', 'results.matchPercentage', 'results.isNonTechRole', 'results.hasError', 'results.scoreBreakdown',
  'results.strengths', 'results.contentWeaknesses', 'results.structureWeaknesses', 'results.skillsMatched', 'results.skillsMissing',
].join(' ');

// Who sees what: admins every group of their university, lecturers only the groups an admin assigned them.
export const scopeFor = (user) => ({
  institutionId: user.institutionId,
  groups: user.role === 'university_admin' ? null : [...(Array.isArray(user.assignedGroups) ? user.assignedGroups : [])],
});

const studentQuery = (institutionId, groups) => {
  const q = { institutionId, ...STUDENT_FILTER };
  if (groups !== null) q.group = { $in: groups };
  return q;
};

const dashboardRepo = {
  // The target-role list (for row titles) and the seat limit.
  getInstitution: (institutionId) => Institution.findById(institutionId).select('name targetRoles contractedStudentLimit').lean(),

  // Active students of the institution inside `groups`.
  listStudents: (institutionId, groups) =>
    userModel.find(studentQuery(institutionId, groups)).select(STUDENT_FIELDS).limit(MAX_ROWS).lean(),

  distinctGroups: async (institutionId) =>
    (await userModel.distinct('group', { institutionId, ...STUDENT_FILTER })).filter((g) => typeof g === 'string' && g.trim()),

  findStudent: (institutionId, id, groups) =>
    userModel.findOne({ _id: id, ...studentQuery(institutionId, groups) }).select(STUDENT_FIELDS).lean(),

  interviewsFor: (institutionId, userIds) => {
    if (!userIds.length) return Promise.resolve([]);
    return Interview.find({ institutionId, userId: { $in: userIds } }).select(INTERVIEW_SUMMARY_FIELDS).limit(MAX_ROWS).lean();
  },

  // One full interview of one student. Excludes CV text, hidden tests and audio (the pool is never selected by default).
  findInterview: (institutionId, userId, interviewId) =>
    Interview.findOne({ _id: interviewId, institutionId, userId }).select('-resumeText -questions.tests -responses.audioUrl').lean(),

  cvAnalysesFor: (institutionId, userIds) => {
    if (!userIds.length) return Promise.resolve([]);
    return CVAnalysis.find({ institutionId, userId: { $in: userIds } }).select(CV_FIELDS).limit(MAX_ROWS).lean();
  },

  // Run and submit attempts (no source code, no answers). Legacy assessment-mode rows are left out.
  attemptsFor: (institutionId, userIds) => {
    if (!userIds.length) return Promise.resolve([]);
    return Attempt.find({ institutionId, userId: { $in: userIds }, runKind: { $in: ['run', 'submit'] }, assessmentSessionId: null })
      .select('userId questionId runKind verdict score scoreSource createdAt')
      .limit(MAX_ROWS).lean();
  },
};

export default dashboardRepo;
