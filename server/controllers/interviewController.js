import InterviewModel from '../models/InterviewModel.js';
import userModel from '../models/userModel.js';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import axios from 'axios';
import { generateInterviewQuestions, generateAIFeedback, generateOverallInterviewFeedback } from './services/aiService.js';
import { generateStarterCode, selectBestLanguage } from './services/codeGenerationService.js';
import { generateFallbackFeedback } from './services/fallbackFeedbackService.js';
import { 
  validateAndSanitizeInput, 
  validateLanguage, 
  normalizeQuestionType,
  calculateFinalResults,
  getFallbackQuestions
} from './services/utilityService.js';

// JDoodle Code Execution
export const executeCodeWithJDoodle = async (req, res) => {
  const startTime = Date.now();
  console.log('⏱️ Code execution started');
  
  try {
    const { script, language, versionIndex, stdin } = req.body;

    if (!script || !language) {
      console.log('❌ Missing required fields - Duration:', Date.now() - startTime, 'ms');
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: script and language are required'
      });
    }

    const languageMapping = {
      'javascript': { language: 'nodejs', versionIndex: '4' },
      'js': { language: 'nodejs', versionIndex: '4' },
      'nodejs': { language: 'nodejs', versionIndex: '4' },
      'node': { language: 'nodejs', versionIndex: '4' },
      'node.js': { language: 'nodejs', versionIndex: '4' },
      
      'python': { language: 'python3', versionIndex: '4' },
      'python3': { language: 'python3', versionIndex: '4' },
      'py': { language: 'python3', versionIndex: '4' },
      
      'java': { language: 'java', versionIndex: '4' },
      
      'cpp': { language: 'cpp17', versionIndex: '0' },
      'c++': { language: 'cpp17', versionIndex: '0' },
      'cpp17': { language: 'cpp17', versionIndex: '0' },
      
      'c': { language: 'c', versionIndex: '5' },
      
      'c#': { language: 'csharp', versionIndex: '4' },
      'csharp': { language: 'csharp', versionIndex: '4' },
      'cs': { language: 'csharp', versionIndex: '4' },
      
      'php': { language: 'php', versionIndex: '4' },
      
      'go': { language: 'go', versionIndex: '4' },
      'golang': { language: 'go', versionIndex: '4' }
    };

    console.log('🔍 Received language:', language);
    console.log('🔍 Language (lowercase):', language.toLowerCase());

    const mappedLanguage = languageMapping[language.toLowerCase()];
    if (!mappedLanguage) {
      console.log('❌ Unsupported language:', language);
      return res.status(400).json({
        success: false,
        error: `Unsupported language: ${language}. Supported languages: JavaScript/Node.js, Python, Java, C++, C, C#, PHP, Go`
      });
    }

    console.log(`📝 Language mapping: ${language} -> ${mappedLanguage.language}:${mappedLanguage.versionIndex}`);

    const JDOODLE_CLIENT_ID = process.env.JDOODLE_CLIENT_ID;
    const JDOODLE_CLIENT_SECRET = process.env.JDOODLE_CLIENT_SECRET;

    if (!JDOODLE_CLIENT_ID || !JDOODLE_CLIENT_SECRET) {
      console.log('❌ JDoodle credentials missing');
      return res.status(500).json({
        success: false,
        error: 'JDoodle API credentials not configured'
      });
    }

    console.log('📤 Sending request to JDoodle API with:', {
      language: mappedLanguage.language,
      versionIndex: mappedLanguage.versionIndex,
      scriptLength: script.length
    });
    
    const jdoodleResponse = await axios.post(
      'https://api.jdoodle.com/v1/execute',
      {
        script,
        language: mappedLanguage.language,
        versionIndex: mappedLanguage.versionIndex,
        clientId: JDOODLE_CLIENT_ID,
        clientSecret: JDOODLE_CLIENT_SECRET,
        stdin: stdin || ''
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );

    const result = jdoodleResponse.data;
    
    console.log('📥 JDoodle response:', {
      hasOutput: !!result.output,
      hasError: !!result.error,
      statusCode: result.statusCode,
      cpuTime: result.cpuTime,
      memory: result.memory
    });
    
    // Better error handling for JDoodle responses
    if (result.error && result.error.trim()) {
      console.log('⚠️ JDoodle execution error:', result.error);
      return res.json({
        success: false,
        output: result.output || '',
        error: result.error,
        executionTime: result.cpuTime || null,
        memory: result.memory || null,
        statusCode: result.statusCode || null
      });
    }

    console.log('✅ Code execution successful - Duration:', Date.now() - startTime, 'ms');
    res.json({
      success: true,
      output: result.output || '',
      error: result.error || '',
      executionTime: result.cpuTime || null,
      memory: result.memory || null,
      statusCode: result.statusCode || null
    });

  } catch (error) {
    console.error('❌ Code execution error:', error.message);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({
        success: false,
        error: 'Code execution timeout. Please optimize your code and try again.'
      });
    }

    if (error.response) {
      console.error('JDoodle API Error Response:', error.response.data);
      return res.status(500).json({
        success: false,
        error: `JDoodle API error: ${error.response.data.error || error.response.data.message || 'Unknown error'}`
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to execute code. Please try again.'
    });
  }
};

