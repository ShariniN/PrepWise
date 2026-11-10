import InterviewModel from '../models/InterviewModel.js';
import userModel from '../models/userModel.js';
import pdfUpload, { NOT_PDF_MESSAGE } from '../middleware/pdfUpload.js';
import pdfParse from 'pdf-parse';
import { generateInterviewQuestions, generateAIFeedback, generateOverallInterviewFeedback } from './services/aiService.js';
import { generateStarterCode, selectBestLanguage } from './services/codeGenerationService.js';
import { verifyCodeServerSide } from '../services/interviewExecution.js';
import { generateFallbackFeedback } from './services/fallbackFeedbackService.js';
import { 
  validateAndSanitizeInput, 
  validateLanguage, 
  normalizeQuestionType,
  calculateFinalResults,
  getFallbackQuestions
} from './services/utilityService.js';

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

// PDF only, by type and by content; a refused file is answered with a 400 by the middleware itself.
const cvUpload = pdfUpload('cv', 5 * 1024 * 1024);

export const processCV = async (req, res) => {
  try {
    cvUpload(req, res, async () => {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No PDF file provided' });
      }

      const userId = req.user?.userId || req.user?.id || req.user?._id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      try {
        const pdfData = await pdfParse(req.file.buffer);
        const extractedText = pdfData.text;
        
        if (!extractedText || extractedText.trim().length === 0) {
          return res.status(400).json({
            success: false,
            error: 'Could not extract text from the PDF.'
          });
        }

        if (extractedText.length < 50) {
          return res.status(400).json({
            success: false,
            error: 'CV text appears to be too short.'
          });
        }

        const cleanedText = extractedText
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .replace(/[ \t]{2,}/g, ' ')
          .trim();

        res.json({
          success: true,
          message: 'PDF processed successfully',
          data: {
            text: cleanedText,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            textLength: cleanedText.length,
            processedAt: new Date().toISOString()
          }
        });

      } catch (extractionError) {
        console.error('PDF extraction error:', extractionError);
        res.status(400).json({ success: false, error: NOT_PDF_MESSAGE, message: NOT_PDF_MESSAGE });
      }
    });

  } catch (error) {
    console.error('Process CV error:', error);
    res.status(500).json({ success: false, error: 'Internal server error while processing PDF' });
  }
};

