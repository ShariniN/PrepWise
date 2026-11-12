import InterviewModel from '../../models/Interview.js';
import peopleRepo from '../people/people.repo.js';
import practiceRepo from '../practice/practice.repo.js';
import { generateAIFeedback, generateOverallInterviewFeedback } from '../../services/aiService.js';
import { generateWithFallback } from '../../services/geminiClient.js';
import { consumeAi } from '../../services/aiUsage.js';
import { AI_MODELS } from '../../config/ai.js';
import { findTargetRole, roleAsJobDescription } from '../../services/targetRoles.js';
import { normalizeLanguage } from '../../services/execution/languages.js';
import { verifyCodeServerSide } from './interviews.execution.js';
import { generateFallbackFeedback } from './interviews.fallbackFeedback.js';
import { buildPool } from './interviews.pool.js';
import {
  LEVELS, SLOT_TYPES, TOTAL_SLOTS, CODING_SLOT, READINESS_LEVEL, nextLevel, startLevelFor, adaptiveScore, levelsByNearness,
} from './interviews.adaptive.js';
import {
  validateAndSanitizeInput,
  validateLanguage,
  calculateFinalResults,
  fallbackCodingQuestion,
  expectedDurationFor
} from './interviews.questions.js';

// The AI calls of this module, behind one object so tests can stub them. `generate` builds the question pool
// (one call per interview, counted against the university's monthly AI cap).
export const interviewAi = {
  generate: async (prompt) => {
    await consumeAi();
    return generateWithFallback(prompt, { models: AI_MODELS, temperature: 0.4 });
  },
  scoreAnswer: (...args) => generateAIFeedback(...args),
  overallFeedback: (responses) => generateOverallInterviewFeedback(responses),
};

// Coding slot languages: every seeded coding question allows all three, and the question is picked for Python
// (the default), so the student can switch language without a new question.
export const CODING_LANGUAGES = ['javascript', 'python', 'java'];
const DEFAULT_CODING_LANGUAGE = 'python';
const MAX_JOB_DESCRIPTION = 5000;

const fail = (res, status, code, message) => res.status(status).json({ success: false, code, message, error: message });
const MESSAGES = {
  CV_REQUIRED: 'Upload your CV before you start a mock interview. The questions are based on it.',
  TARGET_ROLE_REQUIRED: 'Choose your target role in your profile before you start a mock interview.',
  READINESS_REQUIRED: 'Tell us how ready you feel, so the first question is at the right level.',
  ALREADY_ANSWERED: 'You have already answered this question.',
  INTERVIEW_COMPLETED: 'This interview is finished.',
};

const userIdOf = (req) => req.user?.userId || req.user?.id || req.user?._id;
// The interview lookup for this student, always within their institution.
const ownInterview = (req) => ({ _id: req.params.interviewId, userId: userIdOf(req), institutionId: req.user?.institutionId });

// Delivery coaching metrics (camera + speech), measured in the browser. Numbers only, never video.
// Strict: wrong types become null, numbers are clamped, unknown keys are dropped, nothing is rejected.
// These are coaching hints for the student and are never used for the score.
const DELIVERY_HEAD_MOVEMENT = ['low', 'medium', 'high'];
const finiteNumber = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clampNumber = (v, min, max, digits = 1) => {
  const n = finiteNumber(v);
  if (n === null) return null;
  const f = 10 ** digits;
  return Math.round(Math.min(max, Math.max(min, n)) * f) / f;
};
const clampInteger = (v, max) => {
  const n = finiteNumber(v);
  return n === null ? null : Math.round(Math.min(max, Math.max(0, n)));
};

export const sanitizeDeliveryMetrics = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const cameraUsed = raw.cameraUsed === true;
  return {
    cameraUsed,
    faceVisiblePct: cameraUsed ? clampNumber(raw.faceVisiblePct, 0, 100) : null,
    eyeContactPct: cameraUsed ? clampNumber(raw.eyeContactPct, 0, 100) : null,
    lookAwayCount: cameraUsed ? clampInteger(raw.lookAwayCount, 1000) : null,
    headMovement: cameraUsed && DELIVERY_HEAD_MOVEMENT.includes(raw.headMovement) ? raw.headMovement : null,
    wordsPerMinute: clampNumber(raw.wordsPerMinute, 0, 600, 0),
    fillerWordCount: clampInteger(raw.fillerWordCount, 10000),
    durationSec: clampNumber(raw.durationSec, 0, 7200)
  };
};

