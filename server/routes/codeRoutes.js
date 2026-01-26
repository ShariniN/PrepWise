import express from 'express';
import axios from 'axios';
import expressRateLimit from 'express-rate-limit';
import userAuth from '../middleware/userAuth.js';

const codeRouter = express.Router();

// JDoodle configuration with fallback handling
const jdoodleConfig = {
  baseUrl: "https://api.jdoodle.com/v1/execute",
  clientId: process.env.JDOODLE_CLIENT_ID,
  clientSecret: process.env.JDOODLE_CLIENT_SECRET
};

// Check if JDoodle is properly configured
const isJDoodleConfigured = () => {
  return !!(jdoodleConfig.clientId && jdoodleConfig.clientSecret && 
           jdoodleConfig.clientId !== "your_jdoodle_client_id" && 
           jdoodleConfig.clientSecret !== "your_jdoodle_client_secret");
};

// Rate limiting for code execution
const codeExecutionLimiter = expressRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each user to 50 executions per 15 minutes
  message: {
    success: false,
    error: 'Too many code execution requests. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Language mapping for JDoodle with version indices
const jdoodleLanguageMap = {
  'nodejs': { language: 'nodejs', versionIndex: '4' },
  'python3': { language: 'python3', versionIndex: '4' },
  'java': { language: 'java', versionIndex: '4' },
  'c': { language: 'c', versionIndex: '5' },
  'cpp': { language: 'cpp', versionIndex: '5' },
  'csharp': { language: 'csharp', versionIndex: '4' },
  'php': { language: 'php', versionIndex: '4' },
  'go': { language: 'go', versionIndex: '4' },
  'javascript': { language: 'nodejs', versionIndex: '4' }, // Alias
  'python': { language: 'python3', versionIndex: '4' }     // Alias
};

// Mock execution for testing when JDoodle is not configured
const mockCodeExecution = async (script, language) => {
  console.log('🔧 Using mock code execution (JDoodle not configured)');
  
  // Simulate execution delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Simple mock responses based on language
  const mockResponses = {
    'javascript': 'Mock output: JavaScript code executed successfully\nHello, World!',
    'python': 'Mock output: Python code executed successfully\nHello, World!',
    'java': 'Mock output: Java code compiled and executed\nHello, World!',
    'csharp': 'Mock output: C# code compiled and executed\nHello, World!',
    'cpp': 'Mock output: C++ code compiled and executed\nHello, World!'
  };
  
  const normalizedLang = language.toLowerCase().replace(/[0-9]/g, '');
  const output = mockResponses[normalizedLang] || `Mock output: ${language} code executed\nResult: Success`;
  
  return {
    success: true,
    output: output,
    error: '',
    executionTime: '0.1s',
    memory: '8192KB'
  };
};

// JDoodle code execution function
const executeCodeWithJDoodleAPI = async (script, language, versionIndex, stdin = '') => {
  try {
    console.log(`Executing code with JDoodle: ${language}`);
    
    // Check if JDoodle is configured
    if (!isJDoodleConfigured()) {
      console.warn('JDoodle not configured, using mock execution');
      return await mockCodeExecution(script, language);
    }
    
    // Map language to JDoodle format
    const langConfig = jdoodleLanguageMap[language.toLowerCase()];
    if (!langConfig) {
      throw new Error(`Unsupported language: ${language}. Supported languages: ${Object.keys(jdoodleLanguageMap).join(', ')}`);
    }

    // Use provided versionIndex or default from mapping
    const finalVersionIndex = versionIndex || langConfig.versionIndex;

    const requestBody = {
      script: script,
      language: langConfig.language,
      versionIndex: finalVersionIndex,
      stdin: stdin || '',
      clientId: jdoodleConfig.clientId,
      clientSecret: jdoodleConfig.clientSecret
    };

    console.log('JDoodle request:', {
      language: requestBody.language,
      versionIndex: requestBody.versionIndex,
      hasStdin: !!requestBody.stdin,
      scriptLength: requestBody.script.length,
      clientIdPresent: !!requestBody.clientId,
      clientSecretPresent: !!requestBody.clientSecret
    });

    const response = await axios.post(jdoodleConfig.baseUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });

    const result = response.data;
    console.log('JDoodle response status:', response.status);
    console.log('JDoodle response data:', {
      hasOutput: !!result.output,
      hasError: !!result.error,
      outputLength: result.output?.length || 0,
      errorLength: result.error?.length || 0,
      executionTime: result.cpuTime,
      memory: result.memory
    });

    // Handle JDoodle response format
    return {
      success: !result.error || result.error.trim() === '',
      output: result.output || '',
      error: result.error || '',
      executionTime: result.cpuTime || null,
      memory: result.memory || null,
      statusCode: result.statusCode || null
    };

  } catch (error) {
    console.error('JDoodle execution error:', error);
    
    // Handle specific JDoodle errors
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      console.error('JDoodle HTTP Error:', {
        status,
        statusText: error.response.statusText,
        data: data
      });
      
      if (status === 401 || status === 403) {
        console.error('JDoodle authentication failed - using mock execution');
        return await mockCodeExecution(script, language);
      } else if (status === 429) {
        throw new Error('JDoodle API rate limit exceeded. Please try again later.');
      } else if (status === 400) {
        throw new Error(`JDoodle API error: ${data.error || 'Invalid request parameters'}`);
      }
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Code execution timeout. Please optimize your code and try again.');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.error('JDoodle service unavailable - using mock execution');
      return await mockCodeExecution(script, language);
    }
    
    throw new Error(`Code execution failed: ${error.message}`);
  }
};