// CV Management
export const getUserCV = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const user = await userModel.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({
      success: true,
      data: {
        hasText: user.hasCV,
        textLength: user.currentCV?.text?.length || 0,
        fileName: user.currentCV?.fileName || '',
        fileSize: user.currentCV?.fileSize || 0,
        uploadedAt: user.currentCV?.uploadedAt || null
      }
    });
  } catch (error) {
    console.error('Get user CV error:', error);
    res.status(500).json({ success: false, error: 'Failed to get user CV' });
  }
};

const cvStorage = multer.memoryStorage();
const cvUpload = multer({
  storage: cvStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

export const processCV = async (req, res) => {
  try {
    const uploadSingle = cvUpload.single('cv');
    
    uploadSingle(req, res, async (uploadError) => {
      if (uploadError) {
        return res.status(400).json({ success: false, error: uploadError.message });
      }

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
        res.status(500).json({
          success: false,
          error: 'Failed to extract text from PDF.'
        });
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
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate interview questions. Please try again.'
      });
    }

    const interview = new InterviewModel({
      userId,
      jobDescription: jobDescription.trim(),
      resumeText: resumeText.trim(),
      questions,
      totalQuestions: questions.length,
      currentQuestionIndex: 0,
      status: 'created',
      responses: [],
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
      interview: {
        id: savedInterview._id,
        _id: savedInterview._id,
        userId: savedInterview.userId,
        jobDescription: savedInterview.jobDescription,
        questions: savedInterview.questions,
        totalQuestions: savedInterview.totalQuestions,
        status: savedInterview.status,
        cvSource: savedInterview.cvSource,
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
    }

    const interview = new InterviewModel({
      userId,
      jobDescription: jobDescription.trim(),
      resumeText: actualCVText,
      questions,
      totalQuestions: questions.length,
      currentQuestionIndex: 0,
      status: 'created',
      responses: [],
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
      interview: {
        id: savedInterview._id,
        questions: savedInterview.questions,
        totalQuestions: savedInterview.totalQuestions,
        status: savedInterview.status,
        cvSource: savedInterview.cvSource,
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
      question: nextQuestion,
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
    const { questionId, responseTime, answerMode, responseText, code, language, skipped, executionResults } = req.body;
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

    let analysis;
    try {
      analysis = await generateAIFeedback(
        question.question,
        question.type,
        sanitizedResponseText,
        sanitizedCode,
        validatedLanguage,
        executionResults
      );
    } catch (error) {
      console.error('AI feedback failed:', error.message);
      analysis = generateFallbackFeedback(question.type, sanitizedResponseText, sanitizedCode, validatedLanguage, executionResults);
    }

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
      executionResults: executionResults || null
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

export const skipQuestion = async (req, res) => {
  try {
    const { interviewId } = req.params;
    const userId = req.user?.userId || req.user?.id || req.user?._id;

    const interview = await InterviewModel.findOne({ _id: interviewId, userId });

    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    const currentQuestionIndex = interview.responses.length;
    if (currentQuestionIndex >= interview.questions.length) {
      return res.status(400).json({ success: false, error: 'No more questions to skip' });
    }

    const question = interview.questions[currentQuestionIndex];
    
    const skipResponse = {
      questionId: question.questionId,
      question: question.question,
      questionType: question.type,
      transcription: null,
      textResponse: 'Question skipped',
      code: null,
      language: null,
      responseTime: 0,
      submittedAt: new Date(),
      skipped: true,
      feedback: null
    };

    interview.responses.push(skipResponse);
    interview.currentQuestionIndex = interview.responses.length;
    interview.updatedAt = new Date();

    if (interview.status === 'created') {
      interview.status = 'in_progress';
      interview.startedAt = new Date();
    }

    await interview.save();

    res.json({
      success: true,
      message: 'Question skipped',
      progress: {
        current: interview.responses.length,
        total: interview.questions.length,
        completed: interview.responses.length >= interview.questions.length
      }
    });
  } catch (error) {
    console.error('Skip question error:', error);
    res.status(500).json({ success: false, error: 'Failed to skip question' });
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
        results
      });
    }

    let overallAnalysis;
    try {
      overallAnalysis = await generateOverallInterviewFeedback(interview.responses);
    } catch (feedbackError) {
      console.error('Overall feedback generation failed:', feedbackError.message);
      overallAnalysis = generateFastOverallFeedback(interview.responses);
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
        totalQuestions: interview.questions.length
      }
    });
  } catch (error) {
    console.error('Complete interview error:', error);
    res.status(500).json({ success: false, error: 'Failed to complete interview' });
  }
};

// Fast fallback for overall feedback
const generateFastOverallFeedback = (responses) => {
  const scores = responses.map(r => r.feedback?.score || 0);
  const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  
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
      generalFeedback: `Completed ${responses.length} questions with ${averageScore.toFixed(1)}% average.`,
      categoryScores: calculateCategoryScores(responses)
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
        recommendations: interview.overallFeedback?.recommendations || []
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