// Delivery summary across the answered questions, for the student's report.
export const summarizeDelivery = (responses = []) => {
  const list = responses
    .filter((r) => !r?.skipped && r?.deliveryMetrics)
    .map((r) => (r.deliveryMetrics.toObject ? r.deliveryMetrics.toObject() : r.deliveryMetrics));
  const camera = list.filter((m) => m.cameraUsed);
  const values = (key, from = list) => from.map((m) => m[key]).filter((v) => typeof v === 'number' && Number.isFinite(v));
  const mean = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
  const sum = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) : null);
  const levels = camera.map((m) => m.headMovement).filter((v) => DELIVERY_HEAD_MOVEMENT.includes(v));
  const counts = DELIVERY_HEAD_MOVEMENT.map((l) => levels.filter((v) => v === l).length);
  const wpm = values('wordsPerMinute');
  return {
    answersMeasured: list.length,
    answersWithCamera: camera.length,
    answersWithSpeech: wpm.length,
    faceVisiblePct: mean(values('faceVisiblePct', camera)),
    eyeContactPct: mean(values('eyeContactPct', camera)),
    lookAwayCount: sum(values('lookAwayCount', camera)),
    headMovement: levels.length ? DELIVERY_HEAD_MOVEMENT[counts.indexOf(Math.max(...counts))] : null,
    wordsPerMinute: mean(wpm),
    fillerWordCount: sum(values('fillerWordCount'))
  };
};

// ---------------------------------------------------------------- helpers

const plain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : { ...doc });

// A question as the student may see it: never hidden tests (older interviews stored them on the question).
export const clientQuestion = (q) => {
  if (!q) return null;
  const { tests, _id, ...safe } = plain(q);
  return safe;
};

const cvTextOf = (user) => (typeof user?.currentCV?.text === 'string' ? user.currentCV.text.trim() : '');

// The level the student's last completed adaptive interview finished on, or null for a first interview.
const previousLevelReached = async (userId, institutionId) => {
  const last = await InterviewModel.findOne(
    { userId, institutionId, status: 'completed', levelReached: { $in: LEVELS } },
    'levelReached',
    { sort: { completedAt: -1 } },
  );
  return last?.levelReached || null;
};

const targetRoleOf = async (user) => {
  if (!user?.targetRoleId) return null;
  const institution = await peopleRepo.getInstitution(user.institutionId);
  return findTargetRole(institution, user.targetRoleId);
};

// The coding slot: a published seeded practice question at this level, else the nearest level. Only the visible
// tests are copied onto the interview; all tests are loaded again from the practice set when the answer is marked.
const codingQuestionAt = async (level, institutionId) => {
  for (const tryLevel of levelsByNearness(level)) {
    const picked = await practiceRepo.findCodingQuestion({ institutionId, difficulty: tryLevel, language: DEFAULT_CODING_LANGUAGE });
    if (!picked) continue;
    const tests = await practiceRepo.listTests(picked._id);
    const languages = CODING_LANGUAGES.filter((l) => (picked.languages || []).includes(l));
    return {
      questionId: `s${CODING_SLOT}-${tryLevel}`,
      slot: CODING_SLOT,
      level: tryLevel,
      difficulty: tryLevel,
      type: 'coding',
      question: picked.title,
      statement: picked.statement || '',
      category: picked.topic?.[0] || 'coding',
      expectedDuration: picked.estimatedMinutes ? picked.estimatedMinutes * 60 : expectedDurationFor('coding'),
      practiceQuestionId: picked._id,
      languages: languages.length ? languages : [DEFAULT_CODING_LANGUAGE],
      language: DEFAULT_CODING_LANGUAGE,
      starterCode: picked.starterCode instanceof Map ? Object.fromEntries(picked.starterCode) : (picked.starterCode || null),
      timeLimitMs: picked.timeLimitMs,
      memoryLimitKb: picked.memoryLimitKb,
      visibleTests: tests.filter((t) => t.visible).map((t) => ({ id: String(t._id), input: t.input, expectedOutput: t.expectedOutput, comparison: t.comparison || 'trim' })),
      hiddenTestCount: tests.filter((t) => !t.visible).length,
    };
  }
  return { ...fallbackCodingQuestion(level), slot: CODING_SLOT, level, difficulty: level };
};

