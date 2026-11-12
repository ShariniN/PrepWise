import { useState, useCallback } from 'react';
import api, { errorMessage } from '../../../lib/apiClient';

// An error from the interview API, with the server's code (CV_REQUIRED, READINESS_REQUIRED, ...) when it sent one.
export class InterviewApiError extends Error {
  constructor(error, fallback) {
    super(error?.response?.data?.message || error?.response?.data?.error || errorMessage(error, fallback));
    this.name = 'InterviewApiError';
    this.status = error?.response?.status ?? null;
    this.code = error?.response?.data?.code ?? null;
  }
}

const call = async (request, fallback) => {
  try {
    return (await request()).data;
  } catch (error) {
    throw new InterviewApiError(error, fallback);
  }
};

// The adaptive interview: the server sends one question at a time, and each answer's response carries the next one.
export const useInterview = () => {
  const [interview, setInterview] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [responses, setResponses] = useState([]);
  const [questionFeedbacks, setQuestionFeedbacks] = useState({});

  // CV on file, target role, and whether this is the student's first interview (then readiness is asked).
  const getSetup = useCallback(() => call(() => api.get('/api/interviews/setup'), 'Could not load the interview setup'), []);

  const createInterview = useCallback(async ({ readiness, jobDescription }) => {
    const body = {};
    if (readiness) body.readiness = readiness;
    if (jobDescription?.trim()) body.jobDescription = jobDescription.trim();
    const result = await call(() => api.post('/api/interviews/create', body), 'Failed to create the interview');
    const first = result.interview?.questions?.[0];
    if (!first) throw new Error('The interview has no first question');
    setInterview({ ...result.interview, usedFallbackQuestions: !!result.usedFallbackQuestions });
    setQuestions([first]);
    setCurrentQuestion(first);
    setQuestionIndex(0);
    return { interview: result.interview, firstQuestion: first };
  }, []);

  const send = useCallback(async (interviewId, body, fallback) => {
    const result = await call(() => api.post(`/api/interviews/${interviewId}/submit-answer`, body), fallback);
    if (!result.success) throw new Error(result.error || fallback);
    return result;
  }, []);

  // { feedback, nextQuestion, level, done }. The feedback carries the server's execution record and the
  // delivery numbers exactly as the server stored them.
  const submitAnswer = useCallback(async (interviewId, submitData) => {
    const result = await send(interviewId, submitData, 'Failed to submit answer');
    const execution = result.executionResults || result.feedback?.executionResults;
    const delivery = 'deliveryMetrics' in result ? { deliveryMetrics: result.deliveryMetrics } : {};
    const feedback = result.feedback && typeof result.feedback === 'object'
      ? { ...result.feedback, execution, executionSource: result.feedback.executionSource, ...delivery }
      : result.feedback;
    return { feedback, nextQuestion: result.nextQuestion || null, level: result.level || null, done: !!result.done };
  }, [send]);

  const skipQuestion = useCallback(async (interviewId, question) => {
    const result = await send(interviewId, {
      questionId: question.questionId, responseTime: 5, answerMode: 'skipped', skipped: true,
    }, 'Failed to skip question');
    return {
      feedback: { score: 0, strengths: [], improvements: ['Question was skipped'], detailedAnalysis: 'Question was skipped', responseType: 'skipped' },
      nextQuestion: result.nextQuestion || null, level: result.level || null, done: !!result.done,
    };
  }, [send]);

  // Show the next question that came with the last answer.
  const advance = useCallback((nextQuestion) => {
    setQuestions((prev) => [...prev, nextQuestion]);
    setCurrentQuestion(nextQuestion);
    setQuestionIndex((i) => i + 1);
  }, []);

  // Completing is idempotent: the last answer already completed the interview on the server.
  const completeInterview = useCallback(async (interviewId) => {
    await call(() => api.put(`/api/interviews/${interviewId}/complete`), 'Failed to complete interview');
    try {
      const result = (await api.get(`/api/interviews/${interviewId}/feedback`)).data;
      return result.success && result.feedback ? result.feedback : null;
    } catch {
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setInterview(null);
    setQuestions([]);
    setCurrentQuestion(null);
    setQuestionIndex(0);
    setResponses([]);
    setQuestionFeedbacks({});
  }, []);

  return {
    interview,
    questions,
    currentQuestion,
    questionIndex,
    responses,
    questionFeedbacks,
    setResponses,
    setQuestionFeedbacks,
    getSetup,
    createInterview,
    submitAnswer,
    skipQuestion,
    advance,
    completeInterview,
    reset
  };
};
