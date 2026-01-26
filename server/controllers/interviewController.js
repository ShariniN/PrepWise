import InterviewModel from '../models/InterviewModel.js';
import userModel from '../models/userModel.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import axios from 'axios';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

console.log('🔑 Gemini API Key Status:', {
  exists: !!process.env.GEMINI_API_KEY,
  length: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0,
  prefix: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 10) + '...' : 'Not found'
});

export const executeCodeWithJDoodle = async (req, res) => {
  const startTime = Date.now();
  console.log('⏱️ Code execution started');
  
  try {
    const { script, language, versionIndex, stdin } = req.body;

    if (!script || !language) {
      console.log('❌ Missing required fields for code execution - Duration:', Date.now() - startTime, 'ms');
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

    const mappedLanguage = languageMapping[language.toLowerCase()];
    if (!mappedLanguage) {
      console.log('❌ Unsupported language:', language);
      return res.status(400).json({
        success: false,
        error: `Unsupported language: ${language}. Supported languages: JavaScript, Python, Java, C++, C, C#, PHP, Go`
      });
    }

    console.log(`📝 Language mapping: ${language} -> ${mappedLanguage.language}:${mappedLanguage.versionIndex}`);

    const JDOODLE_CLIENT_ID = process.env.JDOODLE_CLIENT_ID;
    const JDOODLE_CLIENT_SECRET = process.env.JDOODLE_CLIENT_SECRET;

    if (!JDOODLE_CLIENT_ID || !JDOODLE_CLIENT_SECRET) {
      console.log('❌ JDoodle credentials missing - Duration:', Date.now() - startTime, 'ms');
      return res.status(500).json({
        success: false,
        error: 'JDoodle API credentials not configured'
      });
    }

    const jdoodleData = {
      script: script,
      language: mappedLanguage.language,
      versionIndex: mappedLanguage.versionIndex,
      clientId: JDOODLE_CLIENT_ID,
      clientSecret: JDOODLE_CLIENT_SECRET,
      stdin: stdin || ''
    };

    console.log('📤 Sending request to JDoodle API with:', {
      language: mappedLanguage.language,
      versionIndex: mappedLanguage.versionIndex,
      scriptLength: script.length
    });
    
    const apiStartTime = Date.now();
    
    const jdoodleResponse = await axios.post(
      'https://api.jdoodle.com/v1/execute',
      jdoodleData,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      }
    );

    const apiDuration = Date.now() - apiStartTime;
    console.log('✅ JDoodle API response received - Duration:', apiDuration, 'ms');

    const result = jdoodleResponse.data;
    
    // Better error handling for JDoodle responses
    if (result.error && result.error.trim()) {
      console.log('❌ JDoodle execution error:', result.error);
      return res.json({
        success: false,
        output: result.output || '',
        error: result.error,
        executionTime: result.cpuTime || null,
        memory: result.memory || null,
        statusCode: result.statusCode || null
      });
    }

    console.log('✅ Code execution successful:', {
      hasOutput: !!(result.output && result.output.trim()),
      outputLength: result.output ? result.output.length : 0,
      executionTime: result.cpuTime,
      memory: result.memory,
      totalDuration: Date.now() - startTime + 'ms'
    });

    res.json({
      success: true,
      output: result.output || '',
      error: result.error || '',
      executionTime: result.cpuTime || null,
      memory: result.memory || null,
      statusCode: result.statusCode || null
    });

  } catch (error) {
    console.error('❌ Code execution error - Duration:', Date.now() - startTime, 'ms', error.message);
    
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

export const getUserCV = async (req, res) => {
  const startTime = Date.now();
  console.log('⏱️ Get user CV started');
  
  try {
    const userId = req.user.userId || req.user.id || req.user._id;

    console.log('📋 Fetching user data from database');
    const dbStartTime = Date.now();
    const user = await userModel.findById(userId);
    console.log('✅ User data fetched - Duration:', Date.now() - dbStartTime, 'ms');

    if (!user) {
      console.log('❌ User not found - Total Duration:', Date.now() - startTime, 'ms');
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const cvData = {
      hasText: user.hasCV,
      textLength: user.currentCV?.text?.length || 0,
      fileName: user.currentCV?.fileName || '',
      fileSize: user.currentCV?.fileSize || 0,
      uploadedAt: user.currentCV?.uploadedAt || null
    };

    console.log('✅ Get user CV completed - Total Duration:', Date.now() - startTime, 'ms');
    res.json({
      success: true,
      data: cvData
    });

  } catch (error) {
    console.error('❌ Get user CV error - Duration:', Date.now() - startTime, 'ms', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user CV'
    });
  }
};

const cvStorage = multer.memoryStorage();
const cvUpload = multer({
  storage: cvStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

export const processCV = async (req, res) => {
  const startTime = Date.now();
  console.log('⏱️ Process CV started');
  
  try {
    const uploadSingle = cvUpload.single('cv');
    
    uploadSingle(req, res, async (uploadError) => {
      if (uploadError) {
        console.error('❌ File upload error - Duration:', Date.now() - startTime, 'ms', uploadError);
        return res.status(400).json({
          success: false,
          error: uploadError.message || 'File upload failed'
        });
      }

      if (!req.file) {
        console.log('❌ No file provided - Duration:', Date.now() - startTime, 'ms');
        return res.status(400).json({
          success: false,
          error: 'No PDF file provided'
        });
      }

      const userId = req.user?.userId || req.user?.id || req.user?._id;
      if (!userId) {
        console.log('❌ User not authenticated - Duration:', Date.now() - startTime, 'ms');
        return res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
      }

      try {
        console.log('📄 Processing PDF file:', {
          filename: req.file.originalname,
          size: req.file.size
        });

        console.log('🔍 Starting PDF text extraction');
        const extractStartTime = Date.now();
        const pdfData = await pdfParse(req.file.buffer);
        const extractionDuration = Date.now() - extractStartTime;
        console.log('✅ PDF text extracted - Duration:', extractionDuration, 'ms');

        const extractedText = pdfData.text;
        
        if (!extractedText || extractedText.trim().length === 0) {
          console.log('❌ No text extracted from PDF - Total Duration:', Date.now() - startTime, 'ms');
          return res.status(400).json({
            success: false,
            error: 'Could not extract text from the PDF. Please ensure the PDF contains selectable text.'
          });
        }

        if (extractedText.length < 50) {
          console.log('❌ CV text too short - Total Duration:', Date.now() - startTime, 'ms');
          return res.status(400).json({
            success: false,
            error: 'CV text appears to be too short. Please ensure your CV contains sufficient information.'
          });
        }

        console.log('🧹 Cleaning extracted text');
        const cleanStartTime = Date.now();
        const cleanedText = extractedText
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .replace(/[ \t]{2,}/g, ' ')
          .trim();
        console.log('✅ Text cleaned - Duration:', Date.now() - cleanStartTime, 'ms');

        console.log('✅ PDF processed successfully - Total Duration:', Date.now() - startTime, 'ms', 'Length:', cleanedText.length);

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
        console.error('❌ PDF extraction error - Duration:', Date.now() - startTime, 'ms', extractionError);
        res.status(500).json({
          success: false,
          error: 'Failed to extract text from PDF. Please ensure the file is not corrupted.',
          details: process.env.NODE_ENV === 'development' ? extractionError.message : undefined
        });
      }
    });

  } catch (error) {
    console.error('❌ Process CV error - Duration:', Date.now() - startTime, 'ms', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while processing PDF',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const createInterview = async (req, res) => {
  const startTime = Date.now();
  console.log('⏱️ Create interview started');
  
  try {
    const { jobDescription, resumeText } = req.body;
    const userId = req.user.userId || req.user.id || req.user._id;

    console.log('=== CREATE INTERVIEW DEBUG ===');
    console.log('User ID:', userId);
    console.log('Job Description length:', jobDescription?.length || 0);
    console.log('Resume Text length:', resumeText?.length || 0);
    console.log('Gemini API Key exists:', !!process.env.GEMINI_API_KEY);

    if (!jobDescription || !resumeText) {
      console.log('❌ Missing required fields - Duration:', Date.now() - startTime, 'ms');
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: jobDescription and resumeText are required'
      });
    }

    if (!userId) {
      console.log('❌ User not authenticated - Duration:', Date.now() - startTime, 'ms');
      return res.status(401).json({
        success: false,
        error: 'User not authenticated properly. Please log in again.'
      });
    }

    console.log('🤖 Starting question generation');
    const questionStartTime = Date.now();
    
    let questions;
    try {
      questions = await generatePersonalizedQuestionsWithFullContent(resumeText, jobDescription);
      const questionDuration = Date.now() - questionStartTime;
      console.log('✅ Questions generated successfully - Duration:', questionDuration, 'ms', 'Count:', questions.length);
    } catch (questionError) {
      const questionDuration = Date.now() - questionStartTime;
      console.error('❌ Question generation failed - Duration:', questionDuration, 'ms', questionError);
      console.log('🔄 Using fallback questions');
      questions = getFallbackQuestions();
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      console.error('❌ No questions generated - Total Duration:', Date.now() - startTime, 'ms');
      return res.status(500).json({
        success: false,
        error: 'Failed to generate interview questions. Please try again.'
      });
    }

    console.log('💾 Saving interview to database');
    const saveStartTime = Date.now();

    const interviewData = {
      userId: userId,
      jobDescription: jobDescription.trim(),
      resumeText: resumeText.trim(),
      questions: questions,
      totalQuestions: questions.length,
      currentQuestionIndex: 0,
      status: 'created',
      responses: [],
      cvSource: 'manual',
      usedProfileCV: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const interview = new InterviewModel(interviewData);
    const savedInterview = await interview.save();
    const saveDuration = Date.now() - saveStartTime;
    console.log('✅ Interview saved - Duration:', saveDuration, 'ms');

    console.log('✅ Create interview completed - Total Duration:', Date.now() - startTime, 'ms', 'ID:', savedInterview._id);

    res.status(201).json({
      success: true,
      message: 'Interview created successfully',
      interview: {
        id: savedInterview._id,
        _id: savedInterview._id,
        userId: savedInterview.userId,
        jobDescription: savedInterview.jobDescription,
        resumeText: savedInterview.resumeText,
        questions: savedInterview.questions,
        totalQuestions: savedInterview.totalQuestions,
        status: savedInterview.status,
        cvSource: savedInterview.cvSource,
        usedProfileCV: savedInterview.usedProfileCV,
        createdAt: savedInterview.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Create interview error - Duration:', Date.now() - startTime, 'ms', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create interview',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const createInterviewWithProfileCV = async (req, res) => {
  const startTime = Date.now();
  console.log('⏱️ Create interview with profile CV started');
  
  try {
    const { jobDescription } = req.body;
    const userId = req.user.userId || req.user.id || req.user._id;

    console.log('=== CREATE INTERVIEW WITH PROFILE CV DEBUG ===');
    console.log('User ID:', userId);
    console.log('Job Description length:', jobDescription?.length || 0);

    if (!jobDescription) {
      console.log('❌ Missing job description - Duration:', Date.now() - startTime, 'ms');
      return res.status(400).json({
        success: false,
        error: 'Missing required field: jobDescription is required'
      });
    }

    if (!userId) {
      console.log('❌ User not authenticated - Duration:', Date.now() - startTime, 'ms');
      return res.status(401).json({
        success: false,
        error: 'User not authenticated properly. Please log in again.'
      });
    }

    console.log('📋 Fetching user data');
    const userFetchStartTime = Date.now();
    const user = await userModel.findById(userId);
    const userFetchDuration = Date.now() - userFetchStartTime;
    console.log('✅ User data fetched - Duration:', userFetchDuration, 'ms');

    if (!user) {
      console.error('❌ User not found - Total Duration:', Date.now() - startTime, 'ms', userId);
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!user.hasCV) {
      console.error('❌ User has no CV - Total Duration:', Date.now() - startTime, 'ms', userId);
      return res.status(400).json({
        success: false,
        error: 'No CV found in user profile. Please upload a CV first.'
      });
    }

    console.log('📄 Extracting CV text');
    const cvExtractStartTime = Date.now();
    let actualCVText;
    try {
      actualCVText = user.getCVText();
    } catch (cvError) {
      console.error('Error getting CV text:', cvError);
      actualCVText = user.currentCV?.text || '';
    }
    const cvExtractDuration = Date.now() - cvExtractStartTime;
    console.log('✅ CV text extracted - Duration:', cvExtractDuration, 'ms');

    if (!actualCVText || actualCVText.trim().length === 0) {
      console.log('❌ Empty CV text - Total Duration:', Date.now() - startTime, 'ms');
      return res.status(400).json({
        success: false,
        error: 'CV text is empty or corrupted. Please re-upload your CV.'
      });
    }

    console.log('CV Text length:', actualCVText.length);
    console.log('🤖 Starting question generation');
    const questionStartTime = Date.now();

    let questions;
    try {
      questions = await generatePersonalizedQuestionsWithFullContent(actualCVText, jobDescription);
      const questionDuration = Date.now() - questionStartTime;
      console.log('✅ Questions generated successfully - Duration:', questionDuration, 'ms', 'Count:', questions.length);
    } catch (questionError) {
      const questionDuration = Date.now() - questionStartTime;
      console.error('❌ Question generation failed - Duration:', questionDuration, 'ms', questionError);
      console.log('🔄 Using fallback questions');
      questions = getFallbackQuestions();
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      console.error('❌ No questions generated - Total Duration:', Date.now() - startTime, 'ms');
      return res.status(500).json({
        success: false,
        error: 'Failed to generate interview questions. Please try again.'
      });
    }

    console.log('💾 Saving interview to database');
    const saveStartTime = Date.now();

    const interviewData = {
      userId: userId,
      jobDescription: jobDescription.trim(),
      resumeText: actualCVText,
      questions: questions,
      totalQuestions: questions.length,
      currentQuestionIndex: 0,
      status: 'created',
      responses: [],
      cvSource: 'profile',
      usedProfileCV: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const interview = new InterviewModel(interviewData);
    const savedInterview = await interview.save();
    const saveDuration = Date.now() - saveStartTime;
    console.log('✅ Interview saved - Duration:', saveDuration, 'ms');

    console.log('✅ Create interview with profile CV completed - Total Duration:', Date.now() - startTime, 'ms', 'ID:', savedInterview._id);

    res.status(201).json({
      success: true,
      message: 'Interview created successfully with profile CV',
      interview: {
        id: savedInterview._id,
        _id: savedInterview._id,
        userId: savedInterview.userId,
        jobDescription: savedInterview.jobDescription,
        resumeText: savedInterview.resumeText,
        questions: savedInterview.questions,
        totalQuestions: savedInterview.totalQuestions,
        status: savedInterview.status,
        cvSource: savedInterview.cvSource,
        usedProfileCV: savedInterview.usedProfileCV,
        createdAt: savedInterview.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Create interview with profile CV error - Duration:', Date.now() - startTime, 'ms', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create interview with profile CV',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

async function generatePersonalizedQuestionsWithFullContent(resumeText, jobDescription) {
  const startTime = Date.now();
  console.log('🚀 ENHANCED DEBUG: Starting API call to Gemini');
  console.log('📝 Resume length:', resumeText.length);
  console.log('💼 Job description length:', jobDescription.length);
  
  try {
    console.log('🔧 Configuring Gemini model');
    const modelStartTime = Date.now();
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-pro",
      generationConfig: { 
        temperature: 0.2,
        maxOutputTokens: 4000, // Increased for more complete responses
        topP: 0.7,
        topK: 30,
        candidateCount: 1,
      }
    });
    console.log('✅ Model configured - Duration:', Date.now() - modelStartTime, 'ms');

    // Extract key information from CV and JD for better matching
    const cvTechnologies = extractTechnologies(resumeText);
    const jdRequirements = extractRequirements(jobDescription);
    const cvProjects = extractProjects(resumeText);
    
    console.log('📊 Extracted info:', { cvTechnologies, jdRequirements, projectCount: cvProjects.length });

    // Simplified and more robust prompt
    const prompt = `You are creating personalized interview questions for a software engineering intern position.

CANDIDATE'S CV (first 2000 chars):
${resumeText.substring(0, 2000)}

JOB REQUIREMENTS (first 1000 chars):
${jobDescription.substring(0, 1000)}

REQUIREMENTS:
- Generate exactly 10 questions
- 3 behavioral, 4 technical, 3 coding questions
- Reference specific CV content where possible
- Use only supported languages: javascript, python, java, cpp, c
- Keep questions concise and clear

CRITICAL: Return ONLY a valid JSON array with this EXACT structure:

[
  {
    "questionId": "q1",
    "type": "behavioral",
    "question": "Tell me about a challenging project you worked on. What was the situation and how did you handle it?",
    "category": "project_experience",
    "difficulty": "easy",
    "expectedDuration": 180,
    "followUpQuestions": [],
    "starterCode": null,
    "language": null
  },
  {
    "questionId": "q2",
    "type": "technical", 
    "question": "Explain the difference between frontend and backend development.",
    "category": "web_basics",
    "difficulty": "easy",
    "expectedDuration": 150,
    "followUpQuestions": [],
    "starterCode": null,
    "language": null
  },
  {
    "questionId": "q3",
    "type": "coding",
    "question": "Write a function that finds the largest number in an array.",
    "category": "arrays",
    "difficulty": "easy", 
    "expectedDuration": 300,
    "followUpQuestions": [],
    "starterCode": null,
    "language": "javascript"
  }
]

IMPORTANT: 
- Do NOT include any text before or after the JSON array
- Ensure all strings are properly escaped
- Keep questions under 200 characters
- Do NOT use newlines within question strings`;

    console.log('📤 Sending simplified prompt to Gemini API');
    console.log('📏 Prompt length:', prompt.length);

    const apiCallStartTime = Date.now();
    const result = await model.generateContent(prompt);
    const apiCallDuration = Date.now() - apiCallStartTime;
    console.log('✅ API call completed - Duration:', apiCallDuration, 'ms');

    const response = await result.response;
    const rawText = response.text();

    console.log('📥 Raw API Response received:');
    console.log('📏 Response length:', rawText.length);
    console.log('🔍 Response preview (first 200 chars):', rawText.substring(0, 200));

    // Enhanced JSON extraction with better error handling
    let cleanedText = rawText
      .trim()
      .replace(/```json\s*/gi, '')
      .replace(/```javascript\s*/gi, '')
      .replace(/```\s*/g, '')
      .replace(/^```/gm, '')
      .replace(/```$/gm, '')
      .replace(/^\s*[\r\n]/gm, ''); // Remove empty lines

    // Find the JSON array bounds more carefully
    const arrayStart = cleanedText.indexOf('[');
    const arrayEnd = cleanedText.lastIndexOf(']');
    
    if (arrayStart === -1 || arrayEnd === -1) {
      console.error('❌ No JSON array found in response');
      throw new Error('No JSON array found in response');
    }

    let jsonText = cleanedText.substring(arrayStart, arrayEnd + 1);

    // Additional JSON cleaning
    jsonText = jsonText
      .replace(/,\s*}/g, '}')  // Remove trailing commas in objects
      .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
      .replace(/\r\n|\r|\n/g, ' ')  // Replace all newlines with spaces
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/"\s*:\s*"/g, '": "')  // Normalize spacing around colons
      .replace(/",\s*"/g, '", "');  // Normalize spacing around commas

    let questions;
    try {
      questions = JSON.parse(jsonText);
      console.log('✅ JSON parsed successfully');
      console.log('📊 Generated questions:', questions.length);
    } catch (parseError) {
      console.error('❌ JSON Parse Error:', parseError.message);
      console.error('❌ Problematic JSON (first 500 chars):', jsonText.substring(0, 500));
      
      // Try to fix common JSON issues
      try {
        let fixedJson = jsonText;
        
        // Fix unescaped quotes in strings
        fixedJson = fixedJson.replace(/"([^"]*)"([^"]*)"([^"]*)":/g, '"$1\\"$2\\"$3":');
        
        // Fix incomplete objects at the end
        if (!fixedJson.trim().endsWith(']')) {
          const lastCommaIndex = fixedJson.lastIndexOf(',');
          if (lastCommaIndex > -1) {
            fixedJson = fixedJson.substring(0, lastCommaIndex) + ']';
          }
        }
        
        questions = JSON.parse(fixedJson);
        console.log('✅ Fixed JSON parsed successfully');
      } catch (fixError) {
        console.error('❌ Failed to fix JSON:', fixError.message);
        throw new Error('Could not parse AI response as JSON');
      }
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('Invalid questions array received from AI');
    }

    // Process and validate questions
    const processedQuestions = questions.slice(0, 10).map((q, index) => {
      const questionId = q.questionId || `q${index + 1}`;
      const type = normalizeQuestionType(q.type || 'technical');
      
      // Better language selection based on CV content and question type
      let language = null;
      if (type === 'coding') {
        language = selectBestLanguage(resumeText, q.language);
      }
      
      return {
        questionId: questionId,
        type: type,
        question: (q.question || 'Generated question').replace(/\n/g, ' ').trim(),
        category: q.category || 'general',
        difficulty: q.difficulty || 'easy',
        expectedDuration: type === 'coding' ? 300 : (type === 'behavioral' ? 180 : 150),
        followUpQuestions: Array.isArray(q.followUpQuestions) ? q.followUpQuestions : [],
        starterCode: type === 'coding' ? generateStarterCode(q.question || '', language) : null,
        language: language,
        cvReference: q.cvReference || 'General experience',
        jdAlignment: q.jdAlignment || 'Role requirements'
      };
    });

    console.log('✅ SUCCESSFUL PERSONALIZED GENERATION - Total Duration:', Date.now() - startTime, 'ms', 'Questions:', processedQuestions.length);
    return processedQuestions;

  } catch (error) {
    console.error('❌ GEMINI API ERROR - Duration:', Date.now() - startTime, 'ms', error);
    throw error;
  }
}

// Helper functions for better CV/JD analysis
function extractTechnologies(resumeText) {
  const techKeywords = [
    'JavaScript', 'Python', 'Java', 'C++', 'C#', 'React', 'Node.js', 'Express',
    'MongoDB', 'MySQL', 'PostgreSQL', 'HTML', 'CSS', 'Git', 'Docker', 'AWS',
    'Vue.js', 'Angular', 'TypeScript', 'PHP', 'Ruby', 'Django', 'Flask',
    'Spring', 'Bootstrap', 'jQuery', 'REST', 'API', 'GraphQL', 'Redis'
  ];
  
  return techKeywords.filter(tech => 
    new RegExp(`\\b${tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(resumeText)
  );
}

function extractRequirements(jobDescription) {
  const requirements = [];
  const lines = jobDescription.split('\n');
  
  lines.forEach(line => {
    if (/^[-•*]\s*|requirements?:|skills?:/i.test(line)) {
      const cleaned = line.replace(/^[-•*]\s*|requirements?:|skills?:/i, '').trim();
      if (cleaned.length > 5 && cleaned.length < 100) {
        requirements.push(cleaned);
      }
    }
  });
  
  return requirements.slice(0, 8); // Limit to most important requirements
}

function extractProjects(resumeText) {
  const projects = [];
  const lines = resumeText.split('\n');
  
  lines.forEach(line => {
    // Look for project indicators
    if (/project|built|developed|created|implemented/i.test(line) && 
        !/(education|experience|skills)/i.test(line) &&
        line.length > 20) {
      projects.push(line.trim());
    }
  });
  
  return projects.slice(0, 5); // Limit to 5 most relevant projects
}

function selectBestLanguage(resumeText, suggestedLanguage) {
  const supportedLanguages = ['javascript', 'python', 'java', 'cpp', 'c', 'csharp', 'php', 'go'];
  
  // Check if suggested language is supported (normalize first)
  const normalizedSuggested = normalizeLanguageName(suggestedLanguage);
  if (suggestedLanguage && supportedLanguages.includes(normalizedSuggested)) {
    return normalizedSuggested;
  }
  
  // Analyze CV for language preference with improved patterns
  const languageCount = {};
  
  // More comprehensive language detection patterns
  const patterns = {
    'javascript': /javascript|js\b|node\.?js|react|vue|angular|express|npm|typescript|jquery|es6|babel|webpack/i,
    'python': /python|django|flask|pandas|numpy|scipy|tensorflow|pytorch|pip|conda|jupyter|fastapi/i,
    'java': /\bjava\b(?!script)|spring|hibernate|maven|gradle|jvm|android|servlet|jsp|struts/i,
    'cpp': /c\+\+|cpp|std::|boost|qt|cmake|g\+\+|clang\+\+|visual\s?studio/i,
    'c': /\bc\b(?!\+|#)|gcc|glibc|posix|embedded|arduino|microcontroller/i,
    'csharp': /c#|csharp|\.net|asp\.net|visual\s?studio|unity|xamarin|mvc|web\s?api/i,
    'php': /php|laravel|symfony|composer|wordpress|drupal|codeigniter|zend/i,
    'go': /\bgo\b|golang|goroutine|gin|echo|buffalo|beego|revel/i
  };
  
  // Count matches for each language
  supportedLanguages.forEach(lang => {
    const matches = resumeText.match(patterns[lang]);
    languageCount[lang] = matches ? matches.length : 0;
  });
  
  // Find the language with the most mentions
  const bestLanguage = Object.keys(languageCount).reduce((a, b) => 
    languageCount[a] > languageCount[b] ? a : b
  );
  
  // Return the most mentioned language if it has any mentions, otherwise default to JavaScript
  return languageCount[bestLanguage] > 0 ? bestLanguage : 'javascript';
}


// CORRECTED: Fixed scoring alignment with response type
function mapScoreToResponseType(score) {
  if (score >= 85) return 'perfectly-relevant';
  if (score >= 65) return 'mostly-relevant';      // Adjusted threshold
  if (score >= 45) return 'partially-relevant';   // Adjusted threshold
  if (score >= 25) return 'mostly-irrelevant';    // Adjusted threshold
  return 'completely-off-topic';
}
function generateStarterCode(questionText, language) {
  if (!language) return null;

  const starterCode = {};
  
  // Normalize language name
  const normalizedLanguage = normalizeLanguageName(language);
  
  // Extract problem context for better templates
  const isArrayProblem = /array|list|numbers/i.test(questionText);
  const isStringProblem = /string|text|word|character/i.test(questionText);
  const isNumberProblem = /number|sum|count|calculate|even|odd/i.test(questionText);
  
  // Generate template based on normalized language
  let template;
  switch (normalizedLanguage) {
    case 'javascript':
      template = generateJavaScriptTemplate(questionText, isArrayProblem, isStringProblem, isNumberProblem);
      break;
    case 'python':
      template = generatePythonTemplate(questionText, isArrayProblem, isStringProblem, isNumberProblem);
      break;
    case 'java':
      template = generateJavaTemplate(questionText, isArrayProblem, isStringProblem, isNumberProblem);
      break;
    case 'cpp':
      template = generateCppTemplate(questionText, isArrayProblem, isStringProblem, isNumberProblem);
      break;
    case 'c':
      template = generateCTemplate(questionText, isArrayProblem, isStringProblem, isNumberProblem);
      break;
    case 'csharp':
      template = generateCSharpTemplate(questionText, isArrayProblem, isStringProblem, isNumberProblem);
      break;
    case 'php':
      template = generatePhpTemplate(questionText, isArrayProblem, isStringProblem, isNumberProblem);
      break;
    case 'go':
      template = generateGoTemplate(questionText, isArrayProblem, isStringProblem, isNumberProblem);
      break;
    default:
      template = generateJavaScriptTemplate(questionText, isArrayProblem, isStringProblem, isNumberProblem);
  }

  starterCode[normalizedLanguage] = template;
  return starterCode;
}

function normalizeLanguageName(language) {
  if (!language || typeof language !== 'string') return 'javascript';
  
  const normalizedMap = {
    'javascript': 'javascript',
    'js': 'javascript', 
    'nodejs': 'javascript',
    'node': 'javascript',
    'node.js': 'javascript',
    'python': 'python',
    'python3': 'python',
    'py': 'python',
    'java': 'java',
    'cpp': 'cpp',
    'c++': 'cpp',
    'cpp17': 'cpp',
    'c': 'c',
    'c#': 'csharp',
    'csharp': 'csharp',
    'cs': 'csharp',
    'php': 'php',
    'go': 'go',
    'golang': 'go'
  };
  
  return normalizedMap[language.toLowerCase()] || 'javascript';
}

// FIXED: Better JavaScript templates
function generateJavaScriptTemplate(questionText, isArrayProblem, isStringProblem, isNumberProblem) {
  const comment = `// ${questionText.length > 60 ? questionText.substring(0, 60) + '...' : questionText}`;
  
  if (isArrayProblem) {
    return `function solution(arr) {
    ${comment}
    
    // Your code here
    // Example: iterate through array, process elements
    
    return arr; // Replace with your result
}

// Test your solution
const testArray = [1, 2, 3, 4, 5];
console.log(solution(testArray));`;
  }
  
  if (isStringProblem) {
    return `function solution(str) {
    ${comment}
    
    // Your code here
    // Example: process the string, return result
    
    return str; // Replace with your result
}

// Test your solution
const testString = "hello world";
console.log(solution(testString));`;
  }

  if (isNumberProblem) {
    return `function solution(num) {
    ${comment}
    
    // Your code here
    // Example: perform calculation, return result
    
    return num; // Replace with your result
}

// Test your solution
const testNumber = 10;
console.log(solution(testNumber));`;
  }
  
  return `function solution(input) {
    ${comment}
    
    // Your code here
    // Write your solution logic
    
    return input; // Replace with your result
}

// Test your solution
console.log(solution("test input"));`;
}

// FIXED: Better Python templates
function generatePythonTemplate(questionText, isArrayProblem, isStringProblem, isNumberProblem) {
  const comment = `# ${questionText.length > 60 ? questionText.substring(0, 60) + '...' : questionText}`;
  
  if (isArrayProblem) {
    return `def solution(arr):
    ${comment}
    
    # Your code here
    # Example: iterate through list, process elements
    
    return arr  # Replace with your result

# Test your solution
test_array = [1, 2, 3, 4, 5]
print(solution(test_array))`;
  }
  
  if (isStringProblem) {
    return `def solution(text):
    ${comment}
    
    # Your code here
    # Example: process the string, return result
    
    return text  # Replace with your result

# Test your solution
test_string = "hello world"
print(solution(test_string))`;
  }

  if (isNumberProblem) {
    return `def solution(num):
    ${comment}
    
    # Your code here
    # Example: perform calculation, return result
    
    return num  # Replace with your result

# Test your solution
test_number = 10
print(solution(test_number))`;
  }
  
  return `def solution(input_data):
    ${comment}
    
    # Your code here
    # Write your solution logic
    
    return input_data  # Replace with your result

# Test your solution
print(solution("test input"))`;
}

function generateJavaTemplate(questionText, isArrayProblem, isStringProblem, isNumberProblem) {
  const comment = `// ${questionText.length > 40 ? questionText.substring(0, 40) + '...' : questionText}`;
  
  if (isArrayProblem) {
    return `public class Solution {
    public static int solution(int[] arr) {
        ${comment}
        
        // Your code here
        
        return 0;
    }
    
    public static void main(String[] args) {
        int[] test = {1, 2, 3, 4, 5};
        System.out.println(solution(test));
    }
}`;
  }
  
  if (isStringProblem) {
    return `public class Solution {
    public static String solution(String text) {
        ${comment}
        
        // Your code here
        
        return "";
    }
    
    public static void main(String[] args) {
        System.out.println(solution("hello world"));
    }
}`;
  }

  if (isNumberProblem) {
    return `public class Solution {
    public static int solution(int num) {
        ${comment}
        
        // Your code here
        
        return 0;
    }
    
    public static void main(String[] args) {
        System.out.println(solution(10));
    }
}`;
  }
  
  return `public class Solution {
    public static String solution(String input) {
        ${comment}
        
        // Your code here
        
        return "";
    }
    
    public static void main(String[] args) {
        System.out.println(solution("test input"));
    }
}`;
}

function generateCppTemplate(questionText, isArrayProblem, isStringProblem, isNumberProblem) {
  const comment = `// ${questionText.length > 40 ? questionText.substring(0, 40) + '...' : questionText}`;
  
  if (isArrayProblem) {
    return `#include <iostream>
#include <vector>
using namespace std;

int solution(vector<int>& arr) {
    ${comment}
    
    // Your code here
    
    return 0;
}

int main() {
    vector<int> test = {1, 2, 3, 4, 5};
    cout << solution(test) << endl;
    return 0;
}`;
  }
  
  if (isStringProblem) {
    return `#include <iostream>
#include <string>
using namespace std;

string solution(string text) {
    ${comment}
    
    // Your code here
    
    return "";
}

int main() {
    cout << solution("hello world") << endl;
    return 0;
}`;
  }

  if (isNumberProblem) {
    return `#include <iostream>
using namespace std;

int solution(int num) {
    ${comment}
    
    // Your code here
    
    return 0;
}

int main() {
    cout << solution(10) << endl;
    return 0;
}`;
  }
  
  return `#include <iostream>
#include <string>
using namespace std;

string solution(string input) {
    ${comment}
    
    // Your code here
    
    return "";
}

int main() {
    cout << solution("test input") << endl;
    return 0;
}`;
}

function generateCTemplate(questionText, isArrayProblem, isStringProblem, isNumberProblem) {
  const comment = `// ${questionText.length > 40 ? questionText.substring(0, 40) + '...' : questionText}`;
  
  if (isArrayProblem) {
    return `#include <stdio.h>

int solution(int arr[], int size) {
    ${comment}
    
    // Your code here
    
    return 0;
}

int main() {
    int test[] = {1, 2, 3, 4, 5};
    printf("%d\\n", solution(test, 5));
    return 0;
}`;
  }
  
  if (isStringProblem) {
    return `#include <stdio.h>
#include <string.h>

void solution(char* text, char* result) {
    ${comment}
    
    // Your code here
    
    strcpy(result, text);
}

int main() {
    char result[100];
    solution("hello world", result);
    printf("%s\\n", result);
    return 0;
}`;
  }

  if (isNumberProblem) {
    return `#include <stdio.h>

int solution(int num) {
    ${comment}
    
    // Your code here
    
    return 0;
}

int main() {
    printf("%d\\n", solution(10));
    return 0;
}`;
  }
  
  return `#include <stdio.h>

int solution(char* input) {
    ${comment}
    
    // Your code here
    
    return 0;
}

int main() {
    printf("%d\\n", solution("test input"));
    return 0;
}`;
}

function getFallbackQuestions() {
  return [
    {
      questionId: "q1",
      type: "behavioral",
      question: "Tell me about a programming project you worked on recently. What was the project about, what challenges did you face, and how did you overcome them?",
      category: "project_experience",
      difficulty: "easy",
      expectedDuration: 180,
      followUpQuestions: [],
      starterCode: null,
      language: null
    },
    {
      questionId: "q2", 
      type: "behavioral",
      question: "Describe a time when you had to learn a new programming concept or technology for a project. How did you approach learning it?",
      category: "learning_ability",
      difficulty: "easy",
      expectedDuration: 180,
      followUpQuestions: [],
      starterCode: null,
      language: null
    },
    {
      questionId: "q3",
      type: "behavioral",
      question: "Tell me about a time when you worked with others on a coding project. How did you collaborate and what role did you play?",
      category: "teamwork",
      difficulty: "easy", 
      expectedDuration: 180,
      followUpQuestions: [],
      starterCode: null,
      language: null
    },
    {
      questionId: "q4",
      type: "technical",
      question: "What is the difference between a frontend and backend in web development? Can you give an example of what each one handles?",
      category: "web_basics",
      difficulty: "easy",
      expectedDuration: 150,
      followUpQuestions: [],
      starterCode: null,
      language: null
    },
    {
      questionId: "q5",
      type: "technical", 
      question: "Explain what Git is and why it's useful for programmers. Have you used any version control before?",
      category: "tools_basics",
      difficulty: "easy",
      expectedDuration: 150,
      followUpQuestions: [],
      starterCode: null,
      language: null
    },
    {
      questionId: "q6",
      type: "technical",
      question: "What is a function in programming? Why are functions useful when writing code?",
      category: "programming_basics",
      difficulty: "easy",
      expectedDuration: 150,
      followUpQuestions: [],
      starterCode: null,
      language: null
    },
    {
      questionId: "q7",
      type: "technical",
      question: "What is debugging? Describe a simple process you might follow when your code doesn't work as expected.",
      category: "debugging_basics",
      difficulty: "easy",
      expectedDuration: 150,
      followUpQuestions: [],
      starterCode: null,
      language: null
    },
    {
      questionId: "q8",
      type: "coding",
      question: "Write a function that takes an array of numbers and returns the largest number. Explain your approach.",
      category: "basic_arrays",
      difficulty: "easy",
      expectedDuration: 300,
      followUpQuestions: [],
      starterCode: {
        javascript: `function findLargest(numbers) {
    // Your code here
    // Find and return the largest number in the array
    
    return 0;
}

// Test your function
console.log(findLargest([3, 7, 2, 9, 1])); // Should return 9`
      },
      language: "javascript"
    },
    {
      questionId: "q9",
      type: "coding",
      question: "Create a function that counts how many times a specific character appears in a string.",
      category: "string_basics",
      difficulty: "easy",
      expectedDuration: 300,
      followUpQuestions: [],
      starterCode: {
        javascript: `function countCharacter(text, char) {
    // Your code here
    // Count how many times 'char' appears in 'text'
    
    return 0;
}

// Test your function
console.log(countCharacter("hello world", "l")); // Should return 3`
      },
      language: "javascript"
    },
    {
      questionId: "q10",
      type: "coding",
      question: "Write a function that checks if a number is even or odd and returns 'even' or 'odd'.",
      category: "basic_logic",
      difficulty: "easy",
      expectedDuration: 300,
      followUpQuestions: [],
      starterCode: {
        javascript: `function checkEvenOdd(number) {
    // Your code here
    // Return "even" if number is even, "odd" if number is odd
    
    return "";
}

// Test your function
console.log(checkEvenOdd(4)); // Should return "even"
console.log(checkEvenOdd(7)); // Should return "odd"`
      },
      language: "javascript"
    }
  ];
}

function normalizeQuestionType(type) {
  if (!type || typeof type !== 'string') return 'technical';
  
  const typeMapping = {
    'behavioral': 'behavioral',
    'behaviour': 'behavioral',
    'behavioural': 'behavioral',
    'technical': 'technical', 
    'tech': 'technical',
    'coding': 'coding',
    'code': 'coding',
    'programming': 'coding',
    'problem-solving': 'coding',
    'algorithm': 'coding',
    'system_design': 'technical',
    'system-design': 'technical',
    'design': 'technical'
  };

  const normalized = type.toLowerCase().replace(/[^a-z-]/g, '');
  return typeMapping[normalized] || 'technical';
}

export const startInterview = async (req, res) => {
  const startTime = Date.now();
  console.log('⏱️ Start interview initiated');
  
  try {
    const { interviewId } = req.params;
    const userId = req.user?.userId || req.user?.id || req.user?._id;

    console.log('📋 Fetching interview from database');
    const dbStartTime = Date.now();
    const interview = await InterviewModel.findOne({ _id: interviewId, userId });
    const dbDuration = Date.now() - dbStartTime;
    console.log('✅ Interview fetched - Duration:', dbDuration, 'ms');

    if (!interview) {
      console.log('❌ Interview not found - Total Duration:', Date.now() - startTime, 'ms');
      return res.status(404).json({ 
        success: false,
        error: 'Interview not found' 
      });
    }

    if (interview.status !== 'created') {
      console.log('❌ Interview already started - Total Duration:', Date.now() - startTime, 'ms');
      return res.status(400).json({ 
        success: false,
        error: 'Interview already started or completed' 
      });
    }

    if (!interview.questions || !Array.isArray(interview.questions) || interview.questions.length === 0) {
      console.log('❌ No questions available - Total Duration:', Date.now() - startTime, 'ms');
      return res.status(500).json({
        success: false,
        error: 'Interview has no questions available. Please recreate the interview.'
      });
    }

    console.log('💾 Updating interview status');
    const updateStartTime = Date.now();
    interview.status = 'in_progress';
    interview.startedAt = new Date();
    interview.updatedAt = new Date();
    await interview.save();
    const updateDuration = Date.now() - updateStartTime;
    console.log('✅ Interview updated - Duration:', updateDuration, 'ms');

    console.log('✅ Start interview completed - Total Duration:', Date.now() - startTime, 'ms');
    res.json({
      success: true,
      message: 'Interview started successfully',
      firstQuestion: interview.questions[0],
      totalQuestions: interview.questions.length,
      questions: interview.questions,
      interviewData: {
        id: interview._id,
        status: interview.status,
        currentQuestionIndex: 0
      }
    });
  } catch (error) {
    console.error('❌ Start interview error - Duration:', Date.now() - startTime, 'ms', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to start interview',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getNextQuestion = async (req, res) => {
  const startTime = Date.now();
  console.log('⏱️ Get next question started');
  
  try {
    const { interviewId } = req.params;
    const userId = req.user?.userId || req.user?.id || req.user?._id;

    console.log('📋 Fetching interview');
    const dbStartTime = Date.now();
    const interview = await InterviewModel.findOne({ _id: interviewId, userId });
    const dbDuration = Date.now() - dbStartTime;
    console.log('✅ Interview fetched - Duration:', dbDuration, 'ms');

    if (!interview) {
      console.log('❌ Interview not found - Total Duration:', Date.now() - startTime, 'ms');
      return res.status(404).json({ 
        success: false,
        error: 'Interview not found' 
      });
    }

    const answeredCount = interview.responses.length;

    if (answeredCount >= interview.questions.length) {
      console.log('✅ All questions completed - Total Duration:', Date.now() - startTime, 'ms');
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
    if (!nextQuestion) {
      console.log('✅ No more questions - Total Duration:', Date.now() - startTime, 'ms');
      return res.json({
        success: true,
        completed: true,
        message: 'No more questions available'
      });
    }

    console.log('✅ Get next question completed - Total Duration:', Date.now() - startTime, 'ms');
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
    console.error('❌ Get next question error - Duration:', Date.now() - startTime, 'ms', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get next question',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

function validateAndSanitizeInput(input) {
  if (typeof input !== 'string') {
    return '';
  }
  
  return input
    .trim()
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .substring(0, 10000);
}

function validateLanguage(language) {
  return language ? language.trim() : null;
}

export const submitAnswer = async (req, res) => {
  const startTime = Date.now();
  console.log('⏱️ Submit answer started');
  
  try {
    const { interviewId } = req.params;
    const { questionId, responseTime, answerMode, responseText, code, language, skipped, executionResults } = req.body;
    const userId = req.user?.userId || req.user?.id || req.user?._id;

    console.log('=== SUBMIT ANSWER DEBUG ===');
    console.log('Interview ID:', interviewId);
    console.log('Question ID:', questionId);
    console.log('Skipped:', skipped);
    console.log('Response Text Length:', responseText?.length || 0);
    console.log('Has Code:', !!code);

    console.log('📋 Fetching interview');
    const dbFetchStartTime = Date.now();
    const interview = await InterviewModel.findOne({ _id: interviewId, userId });
    const dbFetchDuration = Date.now() - dbFetchStartTime;
    console.log('✅ Interview fetched - Duration:', dbFetchDuration, 'ms');

    if (!interview) {
      console.log('❌ Interview not found - Total Duration:', Date.now() - startTime, 'ms');
      return res.status(404).json({ 
        success: false,
        error: 'Interview not found' 
      });
    }

    const question = interview.questions.find(q => q.questionId === questionId);
    if (!question) {
      console.log('❌ Question not found - Total Duration:', Date.now() - startTime, 'ms');
      return res.status(400).json({ 
        success: false,
        error: 'Question not found' 
      });
    }

    // Handle skipped questions quickly - NO PROCESSING
    if (skipped) {
      console.log('⏭️ Processing skipped question (fast path)');
      const skipStartTime = Date.now();
      
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
        feedback: null, // No feedback for skipped questions
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
      const skipDuration = Date.now() - skipStartTime;
      console.log('✅ Skipped question processed (fast) - Duration:', skipDuration, 'ms');

      console.log('✅ Submit answer completed (skipped) - Total Duration:', Date.now() - startTime, 'ms');
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

    // Regular answer processing continues for non-skipped answers
    console.log('🧹 Sanitizing input');
    const sanitizeStartTime = Date.now();
    const sanitizedResponseText = validateAndSanitizeInput(responseText);
    const sanitizedCode = validateAndSanitizeInput(code);
    const validatedLanguage = validateLanguage(language);
    const sanitizeDuration = Date.now() - sanitizeStartTime;
    console.log('✅ Input sanitized - Duration:', sanitizeDuration, 'ms');

    if (!sanitizedResponseText || sanitizedResponseText.length === 0) {
      console.log('❌ No response text - Total Duration:', Date.now() - startTime, 'ms');
      return res.status(400).json({ 
        success: false,
        error: 'Response text is required' 
      });
    }

    console.log('🤖 Analyzing response with AI');
    const analysisStartTime = Date.now();
    let analysis;
    try {
      analysis = await generateEnhancedAIFeedback(
        question.question,
        question.type,
        sanitizedResponseText,
        sanitizedCode,
        validatedLanguage,
        executionResults
      );
      const analysisDuration = Date.now() - analysisStartTime;
      console.log('✅ AI analysis completed - Duration:', analysisDuration, 'ms', 'Score:', analysis.score);
    } catch (error) {
      const analysisDuration = Date.now() - analysisStartTime;
      console.error('❌ AI feedback failed - Duration:', analysisDuration, 'ms', error.message);
      analysis = generateFallbackFeedback(question.type, sanitizedResponseText, sanitizedCode);
      console.log('🔄 Using fallback feedback');
    }

    console.log('💾 Saving response to database');
    const saveStartTime = Date.now();
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
    const saveDuration = Date.now() - saveStartTime;
    console.log('✅ Response saved - Duration:', saveDuration, 'ms');

    console.log('✅ Submit answer completed - Total Duration:', Date.now() - startTime, 'ms');
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
    console.error('❌ Submit answer error - Duration:', Date.now() - startTime, 'ms', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to process answer',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

async function generateEnhancedAIFeedback(question, questionType, responseText, code, language, executionResults = null) {
  console.time('ai-feedback-generation');
  console.log('🤖 ENHANCED AI FEEDBACK DEBUG:');
  console.log('📝 Question length:', question.length);
  console.log('📋 Question type:', questionType);
  console.log('💬 Response length:', responseText.length);
  console.log('💻 Has code:', !!code);
  console.log('🔧 Language:', language);

  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-pro",
      generationConfig: { 
        temperature: 0.1, // Lower temperature for consistent scoring
        maxOutputTokens: 1500,
        topP: 0.6,
      }
    });

    // Truncate inputs for better API performance
    const maxQuestionLength = 800;
    const maxResponseLength = 1500;
    const maxCodeLength = 1500;

    const truncatedQuestion = question.length > maxQuestionLength 
      ? question.substring(0, maxQuestionLength) + "..." 
      : question;
    
    const truncatedResponse = responseText.length > maxResponseLength 
      ? responseText.substring(0, maxResponseLength) + "..." 
      : responseText;
    
    const truncatedCode = code && code.length > maxCodeLength 
      ? code.substring(0, maxCodeLength) + "..." 
      : code;

    // IMPROVED PROMPT with stricter scoring alignment
    const prompt = `You are evaluating an INTERN candidate's interview response. Provide CONSISTENT scoring where the numerical score EXACTLY matches the response type.

QUESTION: "${truncatedQuestion}"
QUESTION TYPE: ${questionType}
CANDIDATE RESPONSE: "${truncatedResponse}"
${truncatedCode ? `CODE SUBMITTED: "${truncatedCode}"` : ''}
${language ? `PROGRAMMING LANGUAGE: ${language}` : ''}
${executionResults ? `CODE EXECUTION RESULT: "${executionResults.output || 'No output'}"${executionResults.error ? ' | ERROR: ' + executionResults.error : ''}` : ''}

STRICT SCORING GUIDELINES (MUST BE CONSISTENT):
- 85-100 points = "perfectly-relevant" (Exceptional intern performance)
- 65-84 points = "mostly-relevant" (Good intern performance) 
- 45-64 points = "partially-relevant" (Acceptable intern performance)
- 25-44 points = "mostly-irrelevant" (Below expectations)
- 0-24 points = "completely-off-topic" (Inadequate response)

SCORING CRITERIA BY TYPE:
BEHAVIORAL (0-100):
- 85-100: Perfect STAR structure, specific examples, clear learning, excellent communication
- 65-84: Good example, some structure, shows growth, clear communication
- 45-64: Has example, basic structure, some learning shown, adequate communication  
- 25-44: Vague example, poor structure, minimal learning, unclear communication
- 0-24: Off-topic or completely inadequate

TECHNICAL (0-100):
- 85-100: Deep understanding, accurate explanations, excellent examples, clear communication
- 65-84: Good understanding, mostly accurate, some examples, clear explanations
- 45-64: Basic understanding, generally correct, simple explanations, adequate knowledge
- 25-44: Limited understanding, some correct elements, unclear explanations, gaps in knowledge
- 0-24: No understanding, completely wrong, or off-topic

CODING (0-100):
- 85-100: Working solution, efficient, handles edge cases, clean code, excellent explanation
- 65-84: Working solution, reasonable approach, good structure, clear explanation
- 45-64: Working solution with minor issues, basic approach, adequate explanation
- 25-44: Partial solution, logical issues, syntax problems, but shows attempt
- 0-24: No working code, completely wrong approach, or no attempt

CRITICAL: The score MUST correspond exactly to these ranges. responseType MUST match the score range.

Return ONLY this JSON format:
{
  "score": 67,
  "responseType": "mostly-relevant",
  "strengths": [
    "Specific strength observed",
    "Another concrete positive"
  ],
  "improvements": [
    "Specific improvement needed",
    "Another actionable item",
    "Third improvement area"
  ],
  "detailedAnalysis": "Response shows [specific analysis]. Score of 67/100 reflects [specific reasoning]. The candidate demonstrated [specific observations] but needs improvement in [specific areas].",
  "overallAssessment": "Assessment that matches the score level and responseType",
  "questionRelevance": 7,
  "correctness": 7,
  "communicationClarity": 7,
  "technicalAccuracy": 6
}

ENSURE:
- Score and responseType are perfectly aligned
- Detailed analysis explains the exact score
- All ratings (1-10) are consistent with the overall score
- Feedback is specific and actionable`;

    console.log('📤 Sending enhanced feedback request...');

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawText = response.text();

    console.log('📥 AI Feedback Raw Response length:', rawText.length);

    // Enhanced JSON cleaning
    let cleanText = rawText
      .trim()
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .replace(/^```/gm, '')
      .replace(/```$/gm, '');

    let aiAnalysis;
    try {
      const jsonStart = cleanText.indexOf('{');
      const jsonEnd = cleanText.lastIndexOf('}');
      
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonOnly = cleanText.substring(jsonStart, jsonEnd + 1);
        aiAnalysis = JSON.parse(jsonOnly);
        console.log('✅ AI feedback JSON parsed successfully');
        console.log('📊 Parsed score:', aiAnalysis.score);
        console.log('🏷️ Response type:', aiAnalysis.responseType);
      } else {
        throw new Error('No valid JSON found in response');
      }
    } catch (parseError) {
      console.error('❌ JSON Parse Error:', parseError.message);
      return generateEnhancedFallbackFeedback(questionType, responseText, code, language, executionResults);
    }

    // CORRECTED: Ensure strict alignment between score and responseType
    const score = Math.max(0, Math.min(100, aiAnalysis.score || 50));
    let responseType = aiAnalysis.responseType;
    
    // Force alignment if inconsistent
    const expectedResponseType = mapScoreToResponseType(score);
    if (responseType !== expectedResponseType) {
      console.warn(`⚠️ Fixed responseType alignment: ${responseType} -> ${expectedResponseType} (score: ${score})`);
      responseType = expectedResponseType;
    }

    // CORRECTED: Ensure all ratings align with the score
    const baseRating = Math.max(1, Math.min(10, Math.floor(score / 10)));
    
    const structuredFeedback = {
      score: score,
      questionRelevance: Math.max(1, Math.min(10, aiAnalysis.questionRelevance || baseRating)),
      responseType: responseType,
      correctness: Math.max(1, Math.min(10, aiAnalysis.correctness || baseRating)),
      syntax: questionType === 'coding' ? Math.max(1, Math.min(10, baseRating)) : Math.floor(score / 15),
      languageBestPractices: questionType === 'coding' ? Math.max(1, Math.min(10, baseRating)) : Math.floor(score / 15),
      efficiency: questionType === 'coding' ? Math.max(1, Math.min(10, Math.floor(score / 12))) : Math.floor(score / 15),
      structureAndReadability: Math.max(1, Math.min(10, aiAnalysis.communicationClarity || baseRating)),
      edgeCaseHandling: questionType === 'coding' ? Math.max(1, Math.min(10, Math.floor(score / 15))) : Math.floor(score / 20),
      
      strengths: Array.isArray(aiAnalysis.strengths) && aiAnalysis.strengths.length > 0 
        ? aiAnalysis.strengths.slice(0, 4).filter(s => s && s.length > 10)
        : generateContextualStrengths(questionType, score, responseText, code),
        
      improvements: Array.isArray(aiAnalysis.improvements) && aiAnalysis.improvements.length > 0 
        ? aiAnalysis.improvements.slice(0, 5).filter(i => i && i.length > 10)
        : generateContextualImprovements(questionType, score, responseText, code),
        
      detailedAnalysis: aiAnalysis.detailedAnalysis && aiAnalysis.detailedAnalysis.length > 50
        ? aiAnalysis.detailedAnalysis
        : generateDetailedAnalysis(questionType, score, responseText, code, question),
        
      overallAssessment: aiAnalysis.overallAssessment && aiAnalysis.overallAssessment.length > 30
        ? aiAnalysis.overallAssessment
        : generateOverallAssessment(score, questionType),
        
      communicationClarity: Math.max(1, Math.min(10, aiAnalysis.communicationClarity || baseRating)),
      technicalAccuracy: Math.max(1, Math.min(10, aiAnalysis.technicalAccuracy || baseRating))
    };

    console.log('✅ ENHANCED AI FEEDBACK SUCCESS:', {
      score: structuredFeedback.score,
      responseType: structuredFeedback.responseType,
      aligned: mapScoreToResponseType(structuredFeedback.score) === structuredFeedback.responseType
    });

    console.timeEnd('ai-feedback-generation');
    return structuredFeedback;

  } catch (error) {
    console.timeEnd('ai-feedback-generation');
    console.error('❌ ENHANCED AI FEEDBACK ERROR:', error);
    return generateEnhancedFallbackFeedback(questionType, responseText, code, language, executionResults);
  }
}

function analyzeCodeQuality(code) {
  const analysis = {
    hasBasicStructure: /function|def|class|public|void/i.test(code),
    hasControlFlow: /if|else|for|while|switch/i.test(code),
    hasReturnStatement: /return/i.test(code),
    hasComments: /\/\/|\/\*|\#/i.test(code),
    hasVariables: /let|const|var|int|string|=/.test(code),
    hasLogic: code.length > 50 && /[{}();]/g.test(code),
    syntaxErrors: checkBasicSyntax(code),
    length: code.length
  };
  return analysis;
}


function checkBasicSyntax(code) {
  const errors = [];
  const openBraces = (code.match(/{/g) || []).length;
  const closeBraces = (code.match(/}/g) || []).length;
  const openParens = (code.match(/\(/g) || []).length;
  const closeParens = (code.match(/\)/g) || []).length;
  
  if (openBraces !== closeBraces) errors.push('Unmatched braces');
  if (openParens !== closeParens) errors.push('Unmatched parentheses');
  
  return errors;
}

function analyzeExecutionResults(executionResults) {
  if (!executionResults) return { hasOutput: false, hasError: false, score: 0 };
  
  return {
    hasOutput: !!(executionResults.output && executionResults.output.trim()),
    hasError: !!(executionResults.error && executionResults.error.trim()),
    outputLength: executionResults.output ? executionResults.output.length : 0,
    score: executionResults.error ? 0 : (executionResults.output ? 20 : 5)
  };
}

function analyzeTechnicalResponse(responseText) {
  return {
    hasTechnicalTerms: /\b(algorithm|function|variable|array|object|server|client|database|API|framework|library|HTTP|JSON|CSS|HTML|JavaScript|Python|Java)\b/i.test(responseText),
    hasExamples: /\b(example|instance|such as|like|for example)\b/i.test(responseText),
    hasExplanation: /\b(because|therefore|thus|since|reason|due to|this means|which allows)\b/i.test(responseText),
    hasStructure: responseText.includes('.') && responseText.length > 100,
    mentionsTools: /\b(Git|GitHub|VS Code|IDE|browser|command line|terminal)\b/i.test(responseText)
  };
}

function analyzeBehavioralResponse(responseText) {
  return {
    hasSituation: /\b(project|work|team|experience|situation|when|during|time)\b/i.test(responseText),
    hasAction: /\b(I did|I implemented|I decided|I approached|I solved|I learned|I worked|I used)\b/i.test(responseText),
    hasResult: /\b(result|outcome|success|completed|achieved|learned|improved|solved)\b/i.test(responseText),
    hasReflection: /\b(learned|realize|understand|discovered|found out|next time)\b/i.test(responseText),
    hasSpecifics: /\b(\d+|specific|particular|exactly|precisely)\b/i.test(responseText)
  };
}


function calculateCodingScore(codeAnalysis, executionAnalysis, responseText) {
  let score = 20; // Base score for attempting
  
  if (codeAnalysis.hasBasicStructure) score += 15;
  if (codeAnalysis.hasControlFlow) score += 15;
  if (codeAnalysis.hasReturnStatement) score += 10;
  if (codeAnalysis.hasVariables) score += 10;
  if (codeAnalysis.hasLogic) score += 10;
  if (codeAnalysis.syntaxErrors.length === 0) score += 15;
  if (executionAnalysis.hasOutput && !executionAnalysis.hasError) score += 20;
  if (responseText && responseText.length > 50) score += 5; // Explanation provided
  
  return Math.min(100, score);
}

function calculateTechnicalScore(technicalAnalysis, responseLength) {
  let score = 25; // Base score
  
  if (responseLength < 50) return 15;
  if (responseLength < 100) score = 35;
  else if (responseLength < 200) score = 45;
  else score = 55;
  
  if (technicalAnalysis.hasTechnicalTerms) score += 15;
  if (technicalAnalysis.hasExamples) score += 10;
  if (technicalAnalysis.hasExplanation) score += 10;
  if (technicalAnalysis.hasStructure) score += 5;
  if (technicalAnalysis.mentionsTools) score += 5;
  
  return Math.min(100, score);
}

function calculateBehavioralScore(behavioralAnalysis, responseLength) {
  let score = 25; // Base score
  
  if (responseLength < 100) return 20;
  else if (responseLength < 200) score = 40;
  else score = 50;
  
  const starElements = [
    behavioralAnalysis.hasSituation,
    behavioralAnalysis.hasAction,
    behavioralAnalysis.hasResult
  ].filter(Boolean).length;
  
  score += starElements * 10; // 10 points per STAR element
  
  if (behavioralAnalysis.hasReflection) score += 10;
  if (behavioralAnalysis.hasSpecifics) score += 10;
  
  return Math.min(100, score);
}

function generateCodingStrengths(codeAnalysis, executionAnalysis) {
  const strengths = [];
  
  if (codeAnalysis.hasBasicStructure) strengths.push('Provided proper function structure');
  if (codeAnalysis.hasControlFlow) strengths.push('Used appropriate control flow logic');
  if (codeAnalysis.hasReturnStatement) strengths.push('Included return statement');
  if (codeAnalysis.hasVariables) strengths.push('Used variables effectively');
  if (codeAnalysis.syntaxErrors.length === 0) strengths.push('Code has correct basic syntax');
  if (executionAnalysis.hasOutput && !executionAnalysis.hasError) strengths.push('Code executes successfully');
  
  return strengths.length > 0 ? strengths : ['Made an attempt to write code'];
}

function generateCodingImprovements(codeAnalysis, executionAnalysis) {
  const improvements = [];
  
  if (!codeAnalysis.hasBasicStructure) improvements.push('Use proper function or class structure');
  if (!codeAnalysis.hasControlFlow) improvements.push('Add logical control flow (if/else, loops)');
  if (!codeAnalysis.hasReturnStatement) improvements.push('Include return statement for function output');
  if (codeAnalysis.syntaxErrors.length > 0) improvements.push('Fix syntax errors: ' + codeAnalysis.syntaxErrors.join(', '));
  if (executionAnalysis.hasError) improvements.push('Debug and fix runtime errors');
  if (!executionAnalysis.hasOutput) improvements.push('Ensure code produces expected output');
  if (codeAnalysis.length < 30) improvements.push('Provide more complete implementation');
  
  improvements.push('Add comments to explain your logic');
  improvements.push('Test your solution with different inputs');
  
  return improvements;
}

function generateTechnicalStrengths(technicalAnalysis, responseLength) {
  const strengths = [];
  
  if (responseLength > 100) strengths.push('Provided detailed explanation');
  if (technicalAnalysis.hasTechnicalTerms) strengths.push('Used relevant technical terminology');
  if (technicalAnalysis.hasExamples) strengths.push('Included helpful examples');
  if (technicalAnalysis.hasExplanation) strengths.push('Explained reasoning and connections');
  if (technicalAnalysis.mentionsTools) strengths.push('Referenced relevant tools and technologies');
  
  return strengths.length > 0 ? strengths : ['Attempted to explain technical concepts'];
}

function generateTechnicalImprovements(technicalAnalysis, score) {
  const improvements = [];
  
  if (!technicalAnalysis.hasTechnicalTerms) improvements.push('Use more specific technical terminology');
  if (!technicalAnalysis.hasExamples) improvements.push('Include concrete examples to illustrate points');
  if (!technicalAnalysis.hasExplanation) improvements.push('Explain the reasoning behind statements');
  if (score < 50) improvements.push('Demonstrate deeper understanding of core concepts');
  
  improvements.push('Practice explaining technical concepts clearly');
  improvements.push('Study fundamental computer science principles');
  
  return improvements;
}

function generateBehavioralStrengths(behavioralAnalysis, responseLength) {
  const strengths = [];
  
  if (responseLength > 150) strengths.push('Provided comprehensive response');
  if (behavioralAnalysis.hasSituation) strengths.push('Described the context and situation clearly');
  if (behavioralAnalysis.hasAction) strengths.push('Explained specific actions taken');
  if (behavioralAnalysis.hasResult) strengths.push('Mentioned outcomes and results');
  if (behavioralAnalysis.hasReflection) strengths.push('Showed learning and reflection');
  if (behavioralAnalysis.hasSpecifics) strengths.push('Included specific details and examples');
  
  return strengths.length > 0 ? strengths : ['Provided personal example'];
}

function generateBehavioralImprovements(behavioralAnalysis, score) {
  const improvements = [];
  
  if (!behavioralAnalysis.hasSituation) improvements.push('Start by clearly describing the situation and context');
  if (!behavioralAnalysis.hasAction) improvements.push('Explain the specific actions you took');
  if (!behavioralAnalysis.hasResult) improvements.push('Describe the outcomes and results achieved');
  if (!behavioralAnalysis.hasReflection) improvements.push('Include what you learned from the experience');
  if (!behavioralAnalysis.hasSpecifics) improvements.push('Add more specific details and measurable outcomes');
  
  improvements.push('Structure responses using the STAR method');
  improvements.push('Practice telling compelling stories about your experiences');
  
  return improvements;
}

function generateEnhancedDetailedAnalysis(questionType, score, responseLength, hasCode, hasExecutionResults) {
  if (score >= 80) {
    return `Excellent ${questionType} response scoring ${score}/100. The candidate demonstrated strong understanding with ${responseLength} characters of relevant content${hasCode ? ' and functional code' : ''}${hasExecutionResults ? ' that executes successfully' : ''}. This performance exceeds typical intern expectations and shows great potential.`;
  } else if (score >= 60) {
    return `Good ${questionType} response scoring ${score}/100. The candidate showed solid understanding with ${responseLength} characters of content${hasCode ? ' and reasonable code attempt' : ''}. Performance meets intern-level expectations with room for improvement in technical depth and clarity.`;
  } else if (score >= 40) {
    return `Basic ${questionType} response scoring ${score}/100. The candidate demonstrated some understanding with ${responseLength} characters${hasCode ? ' and attempted code solution' : ''}, but lacks depth and technical accuracy expected for the role. Shows potential but needs development.`;
  } else if (score >= 20) {
    return `Below-average ${questionType} response scoring ${score}/100. The ${responseLength}-character response shows minimal understanding${hasCode ? ' with poor code quality' : ''} and significant gaps in knowledge. Substantial improvement needed for intern readiness.`;
  } else {
    return `Poor ${questionType} response scoring ${score}/100. The response demonstrates insufficient understanding and preparation${hasCode ? ' with non-functional code' : ''}. Requires fundamental skill development before being interview-ready.`;
  }
}

function generateEnhancedOverallAssessment(score, questionType) {
  if (score >= 80) return `Excellent ${questionType} performance - exceeds intern expectations with strong technical foundation and communication skills`;
  if (score >= 65) return `Good ${questionType} performance - meets intern expectations with solid understanding and clear potential for growth`;
  if (score >= 50) return `Acceptable ${questionType} performance - shows basic competency but needs continued development and mentoring`;
  if (score >= 35) return `Below expectations - requires focused improvement in fundamental concepts and communication before intern readiness`;
  return `Significantly below intern level - needs substantial preparation and skill development in ${questionType} areas`;
}

function generateEnhancedFallbackFeedback(questionType, responseText, code, language, executionResults) {
  console.log('🔄 Generating enhanced fallback feedback');
  const hasCode = code && code.trim().length > 0;
  const responseLength = responseText?.length || 0;
  const hasExecutionResults = executionResults && (executionResults.output || executionResults.error);
  
  let score = 35; // Start with a reasonable baseline
  let strengths = [];
  let improvements = [];
  let responseType = 'partially-relevant';
  
  // Enhanced evaluation logic based on question type
  if (questionType === 'coding') {
    if (!hasCode || code.trim().length < 20) {
      score = 15;
      strengths = ['Submitted a response'];
      improvements = ['Provide actual working code', 'Implement the required function', 'Show your problem-solving approach', 'Test your solution before submitting'];
      responseType = 'mostly-irrelevant';
    } else {
      // Analyze code quality with multiple factors
      const codeAnalysis = analyzeCodeQuality(code);
      const executionAnalysis = analyzeExecutionResults(executionResults);
      
      score = calculateCodingScore(codeAnalysis, executionAnalysis, responseText);
      strengths = generateCodingStrengths(codeAnalysis, executionAnalysis);
      improvements = generateCodingImprovements(codeAnalysis, executionAnalysis);
      responseType = mapScoreToResponseType(score);
    }
  } else if (questionType === 'technical') {
    const technicalAnalysis = analyzeTechnicalResponse(responseText);
    score = calculateTechnicalScore(technicalAnalysis, responseLength);
    strengths = generateTechnicalStrengths(technicalAnalysis, responseLength);
    improvements = generateTechnicalImprovements(technicalAnalysis, score);
    responseType = mapScoreToResponseType(score);
  } else if (questionType === 'behavioral') {
    const behavioralAnalysis = analyzeBehavioralResponse(responseText);
    score = calculateBehavioralScore(behavioralAnalysis, responseLength);
    strengths = generateBehavioralStrengths(behavioralAnalysis, responseLength);
    improvements = generateBehavioralImprovements(behavioralAnalysis, score);
    responseType = mapScoreToResponseType(score);
  }

  // Ensure alignment between score and responseType
  responseType = mapScoreToResponseType(score);

  return {
    score: Math.max(0, Math.min(100, score)),
    questionRelevance: Math.max(1, Math.min(10, Math.floor(score / 10))),
    responseType: responseType,
    correctness: Math.max(1, Math.min(10, Math.floor(score / 10))),
    syntax: hasCode ? Math.max(1, Math.min(10, Math.floor(score / 12))) : Math.floor(score / 15),
    languageBestPractices: Math.max(1, Math.min(10, Math.floor(score / 15))),
    efficiency: Math.max(1, Math.min(10, Math.floor(score / 20))),
    structureAndReadability: Math.max(1, Math.min(10, Math.floor(score / 15))),
    edgeCaseHandling: Math.max(1, Math.min(10, Math.floor(score / 25))),
    strengths: strengths.length > 0 ? strengths : ['Made an attempt to answer'],
    improvements: improvements.length > 0 ? improvements : ['Practice fundamental concepts', 'Provide more detailed explanations'],
    detailedAnalysis: generateEnhancedDetailedAnalysis(questionType, score, responseLength, hasCode, hasExecutionResults),
    overallAssessment: generateEnhancedOverallAssessment(score, questionType),
    communicationClarity: Math.max(1, Math.min(10, Math.floor(score / 15))),
    technicalAccuracy: Math.max(1, Math.min(10, Math.floor(score / 15)))
  };
}

// Helper functions for better contextual feedback
function generateContextualStrengths(questionType, score, responseText, code) {
  console.time('contextual-strengths-generation');
  const strengths = [];
  
  if (score >= 70) {
    if (questionType === 'coding' && code) {
      strengths.push('Provided working code solution');
      if (code.includes('return')) strengths.push('Included proper return statement');
      if (/\b(if|else|for|while)\b/i.test(code)) strengths.push('Used appropriate control structures');
    } else if (questionType === 'technical') {
      if (responseText.length > 100) strengths.push('Provided comprehensive explanation');
      if (/\b(example|instance|such as)\b/i.test(responseText)) strengths.push('Included relevant examples');
    } else if (questionType === 'behavioral') {
      if (responseText.length > 150) strengths.push('Provided detailed response');
      if (/\b(I did|I implemented|I learned)\b/i.test(responseText)) strengths.push('Used specific personal examples');
    }
  } else if (score >= 40) {
    strengths.push('Made a genuine attempt to answer');
    if (responseText.length > 50) strengths.push('Provided substantive response');
  } else {
    strengths.push('Submitted a response');
  }
  
  console.timeEnd('contextual-strengths-generation');
  return strengths.length > 0 ? strengths : ['Attempted to answer the question'];
}

function generateContextualImprovements(questionType, score, responseText, code) {
  console.time('contextual-improvements-generation');
  const improvements = [];
  
  if (score < 30) {
    improvements.push('Response needs to directly address the question asked');
    improvements.push('Show understanding of core concepts');
    if (questionType === 'coding') improvements.push('Provide actual working code');
  } else if (score < 50) {
    improvements.push('Provide more specific technical details');
    improvements.push('Include concrete examples or evidence');
    if (questionType === 'coding') improvements.push('Improve code logic and structure');
  } else if (score < 70) {
    improvements.push('Add more depth to technical explanations');
    improvements.push('Consider edge cases and trade-offs');
    if (questionType === 'behavioral') improvements.push('Structure response using STAR method');
  } else {
    improvements.push('Consider additional optimization opportunities');
    improvements.push('Explain reasoning and decision-making process');
  }
  
  console.timeEnd('contextual-improvements-generation');
  return improvements;
}

function generateDetailedAnalysis(questionType, score, responseText, code, question) {
  const responseLength = responseText?.length || 0;
  const hasCode = code && code.trim().length > 0;
  
  if (score < 25) {
    if (questionType === 'coding' && !hasCode) {
      return `Failed to provide any code for this coding question. The response of ${responseLength} characters doesn't address the programming requirements and shows lack of understanding of what was being asked.`;
    }
    return `Response demonstrates minimal understanding of the question. With only ${responseLength} characters, it fails to address the core requirements and lacks the technical depth needed for a proper answer.`;
  } else if (score < 50) {
    if (questionType === 'coding' && hasCode) {
      return `Code attempt was made but contains significant logical issues or syntax problems. The ${responseLength} character response shows basic programming concepts but fails to solve the problem effectively.`;
    }
    return `Response shows basic understanding but lacks technical accuracy and depth. The ${responseLength} character answer addresses some aspects but misses key concepts expected for this ${questionType} question.`;
  } else if (score < 70) {
    return `Solid attempt with reasonable understanding demonstrated. The ${responseLength} character response covers main points but could benefit from more specific examples, deeper technical details, and clearer explanation of reasoning.`;
  } else {
    return `Good response showing strong technical understanding. The ${responseLength} character answer effectively addresses the question with appropriate detail and demonstrates solid grasp of the concepts.`;
  }
}

function generateOverallAssessment(score, questionType) {
  if (score >= 80) return `Excellent performance for an intern-level ${questionType} question - shows strong foundation`;
  if (score >= 65) return `Good performance meeting expectations for intern level with room for growth`;
  if (score >= 50) return `Acceptable performance but requires development in key areas`;
  if (score >= 35) return `Below expectations - needs focused study and practice`;
  return `Significantly below intern level - requires substantial preparation before being job-ready`;
}

// Instant feedback for skipped questions
function generateSkippedQuestionFeedback() {
  return {
    score: 0,
    questionRelevance: 0,
    responseType: "skipped",
    correctness: 0,
    syntax: 0,
    languageBestPractices: 0,
    efficiency: 0,
    structureAndReadability: 0,
    edgeCaseHandling: 0,
    strengths: ["None - question was skipped"],
    improvements: [
      "Always attempt to answer interview questions",
      "Prepare thoroughly before interviews",
      "Practice explaining your thought process"
    ],
    detailedAnalysis: "Question was skipped - shows lack of preparation and engagement",
    overallAssessment: "Skipping questions is a significant concern in interviews",
    communicationClarity: 0,
    technicalAccuracy: 0
  };
}

// Enhanced fallback feedback with stricter scoring and better context awareness
function generateFallbackFeedback(questionType, responseText, code) {
  console.time('fallback-feedback-generation');
  const hasCode = code && code.trim().length > 0;
  const responseLength = responseText?.length || 0;
  
  let score = 30; // Start lower - most responses need improvement
  let strengths = [];
  let improvements = [];
  let responseType = 'mostly-irrelevant';
  
  // Strict evaluation based on response characteristics
  if (questionType === 'coding') {
    if (!hasCode || code.trim().length < 10) {
      score = 5; // Almost no effort
      strengths = ['Submitted response'];
      improvements = ['Must provide actual code', 'Implement the required function', 'Show problem-solving approach'];
      responseType = 'completely-off-topic';
    } else {
      // Check for basic programming constructs
      const hasBasicSyntax = /\b(function|def|class|return|if|for|while|let|const|var|int|string)\b/i.test(code);
      const hasLogic = /\b(if|else|for|while|loop)\b/i.test(code);
      const hasReturn = /\breturn\b/i.test(code);
      
      if (hasBasicSyntax && hasLogic && hasReturn) {
        score = 55; // Basic attempt with some logic
        strengths = ['Provided code structure', 'Used appropriate syntax', 'Included control flow'];
        improvements = ['Optimize algorithm efficiency', 'Add error handling', 'Consider edge cases'];
        responseType = 'partially-relevant';
      } else if (hasBasicSyntax) {
        score = 35; // Some syntax but lacks logic
        strengths = ['Attempted code solution'];
        improvements = ['Add proper logic flow', 'Include return statements', 'Complete the algorithm'];
        responseType = 'mostly-irrelevant';
      } else {
        score = 15; // Poor code quality
        strengths = ['Made an attempt'];
        improvements = ['Use proper programming syntax', 'Implement actual logic', 'Study basic programming concepts'];
        responseType = 'mostly-irrelevant';
      }
    }
  } else if (questionType === 'technical') {
    // Technical questions require specific knowledge
    if (responseLength < 50) {
      score = 10;
      strengths = ['Provided brief response'];
      improvements = ['Provide detailed technical explanation', 'Include specific examples', 'Demonstrate deeper understanding'];
      responseType = 'completely-off-topic';
    } else if (responseLength < 150) {
      // Check for technical terms or concepts
      const hasTechnicalTerms = /\b(algorithm|database|API|framework|library|function|variable|array|object|server|client|HTTP|JSON|SQL)\b/i.test(responseText);
      
      if (hasTechnicalTerms) {
        score = 45;
        strengths = ['Used relevant technical terminology', 'Attempted to explain concepts'];
        improvements = ['Provide more detailed explanations', 'Include practical examples', 'Explain trade-offs and considerations'];
        responseType = 'partially-relevant';
      } else {
        score = 20;
        strengths = ['Provided some explanation'];
        improvements = ['Use technical terminology correctly', 'Show understanding of core concepts', 'Provide specific examples'];
        responseType = 'mostly-irrelevant';
      }
    } else {
      // Longer response - check quality indicators
      const hasExamples = /\b(example|instance|such as|like|for example)\b/i.test(responseText);
      const hasExplanation = /\b(because|therefore|thus|since|reason|due to)\b/i.test(responseText);
      
      if (hasExamples && hasExplanation) {
        score = 65;
        strengths = ['Comprehensive explanation', 'Included examples', 'Showed reasoning'];
        improvements = ['Add more technical depth', 'Consider alternative approaches', 'Discuss potential issues'];
        responseType = 'mostly-relevant';
      } else {
        score = 50;
        strengths = ['Detailed response', 'Attempted thorough explanation'];
        improvements = ['Include concrete examples', 'Explain reasoning more clearly', 'Show deeper technical understanding'];
        responseType = 'partially-relevant';
      }
    }
  } else { // Behavioral questions
    if (responseLength < 100) {
      score = 15;
      strengths = ['Provided response'];
      improvements = ['Use STAR method (Situation, Task, Action, Result)', 'Provide specific examples', 'Explain learning outcomes'];
      responseType = 'mostly-irrelevant';
    } else {
      // Check for STAR method indicators
      const hasSituation = /\b(project|work|team|experience|situation|when|during)\b/i.test(responseText);
      const hasAction = /\b(I did|I implemented|I decided|I approached|I solved|I learned)\b/i.test(responseText);
      const hasResult = /\b(result|outcome|success|completed|achieved|learned)\b/i.test(responseText);
      
      const starCount = [hasSituation, hasAction, hasResult].filter(Boolean).length;
      
      if (starCount >= 2) {
        score = 60;
        strengths = ['Used structured approach', 'Provided specific example', 'Explained actions taken'];
        improvements = ['Include more measurable results', 'Explain lessons learned', 'Connect to job requirements'];
        responseType = 'mostly-relevant';
      } else {
        score = 35;
        strengths = ['Provided personal example'];
        improvements = ['Structure response using STAR method', 'Be more specific about actions', 'Explain what you learned'];
        responseType = 'partially-relevant';
      }
    }
  }

  console.timeEnd('fallback-feedback-generation');
  return {
    score: score,
    questionRelevance: Math.max(1, Math.floor(score / 15)),
    responseType: responseType, // Now using valid enum values
    correctness: Math.max(1, Math.floor(score / 15)),
    syntax: hasCode ? Math.max(1, Math.floor(score / 12)) : Math.floor(score / 15),
    languageBestPractices: Math.max(1, Math.floor(score / 15)),
    efficiency: Math.max(1, Math.floor(score / 20)),
    structureAndReadability: Math.max(1, Math.floor(score / 15)),
    edgeCaseHandling: Math.max(1, Math.floor(score / 25)),
    strengths: strengths,
    improvements: improvements,
    detailedAnalysis: generateStrictAnalysis(questionType, score, responseLength, hasCode),
    overallAssessment: generateStrictAssessment(score),
    communicationClarity: Math.max(1, Math.floor(score / 15)),
    technicalAccuracy: Math.max(1, Math.floor(score / 15))
  };
}

function generateStrictAnalysis(questionType, score, responseLength, hasCode) {
  if (score < 25) {
    if (questionType === 'coding' && !hasCode) {
      return 'Failed to provide code for a coding question, showing lack of preparation and understanding of requirements. This demonstrates insufficient readiness for technical interviews.';
    }
    return `Response demonstrates minimal understanding and fails to address core question requirements effectively. The ${responseLength} character response lacks the technical depth and accuracy expected.`;
  } else if (score < 50) {
    return `Basic attempt with ${responseLength} characters but lacks technical depth and specific examples needed for thorough evaluation. Shows some understanding but significant gaps remain.`;
  } else if (score < 70) {
    return `Shows reasonable understanding with some good elements, but missing key details and depth expected for complete answer. The ${responseLength} character response covers basics but needs more comprehensive coverage.`;
  } else {
    return `Solid response demonstrating good understanding with ${responseLength} characters of relevant content, though could benefit from additional technical details or examples for exceptional performance.`;
  }
}

function generateStrictAssessment(score) {
  if (score < 20) return 'Significantly below expectations - requires substantial improvement and preparation';
  if (score < 40) return 'Below intern level expectations - needs focused study and practice in fundamental concepts';
  if (score < 60) return 'Approaching acceptable level but requires development in key technical areas';
  if (score < 75) return 'Meets basic intern expectations with room for growth and deeper understanding';
  return 'Good performance for intern level with strong foundation and clear potential for growth';
}

export const skipQuestion = async (req, res) => {
  const startTime = Date.now();
  console.log('⏭️ Skip question started');
  
  try {
    const { interviewId } = req.params;
    const userId = req.user?.userId || req.user?.id || req.user?._id;

    console.log('📋 Fetching interview');
    const dbStartTime = Date.now();
    const interview = await InterviewModel.findOne({ _id: interviewId, userId });
    const dbDuration = Date.now() - dbStartTime;
    console.log('✅ Interview fetched - Duration:', dbDuration, 'ms');

    if (!interview) {
      console.log('❌ Interview not found - Total Duration:', Date.now() - startTime, 'ms');
      return res.status(404).json({ 
        success: false,
        error: 'Interview not found' 
      });
    }

    const currentQuestionIndex = interview.responses.length;
    if (currentQuestionIndex >= interview.questions.length) {
      console.log('❌ No more questions to skip - Total Duration:', Date.now() - startTime, 'ms');
      return res.status(400).json({
        success: false,
        error: 'No more questions to skip'
      });
    }

    const question = interview.questions[currentQuestionIndex];
    
    // Minimal skip response - no feedback generation
    const skipResponse = {
      questionId: question.questionId,
      question: question.question,
      questionType: question.type,
      transcription: null,
      textResponse: 'Question skipped',
      code: null,
      language: null,
      responseTime: 0,
      recordingDuration: null,
      submittedAt: new Date(),
      skipped: true,
      feedback: null // No feedback for skipped questions
    };

    interview.responses.push(skipResponse);
    interview.currentQuestionIndex = interview.responses.length;
    interview.updatedAt = new Date();

    if (interview.status === 'created') {
      interview.status = 'in_progress';
      interview.startedAt = new Date();
    }

    console.log('💾 Saving skip to database');
    const saveStartTime = Date.now();
    await interview.save();
    const saveDuration = Date.now() - saveStartTime;
    console.log('✅ Skip saved - Duration:', saveDuration, 'ms');

    console.log('✅ Skip question completed - Total Duration:', Date.now() - startTime, 'ms');
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
    console.error('❌ Skip question error - Duration:', Date.now() - startTime, 'ms', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to skip question',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const completeInterview = async (req, res) => {
  console.time('complete-interview-total');
  try {
    const { interviewId } = req.params;
    const userId = req.user?.userId || req.user?.id || req.user?._id;

    console.time('complete-interview-db-query');
    const interview = await InterviewModel.findOne({ _id: interviewId, userId });
    console.timeEnd('complete-interview-db-query');

    if (!interview) {
      console.timeEnd('complete-interview-total');
      return res.status(404).json({ 
        success: false,
        error: 'Interview not found' 
      });
    }

    if (interview.status === 'completed') {
      const results = calculateFinalResults(interview.responses, interview.totalDuration || 0);
      console.timeEnd('complete-interview-total');
      return res.json({
        success: true,
        message: 'Interview already completed',
        results
      });
    }

    let overallAnalysis;
    console.time('overall-analysis');
    try {
      overallAnalysis = await generateOverallFeedback(interview.responses);
    } catch (feedbackError) {
      console.error('Overall feedback generation failed:', feedbackError.message);
      console.time('fast-overall-feedback');
      overallAnalysis = generateFastOverallFeedback(interview.responses);
      console.timeEnd('fast-overall-feedback');
    }
    console.timeEnd('overall-analysis');

    console.time('interview-completion-processing');
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
    console.timeEnd('interview-completion-processing');

    console.time('complete-interview-db-save');
    await interview.save();
    console.timeEnd('complete-interview-db-save');

    console.timeEnd('complete-interview-total');
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
    console.timeEnd('complete-interview-total');
    console.error('Complete interview error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to complete interview',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

async function generateOverallFeedback(responses) {
  console.time('generate-overall-feedback');
  try {
    // Filter out skipped questions for analysis
    const answeredResponses = responses.filter(r => !r.skipped && r.feedback);
    const skippedCount = responses.filter(r => r.skipped).length;
    
    if (answeredResponses.length === 0) {
      // All questions were skipped - return immediate feedback
      console.timeEnd('generate-overall-feedback');
      return {
        score: 0,
        feedback: {
          readinessLevel: 'Not Ready for Intern Role',
          strengths: ['Completed interview session'],
          improvements: ['Answer questions instead of skipping', 'Prepare thoroughly before interviews', 'Build confidence in technical skills'],
          recommendations: ['Study fundamental concepts', 'Practice coding problems', 'Work on personal projects'],
          generalFeedback: `All ${responses.length} questions were skipped, indicating lack of preparation or confidence. This is a significant concern for interview readiness.`,
          categoryScores: {
            technicalKnowledge: 0,
            codingAbility: 0,
            behavioralSkills: 0,
            communication: 0
          }
        }
      };
    }

    console.time('overall-feedback-model-init');
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-pro",
      generationConfig: { 
        temperature: 0.3,
        maxOutputTokens: 800,
      }
    });
    console.timeEnd('overall-feedback-model-init');

    console.time('overall-feedback-data-prep');
    const scores = answeredResponses.map(r => r.feedback?.score || 0);
    const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    
    const behavioralCount = answeredResponses.filter(r => r.questionType === 'behavioral').length;
    const technicalCount = answeredResponses.filter(r => r.questionType === 'technical').length;
    const codingCount = answeredResponses.filter(r => r.questionType === 'coding').length;
    console.timeEnd('overall-feedback-data-prep');

    const prompt = `You are a senior hiring manager conducting final assessment of an intern interview. Provide honest, constructive evaluation.

INTERVIEW SUMMARY:
- Total Questions: ${responses.length}
- Questions Answered: ${answeredResponses.length}
- Questions Skipped: ${skippedCount}
- Behavioral Questions Answered: ${behavioralCount}
- Technical Questions Answered: ${technicalCount}  
- Coding Questions Answered: ${codingCount}
- Average Score (answered questions): ${averageScore.toFixed(1)}/100

INDIVIDUAL QUESTION PERFORMANCE:
${answeredResponses.map((r, i) => `Q${i+1} (${r.questionType}): ${r.feedback?.score || 0}/100`).join('\n')}
${skippedCount > 0 ? `${skippedCount} questions were skipped` : ''}

STRICT EVALUATION CRITERIA:
- 85-100: Exceptional candidate, exceeds intern expectations
- 70-84: Strong candidate, ready for intern position  
- 55-69: Acceptable candidate, needs mentoring but has potential
- 40-54: Weak candidate, requires significant development
- 0-39: Not ready for intern position

NOTE: Skipped questions significantly impact overall assessment and readiness evaluation.

Return ONLY this JSON:
{
  "overallScore": 45,
  "readinessLevel": "Needs Development Before Ready",
  "keyStrengths": ["Specific strengths observed across answered questions"],
  "majorImprovements": ["Critical areas requiring focused improvement"],
  "recommendations": ["Specific, actionable steps for improvement"],
  "generalFeedback": "Honest assessment including impact of skipped questions",
  "hiringRecommendation": "Clear recommendation with justification"
}

readinessLevel options:
- "Ready for Intern Position" (70+ average, no skips)
- "Nearly Ready with Mentoring" (55-69 average, minimal skips)  
- "Needs Development Before Ready" (40-54 average or significant skips)
- "Not Yet Ready for Intern Role" (below 40 average or mostly skipped)

hiringRecommendation options:
- "Strong Hire" - Exceptional performance
- "Hire" - Meets requirements well
- "Hire with Mentoring" - Has potential, needs support  
- "No Hire - Reapply After Development" - Not ready currently

Factor in skipped questions as a negative indicator of interview readiness.`;

    console.log('Generating overall interview feedback...');
    console.time('overall-feedback-api-call');
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawText = response.text();
    console.timeEnd('overall-feedback-api-call');

    console.time('overall-feedback-processing');
    let cleanText = rawText.trim().replace(/```json\s*|```\s*/g, '');
    let aiAnalysis = JSON.parse(cleanText);
    console.timeEnd('overall-feedback-processing');

    console.timeEnd('generate-overall-feedback');
    return {
      score: Math.round(aiAnalysis.overallScore || averageScore),
      feedback: {
        readinessLevel: aiAnalysis.readinessLevel || 'Under Assessment',
        strengths: Array.isArray(aiAnalysis.keyStrengths) ? aiAnalysis.keyStrengths : ['Completed interview'],
        improvements: Array.isArray(aiAnalysis.majorImprovements) ? aiAnalysis.majorImprovements : ['Continue practicing'],
        recommendations: Array.isArray(aiAnalysis.recommendations) ? aiAnalysis.recommendations : ['Build experience'],
        generalFeedback: aiAnalysis.generalFeedback || `Answered ${answeredResponses.length}/${responses.length} questions with ${averageScore.toFixed(1)}% average.`,
        categoryScores: calculateCategoryScores(answeredResponses)
      }
    };

  } catch (error) {
    console.timeEnd('generate-overall-feedback');
    console.error('Overall feedback generation failed:', error.message);
    return generateFastOverallFeedback(responses);
  }
}

// Fast fallback for overall feedback
function generateFastOverallFeedback(responses) {
  console.time('fast-overall-feedback');
  const scores = responses.map(r => r.feedback?.score || 0);
  const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  
  const readinessLevel = averageScore >= 75 ? 'Ready for Intern Position' : 
                        averageScore >= 60 ? 'Nearly Ready' : 
                        averageScore >= 45 ? 'Needs Development' : 'Not Ready Yet';
  
  const result = {
    score: Math.round(averageScore),
    feedback: {
      readinessLevel: readinessLevel,
      strengths: [
        'Completed all interview questions',
        averageScore >= 70 ? 'Demonstrated good understanding' : 'Showed engagement with questions'
      ],
      improvements: [
        averageScore < 60 ? 'Focus on technical fundamentals' : 'Continue developing skills',
        'Practice explaining concepts clearly'
      ],
      recommendations: [
        'Build personal projects',
        'Practice coding problems',
        'Study computer science fundamentals'
      ],
      generalFeedback: `Completed ${responses.length} questions with ${averageScore.toFixed(1)}% average. ${readinessLevel} based on performance.`,
      categoryScores: calculateCategoryScores(responses)
    }
  };
  console.timeEnd('fast-overall-feedback');
  return result;
}

function calculateCategoryScores(responses) {
  const behavioralResponses = responses.filter(r => r.questionType === 'behavioral');
  const technicalResponses = responses.filter(r => r.questionType === 'technical');
  const codingResponses = responses.filter(r => r.questionType === 'coding');
  
  const averageScore = responses.reduce((sum, r) => sum + (r.feedback?.score || 0), 0) / responses.length;

  return {
    technicalKnowledge: technicalResponses.length > 0 
      ? Math.round(technicalResponses.reduce((sum, r) => sum + (r.feedback?.score || 0), 0) / technicalResponses.length)
      : Math.round(averageScore),
    codingAbility: codingResponses.length > 0 
      ? Math.round(codingResponses.reduce((sum, r) => sum + (r.feedback?.score || 0), 0) / codingResponses.length)
      : Math.round(averageScore),
    behavioralSkills: behavioralResponses.length > 0 
      ? Math.round(behavioralResponses.reduce((sum, r) => sum + (r.feedback?.score || 0), 0) / behavioralResponses.length)
      : Math.round(averageScore),
    communication: Math.round(responses.reduce((sum, r) => sum + (r.feedback?.communicationClarity || 5), 0) / responses.length)
  };
}

export const getInterviewFeedback = async (req, res) => {
  console.time('get-interview-feedback-total');
  try {
    const { interviewId } = req.params;
    const userId = req.user?.userId || req.user?.id || req.user?._id;

    console.time('get-feedback-db-query');
    const interview = await InterviewModel.findOne({ _id: interviewId, userId });
    console.timeEnd('get-feedback-db-query');

    if (!interview) {
      console.timeEnd('get-interview-feedback-total');
      return res.status(404).json({ 
        success: false,
        error: 'Interview not found' 
      });
    }

    console.time('calculate-final-results');
    const finalResults = calculateFinalResults(interview.responses, interview.totalDuration || 0);
    console.timeEnd('calculate-final-results');

    console.timeEnd('get-interview-feedback-total');
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
    console.timeEnd('get-interview-feedback-total');
    console.error('Get feedback error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get feedback' 
    });
  }
};

export const getUserInterviews = async (req, res) => {
  console.time('get-user-interviews-total');
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    const { page = 1, limit = 10 } = req.query;

    console.time('get-interviews-db-query');
    const interviews = await InterviewModel.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('status overallFeedback createdAt completedAt totalDuration');

    const total = await InterviewModel.countDocuments({ userId });
    console.timeEnd('get-interviews-db-query');

    console.timeEnd('get-user-interviews-total');
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
    console.timeEnd('get-user-interviews-total');
    console.error('Get user interviews error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get interview history' 
    });
  }
};

export const getInterview = async (req, res) => {
  console.time('get-interview-total');
  try {
    const { interviewId } = req.params;
    const userId = req.user?.userId || req.user?.id || req.user?._id;

    console.time('get-interview-db-query');
    const interview = await InterviewModel.findOne({ _id: interviewId, userId });
    console.timeEnd('get-interview-db-query');

    if (!interview) {
      console.timeEnd('get-interview-total');
      return res.status(404).json({ 
        success: false,
        error: 'Interview not found' 
      });
    }

    console.timeEnd('get-interview-total');
    res.json({
      success: true,
      interview
    });
  } catch (error) {
    console.timeEnd('get-interview-total');
    console.error('Get interview error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get interview details' 
    });
  }
};

function calculateFinalResults(responses, totalDuration) {
  console.time('calculate-final-results');
  
  // Filter out skipped questions when calculating scores
  const answeredResponses = responses.filter(r => !r.skipped && r.feedback);
  const skippedCount = responses.filter(r => r.skipped).length;
  
  if (answeredResponses.length === 0) {
    // All questions were skipped
    console.timeEnd('calculate-final-results');
    return {
      score: 0,
      duration: totalDuration,
      categoryPercentages: {
        behavioral: 0,
        technical: 0,
        coding: 0,
        communication: 0,
        technicalAccuracy: 0,
        problemSolving: 0
      },
      breakdown: {
        totalQuestions: responses.length,
        answeredQuestions: 0,
        skippedQuestions: skippedCount,
        behavioralQuestions: 0,
        technicalQuestions: 0,
        codingQuestions: 0,
        averageResponseTime: 0
      }
    };
  }
  
  const scores = answeredResponses.map(r => r.feedback?.score || 0);
  const overallScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  
  const behavioralResponses = answeredResponses.filter(r => r.questionType === 'behavioral');
  const technicalResponses = answeredResponses.filter(r => r.questionType === 'technical');
  const codingResponses = answeredResponses.filter(r => r.questionType === 'coding');

  const categoryScores = {
    behavioral: behavioralResponses.length > 0 
      ? Math.round(behavioralResponses.reduce((sum, r) => sum + (r.feedback?.score || 0), 0) / behavioralResponses.length)
      : Math.round(overallScore),
    
    technical: technicalResponses.length > 0 
      ? Math.round(technicalResponses.reduce((sum, r) => sum + (r.feedback?.score || 0), 0) / technicalResponses.length)
      : Math.round(overallScore),
    
    coding: codingResponses.length > 0 
      ? Math.round(codingResponses.reduce((sum, r) => sum + (r.feedback?.score || 0), 0) / codingResponses.length)
      : Math.round(overallScore)
  };

  const communicationScore = Math.round(
    answeredResponses.reduce((sum, r) => sum + (r.feedback?.communicationClarity || 5), 0) / answeredResponses.length
  );

  const technicalAccuracyScore = Math.round(
    answeredResponses.reduce((sum, r) => sum + (r.feedback?.technicalAccuracy || 5), 0) / answeredResponses.length
  );

  const problemSolvingScore = Math.round(
    (categoryScores.coding + categoryScores.technical) / 2
  );

  const result = {
    score: Math.round(overallScore),
    duration: totalDuration,
    categoryPercentages: {
      behavioral: categoryScores.behavioral,
      technical: categoryScores.technical,
      coding: categoryScores.coding,
      communication: (communicationScore / 10) * 100,
      technicalAccuracy: (technicalAccuracyScore / 10) * 100,
      problemSolving: problemSolvingScore
    },
    breakdown: {
      totalQuestions: responses.length,
      answeredQuestions: answeredResponses.length,
      skippedQuestions: skippedCount,
      behavioralQuestions: behavioralResponses.length,
      technicalQuestions: technicalResponses.length,
      codingQuestions: codingResponses.length,
      averageResponseTime: answeredResponses.length > 0 
        ? Math.round(answeredResponses.reduce((sum, r) => sum + (r.responseTime || 0), 0) / answeredResponses.length)
        : 0
    }
  };
  console.timeEnd('calculate-final-results');
  return result;
}