// The question for `slot` at `level`: from the stored pool, or the practice set for the coding slot.
const questionFor = async (interview, slot, level) => {
  if (slot === CODING_SLOT) return codingQuestionAt(level, interview.institutionId);
  const q = interview.pool?.[slot]?.[level] || interview.pool?.[String(slot)]?.[level];
  if (!q) throw new Error(`Interview ${interview._id} has no pool question for slot ${slot} at ${level}`);
  return { ...q, type: SLOT_TYPES[slot], slot, level, difficulty: level };
};

const isAdaptive = (interview) => !!interview.startLevel;

// ---------------------------------------------------------------- start screen

export const getInterviewSetup = async (req, res) => {
  try {
    const user = req.user;
    const role = await targetRoleOf(user);
    const previous = await previousLevelReached(userIdOf(req), user.institutionId);
    res.json({
      success: true,
      cv: { onFile: !!cvTextOf(user), fileName: cvTextOf(user) ? user.currentCV?.fileName || null : null, uploadedAt: cvTextOf(user) ? user.currentCV?.uploadedAt || null : null },
      targetRole: role ? { id: String(role._id), title: role.title } : null,
      firstInterview: !previous,
      startLevel: previous,
      totalSlots: TOTAL_SLOTS,
    });
  } catch (error) {
    console.error('Interview setup error:', error);
    res.status(500).json({ success: false, error: 'Failed to load the interview setup' });
  }
};

// ---------------------------------------------------------------- creation

// POST /create { readiness?, jobDescription? }: uses the CV on file and the student's target role.
export const createInterview = async (req, res) => {
  try {
    const userId = userIdOf(req);
    const user = req.user;
    const resumeText = cvTextOf(user);
    if (!resumeText) return fail(res, 409, 'CV_REQUIRED', MESSAGES.CV_REQUIRED);
    const role = await targetRoleOf(user);
    if (!role) return fail(res, 409, 'TARGET_ROLE_REQUIRED', MESSAGES.TARGET_ROLE_REQUIRED);

    const readiness = Object.hasOwn(READINESS_LEVEL, req.body?.readiness) ? req.body.readiness : null;
    const startLevel = startLevelFor({ previousLevelReached: await previousLevelReached(userId, user.institutionId), readiness });
    if (!startLevel) return fail(res, 400, 'READINESS_REQUIRED', MESSAGES.READINESS_REQUIRED);

    const jobDescription = typeof req.body?.jobDescription === 'string' ? req.body.jobDescription.trim().slice(0, MAX_JOB_DESCRIPTION) : '';
    const { pool, usedFallbackQuestions } = await buildPool({ resumeText, role, jobDescription, generate: interviewAi.generate });

    const interview = new InterviewModel({
      userId,
      institutionId: user.institutionId,
      targetRoleId: role._id,
      jobDescription: jobDescription || roleAsJobDescription(role),
      resumeText,
      questions: [],
      totalQuestions: TOTAL_SLOTS,
      startLevel,
      readiness,
      pool,
      currentQuestionIndex: 0,
      status: 'created',
      responses: [],
      usedFallbackQuestions,
      cvSource: 'profile',
      usedProfileCV: true,
    });
    interview.questions.push(await questionFor(interview, 0, startLevel));
    const saved = await interview.save();

    res.status(201).json({
      success: true,
      message: 'Interview created successfully',
      usedFallbackQuestions,
      interview: {
        id: saved._id,
        questions: saved.questions.map(clientQuestion),
        totalSlots: TOTAL_SLOTS,
        startLevel,
        status: saved.status,
        usedFallbackQuestions,
        createdAt: saved.createdAt,
      },
    });
  } catch (error) {
    console.error('Create interview error:', error);
    res.status(500).json({ success: false, error: 'Failed to create interview' });
  }
};