// Interview Creation
export const createInterview = async (req, res) => {
  try {
    const { jobDescription, resumeText } = req.body;
    const userId = req.user.userId || req.user.id || req.user._id;

    console.log('=== CREATE INTERVIEW DEBUG ===');
    console.log('User ID:', userId);
    console.log('Job Description length:', jobDescription?.length || 0);
    console.log('Resume Text length:', resumeText?.length || 0);

    if (!jobDescription || !resumeText) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: jobDescription and resumeText are required'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated properly. Please log in again.'
      });
    }

    let questions;
    let usedFallbackQuestions = false;
    try {
      console.log('🤖 Calling generateInterviewQuestions...');
      const rawQuestions = await generateInterviewQuestions(resumeText, jobDescription);
      console.log('📊 Raw questions received:', rawQuestions.length);
      
      // Process questions to add starter code and normalize types
      questions = rawQuestions.slice(0, 10).map((q, index) => {
        console.log(`Processing question ${index + 1}:`, {
          id: q.questionId,
          type: q.type,
          hasQuestion: !!q.question,
          questionLength: q.question?.length
        });
        
        const questionId = q.questionId || `q${index + 1}`;
        const type = normalizeQuestionType(q.type || 'technical');
        
        let language = null;
        if (type === 'coding') {
          language = q.language || selectBestLanguage(resumeText, q.language);
          console.log(`🔧 Coding question - selected language: ${language}`);
        }
        
        const processedQuestion = {
          questionId,
          type,
          question: (q.question || 'Generated question').replace(/\n/g, ' ').trim(),
          category: q.category || 'general',
          difficulty: q.difficulty || 'easy',
          expectedDuration: type === 'coding' ? 300 : (type === 'behavioral' ? 180 : 150),
          followUpQuestions: Array.isArray(q.followUpQuestions) ? q.followUpQuestions : [],
          starterCode: type === 'coding' ? generateStarterCode(q.question || '', language) : null,
          language,
          cvReference: q.cvReference || 'General experience',
          jdAlignment: q.jdAlignment || 'Role requirements'
        };
        
        console.log(`✅ Question ${index + 1} processed successfully`);
        return processedQuestion;
      });
      
      console.log('✅ All questions processed successfully:', questions.length);
    } catch (questionError) {
      console.error('❌ Question generation failed:', questionError);
      console.error('Error stack:', questionError.stack);
      console.log('🔄 Using fallback questions');
      questions = getFallbackQuestions();
      usedFallbackQuestions = true;
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate interview questions. Please try again.'
      });
    }

    const interview = new InterviewModel({
      userId,
      institutionId: req.user.institutionId,
      jobDescription: jobDescription.trim(),
      resumeText: resumeText.trim(),
      questions,
      totalQuestions: questions.length,
      currentQuestionIndex: 0,
      status: 'created',
      responses: [],
      usedFallbackQuestions,
      cvSource: 'manual',
      usedProfileCV: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const savedInterview = await interview.save();

    console.log('✅ Interview created successfully:', savedInterview._id);

    res.status(201).json({
      success: true,
      message: 'Interview created successfully',
      usedFallbackQuestions,
      interview: {
        id: savedInterview._id,
        _id: savedInterview._id,
        userId: savedInterview.userId,
        jobDescription: savedInterview.jobDescription,
        questions: savedInterview.questions,
        totalQuestions: savedInterview.totalQuestions,
        status: savedInterview.status,
        cvSource: savedInterview.cvSource,
        usedFallbackQuestions: !!savedInterview.usedFallbackQuestions,
        createdAt: savedInterview.createdAt
      }
    });

  } catch (error) {
    console.error('Create interview error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create interview',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const createInterviewWithProfileCV = async (req, res) => {
  try {
    const { jobDescription } = req.body;
    const userId = req.user.userId || req.user.id || req.user._id;

    console.log('=== CREATE INTERVIEW WITH PROFILE CV DEBUG ===');
    console.log('User ID:', userId);
    console.log('Job Description length:', jobDescription?.length || 0);

    if (!jobDescription) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: jobDescription is required'
      });
    }

    const user = await userModel.findById(userId);
    if (!user || !user.hasCV) {
      return res.status(400).json({
        success: false,
        error: 'No CV found in user profile. Please upload a CV first.'
      });
    }

    let actualCVText;
    try {
      actualCVText = user.getCVText();
    } catch (cvError) {
      actualCVText = user.currentCV?.text || '';
    }

    if (!actualCVText || actualCVText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'CV text is empty or corrupted. Please re-upload your CV.'
      });
    }

    console.log('CV Text length:', actualCVText.length);

    let questions;
    let usedFallbackQuestions = false;
    try {
      console.log('🤖 Calling generateInterviewQuestions with profile CV...');
      const rawQuestions = await generateInterviewQuestions(actualCVText, jobDescription);
      console.log('📊 Raw questions received:', rawQuestions.length);
      
      questions = rawQuestions.slice(0, 10).map((q, index) => {
        console.log(`Processing question ${index + 1}:`, {
          id: q.questionId,
          type: q.type,
          hasQuestion: !!q.question
        });
        
        const questionId = q.questionId || `q${index + 1}`;
        const type = normalizeQuestionType(q.type || 'technical');
        let language = type === 'coding' ? (q.language || selectBestLanguage(actualCVText, q.language)) : null;
        
        const processedQuestion = {
          questionId,
          type,
          question: (q.question || 'Generated question').replace(/\n/g, ' ').trim(),
          category: q.category || 'general',
          difficulty: q.difficulty || 'easy',
          expectedDuration: type === 'coding' ? 300 : (type === 'behavioral' ? 180 : 150),
          followUpQuestions: Array.isArray(q.followUpQuestions) ? q.followUpQuestions : [],
          starterCode: type === 'coding' ? generateStarterCode(q.question || '', language) : null,
          language
        };
        
        console.log(`✅ Question ${index + 1} processed successfully`);
        return processedQuestion;
      });
      
      console.log('✅ All questions processed successfully:', questions.length);
    } catch (questionError) {
      console.error('❌ Question generation failed:', questionError);
      console.error('Error stack:', questionError.stack);
      console.log('🔄 Using fallback questions');
      questions = getFallbackQuestions();
      usedFallbackQuestions = true;
    }

    const interview = new InterviewModel({
      userId,
      institutionId: req.user.institutionId,
      jobDescription: jobDescription.trim(),
      resumeText: actualCVText,
      questions,
      totalQuestions: questions.length,
      currentQuestionIndex: 0,
      status: 'created',
      responses: [],
      usedFallbackQuestions,
      cvSource: 'profile',
      usedProfileCV: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const savedInterview = await interview.save();

    console.log('✅ Interview with profile CV created successfully:', savedInterview._id);

    res.status(201).json({
      success: true,
      message: 'Interview created successfully with profile CV',
      usedFallbackQuestions,
      interview: {
        id: savedInterview._id,
        questions: savedInterview.questions,
        totalQuestions: savedInterview.totalQuestions,
        status: savedInterview.status,
        cvSource: savedInterview.cvSource,
        usedFallbackQuestions: !!savedInterview.usedFallbackQuestions,
        createdAt: savedInterview.createdAt
      }
    });

  } catch (error) {
    console.error('Create interview with profile CV error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create interview with profile CV'
    });
  }
};

