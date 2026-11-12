import mongoose from 'mongoose';
import userModel from '../../models/User.js';
import InterviewModel from '../../models/Interview.js';
import CVAnalysis from '../../models/CvAnalysis.js';
import ConsentRecord from '../../models/ConsentRecord.js';
import Attempt from '../../models/Attempt.js';

// Collections written by features that have since been removed (courses/enrolment, skills self-assessment, edit
// events). Older databases may still hold rows keyed by userId, so account deletion clears them through the raw driver.
const LEGACY_COLLECTIONS = ['enrollments', 'skills_assessments', 'editeventbatches'];

// Everything here is keyed by the caller's own userId (and institutionId for practice attempts), never by a
// client-supplied id.
const complianceRepo = {
  findUser: (userId) => userModel.findById(userId),

  collect: async (userId, institutionId) => {
    const [interviews, analyses, consents, attempts] = await Promise.all([
      InterviewModel.find({ userId }).lean(),
      CVAnalysis.find({ userId }).lean(),
      ConsentRecord.find({ userId }).lean(),
      Attempt.find({ userId, institutionId }).lean(),
    ]);
    return { interviews, analyses, consents, attempts };
  },

  deleteAll: async (userId, institutionId) => {
    const counts = {};
    for (const [name, model, filter] of [
      ['interviews', InterviewModel, { userId }], ['analyses', CVAnalysis, { userId }], ['consents', ConsentRecord, { userId }],
      ['attempts', Attempt, { userId, institutionId }],
    ]) {
      counts[name] = (await model.deleteMany(filter)).deletedCount;
    }
    for (const name of LEGACY_COLLECTIONS) {
      const oid = mongoose.Types.ObjectId.isValid(String(userId)) ? new mongoose.Types.ObjectId(String(userId)) : userId;
      await mongoose.connection.collection(name).deleteMany({ userId: oid });
    }
    await userModel.deleteOne({ _id: userId });
    return counts;
  },

  addConsent: (doc) => ConsentRecord.create(doc),
};

export default complianceRepo;
