import userModel from '../models/userModel.js';
import InterviewModel from '../models/InterviewModel.js';
import CVAnalysis from '../models/CVAnalysisModel.js';
import SkillsAssessment from '../models/SkillAssessorModel.js';
import ConsentRecord from '../models/ConsentRecord.js';
import Enrollment from '../models/Enrollment.js';

// Everything here is keyed by the caller's own userId, never by a client-supplied id.
const complianceRepo = {
  findUser: (userId) => userModel.findById(userId),

  collect: async (userId) => {
    const [interviews, analyses, skills, consents, enrollments] = await Promise.all([
      InterviewModel.find({ userId }).lean(),
      CVAnalysis.find({ userId }).lean(),
      SkillsAssessment.find({ userId }).lean(),
      ConsentRecord.find({ userId }).lean(),
      Enrollment.find({ userId }).lean(),
    ]);
    return { interviews, analyses, skills, consents, enrollments };
  },

  deleteAll: async (userId) => {
    const counts = {};
    for (const [name, model] of [
      ['interviews', InterviewModel], ['analyses', CVAnalysis], ['skills', SkillsAssessment],
      ['consents', ConsentRecord], ['enrollments', Enrollment],
    ]) {
      counts[name] = (await model.deleteMany({ userId })).deletedCount;
    }
    await userModel.deleteOne({ _id: userId });
    return counts;
  },

  addConsent: (doc) => ConsentRecord.create(doc),
};

export default complianceRepo;
