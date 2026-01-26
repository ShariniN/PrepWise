import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { spawn } from 'child_process';
import userAuth from '../middleware/userAuth.js';
import rateLimit from 'express-rate-limit';

import { 
  startInterview, 
  getNextQuestion, 
  submitAnswer, 
  completeInterview, 
  getInterviewFeedback, 
  getUserInterviews, 
  getInterview, 
  getUserCV,  
  createInterviewWithProfileCV,
  createInterview,
  skipQuestion,
  processCV,
  executeCodeWithJDoodle // Use the corrected function from controller
} from '../controllers/interviewController.js';

const interviewRouter = express.Router();

// Rate limiting for code execution
const codeExecutionLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Increased limit for better UX
  message: 'Too many code execution requests, please try again later.'
});

// AssemblyAI configuration
const assemblyAIConfig = {
  baseUrl: "https://api.assemblyai.com",
  headers: {
    authorization: process.env.ASSEMBLYAI_API_KEY || "09e162bb0a7a4478bfb5092b53b53b58",
  }
};

// Disk storage for audio files
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/audio';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `audio_${Date.now()}_${Math.random().toString(36).substring(7)}.webm`);
  }
});

const uploadToDisk = multer({
  storage: diskStorage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/webm', 'audio/wav', 'audio/mp3', 'audio/m4a'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid audio format'), false);
    }
  }
});

// Memory storage for temporary uploads
const uploadToMemory = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/') || file.mimetype === 'application/octet-stream') {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'), false);
    }
  }
});

