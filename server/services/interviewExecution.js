// Mock-interview coding answers: the server runs the submitted code itself. Whatever the browser claims about
// execution is ignored. If the sandbox is down the result says so; success is never fabricated.
import { run, ExecutionUnavailableError, UnsupportedLanguageError } from './execution/index.js';
import { gradeTests } from './grading.js';

const NOT_VERIFIED = { success: false, serverVerified: false, unavailable: true, executedAt: new Date() };

export const verifyCodeServerSide = async ({ question, code, language }) => {
  try {
    const tests = Array.isArray(question.tests) ? question.tests.filter((t) => t && t.expectedOutput !== undefined) : [];
    if (tests.length) {
      // Questions with tests (hidden from the candidate): mark against all of them
      const graded = await gradeTests({ language, source: code, tests, limits: {} });
      const passed = graded.perTest.filter((t) => t.passed).length;
      const executionResults = {
        output: `${passed}/${graded.perTest.length} tests passed`, error: '', success: graded.verdict === 'accepted', verdict: graded.verdict,
        serverVerified: true, testsPassed: passed, testsTotal: graded.perTest.length, statusCode: 200, executedAt: new Date(),
      };
      return { executionResults, forFeedback: { output: executionResults.output, error: '' }, executionSource: 'server' };
    }
    // AI-generated interview questions have no tests: run once with no input and record what really happened
    const r = await run({ language, source: code, stdin: '' });
    const executionResults = {
      output: r.stdout || '', error: r.compileOutput || r.stderr || '', success: r.status === 'accepted', verdict: r.status,
      serverVerified: true, executionTime: r.timeMs == null ? undefined : String(r.timeMs / 1000),
      memory: r.memoryKb == null ? undefined : String(r.memoryKb), statusCode: 200, executedAt: new Date(),
    };
    return { executionResults, forFeedback: { output: executionResults.output, error: executionResults.error }, executionSource: 'server' };
  } catch (error) {
    if (error instanceof ExecutionUnavailableError || error instanceof UnsupportedLanguageError) {
      // Honest record; the AI gets no execution result at all rather than a made-up one
      return { executionResults: { ...NOT_VERIFIED, executedAt: new Date() }, forFeedback: undefined, executionSource: 'unavailable' };
    }
    throw error;
  }
};