// Apply authentication middleware
codeRouter.use(userAuth);

// Code execution endpoint - matches frontend expectation: /api/code/execute
codeRouter.post('/execute', codeExecutionLimiter, async (req, res) => {
  try {
    const { script, language, versionIndex, stdin } = req.body;

    console.log('Code execution request received:', {
      hasScript: !!script,
      language,
      versionIndex,
      hasStdin: !!stdin,
      scriptLength: script?.length || 0,
      userAgent: req.get('User-Agent'),
      userId: req.user?.userId || req.user?.id || req.user?._id
    });

    if (!script || !language) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: script and language are required'
      });
    }

    if (typeof script !== 'string' || script.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Script must be a non-empty string'
      });
    }

    if (typeof language !== 'string' || language.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Language must be a non-empty string'
      });
    }

    // Log JDoodle configuration status
    console.log('JDoodle configuration status:', {
      isConfigured: isJDoodleConfigured(),
      hasClientId: !!jdoodleConfig.clientId,
      hasClientSecret: !!jdoodleConfig.clientSecret,
      clientId: jdoodleConfig.clientId ? jdoodleConfig.clientId.substring(0, 8) + '...' : 'Not set'
    });

    const result = await executeCodeWithJDoodleAPI(script, language, versionIndex, stdin);

    // Log execution for monitoring
    console.log('Code execution completed:', {
      userId: req.user?.userId || req.user?.id || req.user?._id,
      language: language,
      success: result.success,
      executionTime: result.executionTime,
      memory: result.memory,
      outputLength: result.output?.length || 0,
      hasError: !!result.error
    });

    res.json({
      success: true,
      output: result.output || '',
      error: result.error || '',
      executionTime: result.executionTime,
      memory: result.memory,
      statusCode: result.statusCode
    });

  } catch (error) {
    console.error('Code execution endpoint error:', error);
    
    // Determine appropriate error response
    let errorMessage = 'Code execution failed. Please try again.';
    let statusCode = 500;
    
    if (error.message.includes('rate limit')) {
      errorMessage = 'Too many requests. Please wait before trying again.';
      statusCode = 429;
    } else if (error.message.includes('Unsupported language')) {
      errorMessage = error.message;
      statusCode = 400;
    } else if (error.message.includes('timeout')) {
      errorMessage = 'Code execution timed out. Please optimize your code.';
      statusCode = 408;
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Health check endpoint
codeRouter.get('/health', (req, res) => {
  const healthStatus = {
    success: true,
    message: 'Code execution service is running',
    supportedLanguages: Object.keys(jdoodleLanguageMap),
    jdoodleConfigured: isJDoodleConfigured(),
    timestamp: new Date().toISOString()
  };
  
  if (!isJDoodleConfigured()) {
    healthStatus.warning = 'JDoodle API not configured - using mock execution';
    healthStatus.jdoodleCredentials = {
      clientId: jdoodleConfig.clientId ? 'Set' : 'Not set',
      clientSecret: jdoodleConfig.clientSecret ? 'Set' : 'Not set'
    };
  }
  
  res.json(healthStatus);
});

// Test endpoint for checking specific language support
codeRouter.get('/languages', (req, res) => {
  res.json({
    success: true,
    languages: Object.entries(jdoodleLanguageMap).map(([key, config]) => ({
      name: key,
      jdoodleLanguage: config.language,
      versionIndex: config.versionIndex
    })),
    jdoodleConfigured: isJDoodleConfigured()
  });
});

export default codeRouter;