// Interview Operations
export const startInterview = async (req, res) => {
  try {
    const interview = await InterviewModel.findOne(ownInterview(req));

    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    if (interview.status !== 'created') {
      return res.status(400).json({ success: false, error: 'Interview already started or completed' });
    }

    interview.status = 'in_progress';
    interview.startedAt = new Date();
    interview.updatedAt = new Date();
    await interview.save();

    res.json({
      success: true,
      message: 'Interview started successfully',
      firstQuestion: clientQuestion(interview.questions[0]),
      totalQuestions: interview.questions.length,
      questions: interview.questions.map(clientQuestion)
    });
  } catch (error) {
    console.error('Start interview error:', error);
    res.status(500).json({ success: false, error: 'Failed to start interview' });
  }
};

// ---------------------------------------------------------------- answers

// The basic estimate must not reward an empty answer or the starting code handed back unchanged.
const squash = (s) => String(s ?? '').replace(/\s+/g, '');
const noCodeWritten = (question, code, language) => {
  const starter = question.starterCode?.[language];
  return !squash(code) || (typeof starter === 'string' && squash(code) === squash(starter));
};
const NO_CODE_ESTIMATE = {
  score: 0, responseType: 'completely-off-topic', strengths: [],
  improvements: ['No code was written. Change the starting code to solve the problem, then submit.'],
  detailedAnalysis: 'No code was written.', overallAssessment: 'No code was written.',
};

// Claims the answer to questionId with one conditional update: it matches only while the interview is not finished
// and the question has no answer and no claim yet. Two submits of the same answer at the same time cannot both match.
const claimAnswer = async (interview, questionId) => {
  const r = await InterviewModel.updateOne(
    {
      _id: interview._id, userId: interview.userId, institutionId: interview.institutionId,
      status: { $ne: 'completed' }, claimedAnswers: { $ne: questionId }, 'responses.questionId': { $ne: questionId },
    },
    { $push: { claimedAnswers: questionId } },
  );
  return r.modifiedCount === 1;
};
// Frees the claim when recording the answer failed, so the student can send it again.
const releaseAnswer = (interview, questionId) =>
  InterviewModel.updateOne({ _id: interview._id }, { $pull: { claimedAnswers: questionId } }).catch((e) => console.error('Could not release an answer claim:', e.message));

// Scores one answer exactly as before: the server runs coding answers itself, the AI scores, and the basic
// fallback (feedback.source 'fallback') is used when the AI is unavailable.
const scoreAnswer = async (question, { responseText, code, language }) => {
  let codeCheck = { executionResults: null, forFeedback: undefined, executionSource: 'none' };
  if (question.type === 'coding' && code) {
    // The adaptive coding slot is marked against all of its practice question's tests, loaded here on the server.
    const tests = question.practiceQuestionId ? await practiceRepo.listTests(question.practiceQuestionId) : undefined;
    const marked = tests ? { ...plain(question), tests } : question;
    const limits = question.practiceQuestionId
      ? Object.fromEntries(Object.entries({ timeMs: question.timeLimitMs, memoryKb: question.memoryLimitKb }).filter(([, v]) => v != null))
      : {};
    codeCheck = await verifyCodeServerSide({ question: marked, code, language, limits });
  }
  let analysis;
  try {
    analysis = await interviewAi.scoreAnswer(
      question.statement ? `${question.question}\n\n${question.statement}` : question.question,
      question.type, responseText, code, language, codeCheck.forFeedback,
    );
    analysis = { ...analysis, source: 'ai' };
  } catch (error) {
    console.error('AI feedback failed:', error.message);
    analysis = { ...generateFallbackFeedback(question.type, responseText, code, language, codeCheck.forFeedback), source: 'fallback' };
    if (question.type === 'coding' && noCodeWritten(question, code, language)) analysis = { ...analysis, ...NO_CODE_ESTIMATE };
  }
  analysis.executionSource = codeCheck.executionSource;
  return { analysis, executionResults: codeCheck.executionResults };
};