// Interview Operations
export const startInterview = async (req, res) => {
  try {
    const { interviewId } = req.params;
    const userId = req.user?.userId || req.user?.id || req.user?._id;

    const interview = await InterviewModel.findOne({ _id: interviewId, userId });

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
      firstQuestion: interview.questions[0],
      totalQuestions: interview.questions.length,
      questions: interview.questions
    });
  } catch (error) {
    console.error('Start interview error:', error);
    res.status(500).json({ success: false, error: 'Failed to start interview' });
  }
};

export const getNextQuestion = async (req, res) => {
  try {
    const { interviewId } = req.params;
    const userId = req.user?.userId || req.user?.id || req.user?._id;

    const interview = await InterviewModel.findOne({ _id: interviewId, userId });

    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    const answeredCount = interview.responses.length;

    if (answeredCount >= interview.questions.length) {
      return res.json({
        success: true,
        completed: true,
        message: 'All questions completed',
        progress: {
          current: answeredCount,
          total: interview.questions.length,
          percentage: 100
        }
      });
    }

    const nextQuestion = interview.questions[answeredCount];
    res.json({
      success: true,
      question: nextQuestion?.toObject ? (({ tests, ...safe }) => safe)(nextQuestion.toObject()) : (({ tests, ...safe }) => safe)(nextQuestion),
      progress: {
        current: answeredCount + 1,
        total: interview.questions.length,
        percentage: Math.round(((answeredCount + 1) / interview.questions.length) * 100)
      }
    });
  } catch (error) {
    console.error('Get next question error:', error);
    res.status(500).json({ success: false, error: 'Failed to get next question' });
  }
};

