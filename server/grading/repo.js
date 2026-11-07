// Mongo access for the grading queue. Every function filters by institutionId.
import Attempt from '../models/Attempt.js';

const LIST_FIELDS = 'userId questionId createdAt needsReview review.aiSuggestion.at review.aiSuggestion.total review.final.total review.final.at score';

const gradingRepo = {
  // status 'pending' = waiting for a lecturer; 'reviewed' = confirmed by a human. userIds null = whole institution.
  list: (institutionId, { status = 'pending', userIds = null, questionId = null } = {}) => {
    const q = { institutionId, runKind: 'submit' };
    if (status === 'reviewed') q['review.final.source'] = 'human';
    else q.needsReview = true;
    if (userIds) q.userId = { $in: userIds };
    if (questionId) q.questionId = questionId;
    return Attempt.find(q).select(LIST_FIELDS).sort({ createdAt: 1 }).limit(500).lean();
  },

  // Full item (answer included). Source code and per-test data are never needed here.
  find: (institutionId, id) =>
    Attempt.findOne({ _id: id, institutionId, runKind: 'submit', $or: [{ needsReview: true }, { 'review.final.source': 'human' }] })
      .select('-source -perTest').lean(),

  saveSuggestion: (institutionId, id, suggestion) =>
    Attempt.findOneAndUpdate({ _id: id, institutionId, needsReview: true }, { $set: { 'review.aiSuggestion': suggestion } }, { new: true })
      .select('-source -perTest').lean(),

  // Atomic: only succeeds while the item is still waiting, so a double confirm cannot overwrite a decision.
  confirm: (institutionId, id, final, score) =>
    Attempt.findOneAndUpdate(
      { _id: id, institutionId, needsReview: true },
      { $set: { 'review.final': final, score, scoreSource: 'human', verdict: 'reviewed', needsReview: false } },
      { new: true },
    ).select('-source -perTest').lean(),
};

export default gradingRepo;