export const submitAnswer = async (req, res) => {
  try {
    const { questionId, responseTime, answerMode, responseText, code, language, skipped } = req.body;
    // req.body.executionResults is deliberately never read: only the server's own sandbox run counts.
    // req.body.deliveryMetrics is stored for the student's coaching only; it never reaches the AI or the score.
    const deliveryMetrics = sanitizeDeliveryMetrics(req.body?.deliveryMetrics);
    const interview = await InterviewModel.findOne(ownInterview(req), '+pool');
    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }
    if (interview.status === 'completed') {
      return fail(res, 409, 'INTERVIEW_COMPLETED', MESSAGES.INTERVIEW_COMPLETED);
    }

    const question = interview.questions.find(q => q.questionId === questionId);
    if (!question) {
      return res.status(400).json({ success: false, error: 'Question not found' });
    }
    if (interview.responses.some((r) => r.questionId === questionId)) {
      return fail(res, 409, 'ALREADY_ANSWERED', MESSAGES.ALREADY_ANSWERED);
    }

    // Input is checked before the answer is claimed, so a refused answer leaves nothing behind.
    const sanitizedResponseText = validateAndSanitizeInput(responseText);
    const sanitizedCode = validateAndSanitizeInput(code);
    let validatedLanguage = validateLanguage(language);
    if (!skipped) {
      if (!sanitizedResponseText || sanitizedResponseText.length === 0) {
        return res.status(400).json({ success: false, error: 'Response text is required' });
      }
      if (question.type === 'coding' && question.practiceQuestionId) {
        validatedLanguage = normalizeLanguage(language) || DEFAULT_CODING_LANGUAGE;
        const allowed = question.languages?.length ? question.languages : CODING_LANGUAGES;
        if (!allowed.includes(validatedLanguage)) {
          return res.status(400).json({ success: false, error: 'Answer this question in JavaScript, Python or Java.' });
        }
      }
    }

    if (!(await claimAnswer(interview, questionId))) {
      return fail(res, 409, 'ALREADY_ANSWERED', MESSAGES.ALREADY_ANSWERED);
    }

    let response;
    let nextQuestion = null;
    let level = null;
    let done;
    try {
      if (skipped) {
        response = {
          questionId,
          question: question.question,
          questionType: question.type,
          level: question.level,
          transcription: null,
          textResponse: 'Question skipped',
          code: null,
          language: null,
          responseTime: parseInt(responseTime) || 0,
          submittedAt: new Date(),
          feedback: null,
          skipped: true
        };
      } else {
        const { analysis, executionResults } = await scoreAnswer(question, {
          responseText: sanitizedResponseText, code: sanitizedCode, language: validatedLanguage,
        });
        response = {
          questionId,
          question: question.question,
          questionType: question.type,
          level: question.level,
          transcription: answerMode === 'audio' ? sanitizedResponseText : null,
          textResponse: sanitizedResponseText,
          code: sanitizedCode || null,
          language: question.type === 'coding' ? validatedLanguage : null,
          responseTime: parseInt(responseTime) || 0,
          recordingDuration: answerMode === 'audio' ? parseInt(responseTime) : null,
          submittedAt: new Date(),
          feedback: analysis,
          skipped: false,
          executionResults,
          deliveryMetrics
        };
      }

      interview.responses.push(response);
      interview.currentQuestionIndex = interview.responses.length;
      interview.updatedAt = new Date();
      if (interview.status === 'created') {
        interview.status = 'in_progress';
        interview.startedAt = new Date();
      }

      // Adaptive interviews: the next slot's question at the adapted level, or the end of the interview.
      done = interview.responses.length >= interview.questions.length;
      if (isAdaptive(interview) && typeof question.slot === 'number') {
        level = nextLevel(question.level, adaptiveScore(response));
        if (question.slot < TOTAL_SLOTS - 1) {
          nextQuestion = await questionFor(interview, question.slot + 1, level);
          interview.questions.push(nextQuestion);
          done = false;
        } else {
          interview.levelReached = level;
          await finalizeInterview(interview);
          done = true;
        }
      }

      await interview.save();
    } catch (error) {
      await releaseAnswer(interview, questionId);
      throw error;
    }

    res.json({
      success: true,
      message: skipped ? 'Question skipped successfully' : 'Answer submitted successfully',
      feedback: response.feedback,
      ...(skipped ? {} : { deliveryMetrics }),
      nextQuestion: nextQuestion ? clientQuestion(interview.questions.at(-1)) : null,
      level,
      done,
      progress: {
        current: interview.responses.length,
        total: isAdaptive(interview) ? TOTAL_SLOTS : interview.questions.length,
        completed: done
      }
    });
  } catch (error) {
    console.error('Submit answer error:', error);
    res.status(500).json({ success: false, error: 'Failed to process answer' });
  }
};

