// In-memory stand-in for the one conditional update the interview controller uses to claim an answer. It applies the
// same filter MongoDB would (_id, userId, institutionId, status $ne, claimedAnswers $ne, responses.questionId $ne)
// to the in-memory interview, synchronously, so two concurrent submits race exactly as they would against the
// database: the first update matches and pushes the claim, the second matches nothing.
import { mock } from 'node:test';
import InterviewModel from '../../models/Interview.js';

const same = (a, b) => String(a ?? '') === String(b ?? '');

// `findDoc(id)` returns the in-memory interview with that _id (or null). Returns the list of updates seen.
export const installAnswerClaims = (findDoc) => {
  const updates = [];
  mock.method(InterviewModel, 'updateOne', async (filter, update) => {
    updates.push({ filter, update });
    const doc = findDoc(filter._id);
    if (!doc) return { matchedCount: 0, modifiedCount: 0 };
    if (update.$pull?.claimedAnswers !== undefined) {
      const before = (doc.claimedAnswers || []).length;
      doc.claimedAnswers = (doc.claimedAnswers || []).filter((q) => q !== update.$pull.claimedAnswers);
      return { matchedCount: 1, modifiedCount: before === doc.claimedAnswers.length ? 0 : 1 };
    }
    const questionId = update.$push?.claimedAnswers;
    const matches = ('userId' in filter ? same(doc.userId, filter.userId) : true)
      && ('institutionId' in filter ? same(doc.institutionId, filter.institutionId) : true)
      && (!filter.status?.$ne || doc.status !== filter.status.$ne)
      && !(doc.claimedAnswers || []).includes(filter.claimedAnswers?.$ne)
      && !(doc.responses || []).some((r) => r.questionId === filter['responses.questionId']?.$ne);
    if (!matches || questionId === undefined) return { matchedCount: 0, modifiedCount: 0 };
    doc.claimedAnswers = [...(doc.claimedAnswers || []), questionId];
    return { matchedCount: 1, modifiedCount: 1 };
  });
  return updates;
};