export const submitAnswer = async (req, res) => {
  try {
    const { interviewId } = req.params;
    const { questionId, responseTime, answerMode, responseText, code, language, skipped } = req.body;
    // req.body.executionResults is deliberately never read: only the server's own sandbox run counts.
    // req.body.deliveryMetrics is stored for the student's coaching only; it never reaches the AI or the score.
    const deliveryMetrics = sanitizeDeliveryMetrics(req.body?.deliveryMetrics);
    const userId = req.user?.userId || req.user?.id || req.user?._id;

    const interview = await InterviewModel.findOne({ _id: interviewId, userId });

    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    const question = interview.questions.find(q => q.questionId === questionId);
    if (!question) {
      return res.status(400).json({ success: false, error: 'Question not found' });
    }

    // Handle skipped questions - no processing
    if (skipped) {
      const response = {
        questionId,
        question: question.question,
        questionType: question.type,
        transcription: null,
        textResponse: 'Question skipped',
        code: null,
        language: null,
        responseTime: parseInt(responseTime) || 0,
        submittedAt: new Date(),
        feedback: null,
        skipped: true
      };

      interview.responses.push(response);
      interview.currentQuestionIndex = interview.responses.length;
      interview.updatedAt = new Date();

      if (interview.status === 'created') {
        interview.status = 'in_progress';
        interview.startedAt = new Date();
      }

      await interview.save();

      return res.json({
        success: true,
        message: 'Question skipped successfully',
        progress: {
          current: interview.responses.length,
          total: interview.questions.length,
          completed: interview.responses.length >= interview.questions.length
        }
      });
    }

    // Regular answer processing
    const sanitizedResponseText = validateAndSanitizeInput(responseText);
    const sanitizedCode = validateAndSanitizeInput(code);
    const validatedLanguage = validateLanguage(language);

    if (!sanitizedResponseText || sanitizedResponseText.length === 0) {
      return res.status(400).json({ success: false, error: 'Response text is required' });
    }

    const verified = question.type === 'coding' && sanitizedCode
      ? await verifyCodeServerSide({ question, code: sanitizedCode, language: validatedLanguage })
      : { executionResults: null, forFeedback: undefined, executionSource: 'none' };
    const executionResults = verified.executionResults;

    let analysis;
    try {
      analysis = await generateAIFeedback(
        question.question,
        question.type,
        sanitizedResponseText,
        sanitizedCode,
        validatedLanguage,
        verified.forFeedback
      );
      analysis = { ...analysis, source: 'ai' };
    } catch (error) {
      console.error('AI feedback failed:', error.message);
      analysis = { ...generateFallbackFeedback(question.type, sanitizedResponseText, sanitizedCode, validatedLanguage, verified.forFeedback), source: 'fallback' };
    }
    analysis.executionSource = verified.executionSource;

    const response = {
      questionId,
      question: question.question,
      questionType: question.type,
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

    interview.responses.push(response);
    interview.currentQuestionIndex = interview.responses.length;
    interview.updatedAt = new Date();

    if (interview.status === 'created') {
      interview.status = 'in_progress';
      interview.startedAt = new Date();
    }

    await interview.save();

    res.json({
      success: true,
      message: 'Answer submitted successfully',
      feedback: analysis,
      deliveryMetrics,
      progress: {
        current: interview.responses.length,
        total: interview.questions.length,
        completed: interview.responses.length >= interview.questions.length
      }
    });
  } catch (error) {
    console.error('Submit answer error:', error);
    res.status(500).json({ success: false, error: 'Failed to process answer' });
  }
};

export const completeInterview = async (req, res) => {
  try {
    const { interviewId } = req.params;
    const userId = req.user?.userId || req.user?.id || req.user?._id;

    const interview = await InterviewModel.findOne({ _id: interviewId, userId });

    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    if (interview.status === 'completed') {
      const results = calculateFinalResults(interview.responses, interview.totalDuration || 0);
      return res.json({
        success: true,
        message: 'Interview already completed',
        results: { ...results, deliverySummary: summarizeDelivery(interview.responses) }
      });
    }

    // Only answers with a real score feed the overall feedback. If the AI scored none of them, asking it for an
    // overall judgement would only restate the basic estimates, so the plain summary is used instead.
    const scoredResponses = interview.responses.filter(isScoredAnswer);
    let overallAnalysis;
    if (scoredResponses.length === 0) {
      overallAnalysis = generateFastOverallFeedback(interview.responses);
    } else {
      try {
        overallAnalysis = await generateOverallInterviewFeedback(interview.responses.filter((r) => r.skipped || isScoredAnswer(r)));
      } catch (feedbackError) {
        console.error('Overall feedback generation failed:', feedbackError.message);
        overallAnalysis = generateFastOverallFeedback(interview.responses);
      }
    }

    interview.status = 'completed';
    interview.completedAt = new Date();
    
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
    await interview.save();

    res.json({
      success: true,
      message: 'Interview completed successfully',
      results: {
        ...finalResults,
        feedback: interview.overallFeedback,
        questionsAnswered: interview.responses.length,
        totalQuestions: interview.questions.length,
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
    const { interviewId } = req.params;
    const userId = req.user?.userId || req.user?.id || req.user?._id;

    const interview = await InterviewModel.findOne({ _id: interviewId, userId });

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

    const interviews = await InterviewModel.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('status overallFeedback createdAt completedAt totalDuration');

    const total = await InterviewModel.countDocuments({ userId });

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

export const getInterview = async (req, res) => {
  try {
    const { interviewId } = req.params;
    const userId = req.user?.userId || req.user?.id || req.user?._id;

    const interview = await InterviewModel.findOne({ _id: interviewId, userId });

    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    res.json({ success: true, interview });
  } catch (error) {
    console.error('Get interview error:', error);
    res.status(500).json({ success: false, error: 'Failed to get interview details' });
  }
};