// ---------------------------------------------------------------- completion

// The level an interview ended on when the student stops before the last slot.
const levelAfterLastAnswer = (interview) => {
  const last = interview.responses.at(-1);
  if (!last) return interview.startLevel;
  return nextLevel(last.level || interview.startLevel, adaptiveScore(last));
};

// Overall feedback, duration and status. Called when the last slot is answered, or by PUT /complete.
const finalizeInterview = async (interview) => {
  // Only answers with a real score feed the overall feedback. If the AI scored none of them, asking it for an
  // overall judgement would only restate the basic estimates, so the plain summary is used instead.
  const scoredResponses = interview.responses.filter(isScoredAnswer);
  let overallAnalysis;
  if (scoredResponses.length === 0) {
    overallAnalysis = generateFastOverallFeedback(interview.responses);
  } else {
    try {
      overallAnalysis = await interviewAi.overallFeedback(interview.responses.filter((r) => r.skipped || isScoredAnswer(r)));
    } catch (feedbackError) {
      console.error('Overall feedback generation failed:', feedbackError.message);
      overallAnalysis = generateFastOverallFeedback(interview.responses);
    }
  }

  interview.status = 'completed';
  interview.completedAt = new Date();
  if (isAdaptive(interview) && !interview.levelReached) interview.levelReached = levelAfterLastAnswer(interview);

  if (interview.startedAt) {
    interview.totalDuration = Math.round((interview.completedAt - interview.startedAt) / 1000);
  } else {
    interview.totalDuration = 1800;
  }

  const finalResults = calculateFinalResults(interview.responses, interview.totalDuration);
  interview.overallFeedback = {
    ...overallAnalysis.feedback,
    ...finalResults
  };
  interview.updatedAt = new Date();
  return finalResults;
};

const levelsOf = (interview) => ({ startLevel: interview.startLevel ?? null, levelReached: interview.levelReached ?? null });

export const completeInterview = async (req, res) => {
  try {
    const interview = await InterviewModel.findOne(ownInterview(req));

    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    if (interview.status === 'completed') {
      const results = calculateFinalResults(interview.responses, interview.totalDuration || 0);
      return res.json({
        success: true,
        message: 'Interview already completed',
        results: {
          ...results,
          ...(isAdaptive(interview) ? { feedback: interview.overallFeedback, ...levelsOf(interview) } : {}),
          deliverySummary: summarizeDelivery(interview.responses),
        }
      });
    }

    const finalResults = await finalizeInterview(interview);
    await interview.save();

    res.json({
      success: true,
      message: 'Interview completed successfully',
      results: {
        ...finalResults,
        feedback: interview.overallFeedback,
        questionsAnswered: interview.responses.length,
        totalQuestions: interview.questions.length,
        ...(isAdaptive(interview) ? levelsOf(interview) : {}),
        deliverySummary: summarizeDelivery(interview.responses)
      }
    });
  } catch (error) {
    console.error('Complete interview error:', error);
    res.status(500).json({ success: false, error: 'Failed to complete interview' });
  }
};

// An answer with a real score: answered, and not scored by the basic fallback (feedback.source === 'fallback').
const isScoredAnswer = (r) => !r.skipped && !!r.feedback && r.feedback.source !== 'fallback';

