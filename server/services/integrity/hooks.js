// Called when a student finishes a session. Failures are logged and swallowed: analysis must never stop a student
// from finishing, and nothing here can change a mark.
import { analyseSession } from './analysis.js';

export const onSessionFinished = async (institutionId, sessionId) => {
  try {
    await analyseSession(institutionId, sessionId);
  } catch (error) {
    console.error('Integrity analysis failed:', error.message);
  }
};