// AssemblyAI transcription function
const transcribeWithAssemblyAI = async (audioPath) => {
  try {
    console.log('Starting AssemblyAI transcription for:', audioPath);

    // Upload audio to AssemblyAI
    const audioData = fs.readFileSync(audioPath);
    const uploadResponse = await axios.post(
      `${assemblyAIConfig.baseUrl}/v2/upload`, 
      audioData, 
      { headers: assemblyAIConfig.headers }
    );
    
    const audioUrl = uploadResponse.data.upload_url;
    console.log('Audio uploaded to AssemblyAI:', audioUrl);

    // Request transcription
    const transcriptionData = {
      audio_url: audioUrl,
      speech_model: "universal",
    };

    const transcriptionResponse = await axios.post(
      `${assemblyAIConfig.baseUrl}/v2/transcript`,
      transcriptionData,
      { headers: assemblyAIConfig.headers }
    );

    const transcriptId = transcriptionResponse.data.id;
    console.log('Transcription requested with ID:', transcriptId);

    // Poll for completion
    const pollingEndpoint = `${assemblyAIConfig.baseUrl}/v2/transcript/${transcriptId}`;
    
    while (true) {
      console.log('Polling transcription status...');
      
      const pollingResponse = await axios.get(pollingEndpoint, {
        headers: assemblyAIConfig.headers,
      });
      
      const transcriptionResult = pollingResponse.data;
      
      if (transcriptionResult.status === "completed") {
        console.log('Transcription completed successfully');
        return {
          text: transcriptionResult.text,
          duration: transcriptionResult.audio_duration || null,
          confidence: transcriptionResult.confidence || null
        };
      } else if (transcriptionResult.status === "error") {
        throw new Error(`AssemblyAI transcription failed: ${transcriptionResult.error}`);
      } else {
        console.log(`Transcription status: ${transcriptionResult.status}, waiting...`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  } catch (error) {
    console.error('AssemblyAI transcription error:', error);
    throw error;
  }
};

// Transcription endpoint
export const transcribeAudio = async (req, res) => {
  try {
    console.log('Transcription request received');
    console.log('User in transcribe:', req.user);
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No audio file provided'
      });
    }

    const audioFile = req.file;
    console.log('Audio file:', {
      filename: audioFile.filename,
      size: audioFile.size,
      mimetype: audioFile.mimetype
    });

    if (!fs.existsSync(audioFile.path)) {
      return res.status(400).json({
        success: false,
        error: 'Audio file not found'
      });
    }

    try {
      const transcription = await transcribeWithAssemblyAI(audioFile.path);

      console.log('Transcription completed:', {
        text_length: transcription.text?.length || 0,
        text_preview: transcription.text?.substring(0, 100) || 'No text'
      });

      // Cleanup file after 5 seconds
      setTimeout(() => {
        try {
          if (fs.existsSync(audioFile.path)) {
            fs.unlinkSync(audioFile.path);
            console.log('Cleaned up temporary audio file');
          }
        } catch (cleanupError) {
          console.error('Error cleaning up file:', cleanupError);
        }
      }, 5000);

      res.json({
        success: true,
        text: transcription.text,
        duration: transcription.duration || null,
        confidence: transcription.confidence || null
      });

    } catch (transcriptionError) {
      console.error('Transcription API error:', transcriptionError);
      
      if (fs.existsSync(audioFile.path)) {
        fs.unlinkSync(audioFile.path);
      }

      res.status(500).json({
        success: false,
        error: 'Transcription failed',
        details: process.env.NODE_ENV === 'development' ? transcriptionError.message : undefined
      });
    }

  } catch (error) {
    console.error('Transcription endpoint error:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      error: 'Server error during transcription',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Mock transcription for testing
const mockTranscribeAudio = async (req, res) => {
  try {
    const audioFile = req.file;
    
    if (!audioFile) {
      return res.status(400).json({
        success: false,
        error: 'Audio file is required'
      });
    }

    const mockTranscription = "This is a mock transcription. The candidate provided a thoughtful response discussing their technical experience and problem-solving approach.";
    
    res.json({
      success: true,
      text: mockTranscription,
      duration: Math.floor(audioFile.size / 1000),
      confidence: 0.95
    });
    
  } catch (error) {
    console.error('Mock transcription error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to transcribe audio'
    });
  }
};

// Public routes (before userAuth middleware)
interviewRouter.post('/transcribe', uploadToDisk.single('audio'), transcribeAudio);
interviewRouter.post('/transcribe-mock', uploadToMemory.single('audio'), mockTranscribeAudio);

// Apply authentication middleware to all routes below this point
interviewRouter.use(userAuth);

// CORRECTED: Use the fixed controller function directly
interviewRouter.post('/execute', codeExecutionLimiter, executeCodeWithJDoodle);
interviewRouter.post('/execute-code', codeExecutionLimiter, executeCodeWithJDoodle);

// CV management routes
interviewRouter.get('/cv', getUserCV);
interviewRouter.post('/process-cv', processCV);

// Interview creation routes
interviewRouter.post('/create', createInterview);
interviewRouter.post('/create-with-profile-cv', createInterviewWithProfileCV);

// Interview management routes
interviewRouter.get('/:interviewId', getInterview);
interviewRouter.put('/:interviewId/start', startInterview);
interviewRouter.post('/:interviewId/answer', uploadToDisk.single('audio'), submitAnswer);
interviewRouter.post('/:interviewId/submit-answer', uploadToMemory.single('audio'), submitAnswer);
interviewRouter.post('/:interviewId/skip', skipQuestion);
interviewRouter.get('/:interviewId/next-question', getNextQuestion);
interviewRouter.put('/:interviewId/complete', completeInterview);

// Feedback and analysis routes
interviewRouter.get('/:interviewId/feedback', getInterviewFeedback);

// User history routes
interviewRouter.get('/user/history', getUserInterviews);
interviewRouter.get('/history', getUserInterviews);

// Local code execution fallback (keep for testing)
const executeCodeLocal = async (code, language) => {
  return new Promise((resolve, reject) => {
    let command, args, fileExtension;
    const tempFileName = `temp_${Date.now()}`;
    
    switch (language.toLowerCase()) {
      case 'javascript':
      case 'js':
      case 'nodejs':
        command = 'node';
        args = ['-e', code];
        break;
      case 'python':
      case 'py':
      case 'python3':
        command = 'python3';
        args = ['-c', code];
        break;
      case 'java':
        fileExtension = '.java';
        fs.writeFileSync(`${tempFileName}.java`, code);
        command = 'javac';
        args = [`${tempFileName}.java`];
        break;
      case 'cpp':
      case 'c++':
        fileExtension = '.cpp';
        fs.writeFileSync(`${tempFileName}.cpp`, code);
        command = 'g++';
        args = ['-o', tempFileName, `${tempFileName}.cpp`];
        break;
      case 'c':
        fileExtension = '.c';
        fs.writeFileSync(`${tempFileName}.c`, code);
        command = 'gcc';
        args = ['-o', tempFileName, `${tempFileName}.c`];
        break;
      default:
        reject(new Error(`Unsupported language: ${language}`));
        return;
    }

    const process = spawn(command, args, {
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (exitCode) => {
      const cleanup = () => {
        try {
          if (fileExtension && fs.existsSync(`${tempFileName}${fileExtension}`)) {
            fs.unlinkSync(`${tempFileName}${fileExtension}`);
          }
          if (fs.existsSync(tempFileName)) {
            fs.unlinkSync(tempFileName);
          }
          if (language.toLowerCase() === 'java' && fs.existsSync(`${tempFileName}.class`)) {
            fs.unlinkSync(`${tempFileName}.class`);
          }
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError);
        }
      };

      // Handle compiled languages
      if (language.toLowerCase() === 'java' && exitCode === 0) {
        const javaProcess = spawn('java', ['Solution'], {
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let javaStdout = '';
        let javaStderr = '';

        javaProcess.stdout.on('data', (data) => {
          javaStdout += data.toString();
        });

        javaProcess.stderr.on('data', (data) => {
          javaStderr += data.toString();
        });

        javaProcess.on('close', (javaExitCode) => {
          cleanup();
          resolve({
            success: javaExitCode === 0,
            output: javaStdout || javaStderr || 'No output',
            error: javaExitCode !== 0 ? javaStderr : null,
            exitCode: javaExitCode
          });
        });
      } else if ((language.toLowerCase() === 'cpp' || language.toLowerCase() === 'c') && exitCode === 0) {
        const execProcess = spawn(`./${tempFileName}`, [], {
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let execStdout = '';
        let execStderr = '';

        execProcess.stdout.on('data', (data) => {
          execStdout += data.toString();
        });

        execProcess.stderr.on('data', (data) => {
          execStderr += data.toString();
        });

        execProcess.on('close', (execExitCode) => {
          cleanup();
          resolve({
            success: execExitCode === 0,
            output: execStdout || execStderr || 'No output',
            error: execExitCode !== 0 ? execStderr : null,
            exitCode: execExitCode
          });
        });
      } else {
        cleanup();
        resolve({
          success: exitCode === 0,
          output: stdout || stderr || 'No output',
          error: exitCode !== 0 ? stderr : null,
          exitCode
        });
      }
    });

    process.on('error', (error) => {
      reject(new Error(`Process error: ${error.message}`));
    });

    // Timeout safety
    setTimeout(() => {
      process.kill('SIGTERM');
      reject(new Error('Code execution timeout'));
    }, 15000);
  });
};

// Local execution endpoint (fallback)
interviewRouter.post('/execute-code-local', async (req, res) => {
  try {
    const { code, language } = req.body;

    if (!code || !language) {
      return res.status(400).json({
        success: false,
        error: 'Code and language are required'
      });
    }

    const result = await executeCodeLocal(code, language);

    res.json({
      success: true,
      output: result.output,
      error: result.error,
      executionTime: null,
      memory: null,
      statusCode: result.exitCode
    });

  } catch (error) {
    console.error('Local code execution error:', error);
    res.status(500).json({
      success: false,
      error: 'Code execution failed',
      details: error.message
    });
  }
});

// Error handling middleware
interviewRouter.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File size too large. Maximum size allowed is 25MB.'
      });
    }
  }
  
  if (error.message === 'Invalid audio format' || error.message === 'Only audio files are allowed') {
    return res.status(400).json({
      success: false,
      error: 'Invalid file type. Please upload audio files only.'
    });
  }
  
  if (error.message === 'Unsupported code file format') {
    return res.status(400).json({
      success: false,
      error: 'Unsupported code file format. Please upload valid code files.'
    });
  }
  
  next(error);
});

export default interviewRouter;