// Plain overall summary without AI, from the answers that have a real score only.
const generateFastOverallFeedback = (responses) => {
  const scored = responses.filter(isScoredAnswer);
  const excluded = responses.filter((r) => !r.skipped && r.feedback && r.feedback.source === 'fallback').length;
  if (scored.length === 0) {
    return {
      score: null,
      feedback: {
        readinessLevel: null,
        strengths: [],
        improvements: [],
        recommendations: [],
        generalFeedback: excluded
          ? `AI feedback was unavailable for all ${excluded} answered questions, so this interview has no overall score. Try another interview later.`
          : 'No questions were answered, so there is no overall score.',
        categoryScores: null
      }
    };
  }
  const averageScore = scored.reduce((sum, r) => sum + (r.feedback?.score || 0), 0) / scored.length;

  const readinessLevel = averageScore >= 75 ? 'Ready for Intern Position' :
                        averageScore >= 60 ? 'Nearly Ready' :
                        averageScore >= 45 ? 'Needs Development' : 'Not Ready Yet';

  return {
    score: Math.round(averageScore),
    feedback: {
      readinessLevel,
      strengths: ['Completed all interview questions'],
      improvements: ['Focus on technical fundamentals', 'Practice explaining concepts clearly'],
      recommendations: ['Build personal projects', 'Practice coding problems'],
      generalFeedback: `Average ${averageScore.toFixed(1)}% over ${scored.length} AI-scored answers` +
        (excluded ? ` (${excluded} answered without AI feedback ${excluded === 1 ? 'is' : 'are'} not counted).` : '.'),
      categoryScores: calculateCategoryScores(scored)
    }
  };
};

const calculateCategoryScores = (responses) => {
  const byType = (type) => responses.filter(r => r.questionType === type);
  const avgScore = (arr) => arr.length > 0
    ? Math.round(arr.reduce((sum, r) => sum + (r.feedback?.score || 0), 0) / arr.length)
    : 0;

  return {
    technicalKnowledge: avgScore(byType('technical')),
    codingAbility: avgScore(byType('coding')),
    behavioralSkills: avgScore(byType('behavioral')),
    communication: 5
  };
};

// Interview Retrieval
export const getInterviewFeedback = async (req, res) => {
  try {
    const interview = await InterviewModel.findOne(ownInterview(req));

    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    const finalResults = calculateFinalResults(interview.responses, interview.totalDuration || 0);

    res.json({
      success: true,
      feedback: {
        ...finalResults,
        feedback: interview.overallFeedback,
        responses: interview.responses,
        recommendations: interview.overallFeedback?.recommendations || [],
        ...(isAdaptive(interview) ? { ...levelsOf(interview), questions: interview.questions.map(clientQuestion) } : {}),
        deliverySummary: summarizeDelivery(interview.responses)
      }
    });
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ success: false, error: 'Failed to get feedback' });
  }
};

export const getUserInterviews = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    const { page = 1, limit = 10 } = req.query;

    const interviews = await InterviewModel.find({ userId, institutionId: req.user?.institutionId })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('status overallFeedback createdAt completedAt totalDuration');

    const total = await InterviewModel.countDocuments({ userId, institutionId: req.user?.institutionId });

    res.json({
      success: true,
      interviews,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        count: interviews.length,
        totalRecords: total
      }
    });
  } catch (error) {
    console.error('Get user interviews error:', error);
    res.status(500).json({ success: false, error: 'Failed to get interview history' });
  }
};

// The interview with the questions asked so far. The pool is never loaded here (select: false) and never sent.
export const getInterview = async (req, res) => {
  try {
    const interview = await InterviewModel.findOne(ownInterview(req));

    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    const json = typeof interview.toJSON === 'function' ? interview.toJSON() : { ...interview };
    delete json.pool;
    res.json({ success: true, interview: { ...json, questions: (interview.questions || []).map(clientQuestion) } });
  } catch (error) {
    console.error('Get interview error:', error);
    res.status(500).json({ success: false, error: 'Failed to get interview details' });
  }
};
