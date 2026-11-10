import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import userAuth from '../middleware/userAuth.js';
import { executeCode } from '../controllers/codeController.js';
import rateLimit from 'express-rate-limit';

import { 
  startInterview, 
  getNextQuestion, 
  submitAnswer, 
  completeInterview, 
  getInterviewFeedback, 
  getUserInterviews, 
  getInterview, 
  createInterviewWithProfileCV,
  createInterview,
  processCV
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
    authorization: process.env.ASSEMBLYAI_API_KEY,
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
      // Keep "um", "uh" and similar: the interview coaching counts filler words from this transcript.
      disfluencies: true,
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
    // Log the provider's own message (e.g. why a 4xx happened), not just the axios wrapper.
    console.error('AssemblyAI transcription error:', error.response?.status, JSON.stringify(error.response?.data || error.message).slice(0, 500));
    throw error;
  }
};

// Transcription endpoint
export const transcribeAudio = async (req, res) => {
  try {
    console.log('Transcription request received');
    
    if (!process.env.ASSEMBLYAI_API_KEY) {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(503).json({ success: false, error: 'Transcription is not configured' });
    }

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

// All interview routes require authentication
interviewRouter.use(userAuth);

interviewRouter.post('/transcribe', uploadToDisk.single('audio'), transcribeAudio);

// Old path kept for older clients; same single execution service as /api/code/execute
interviewRouter.post('/execute-code', codeExecutionLimiter, executeCode);

// CV management routes
interviewRouter.post('/process-cv', processCV);

// Interview creation routes
interviewRouter.post('/create', createInterview);
interviewRouter.post('/create-with-profile-cv', createInterviewWithProfileCV);

// User history routes
interviewRouter.get('/history', getUserInterviews);

// Interview management routes
interviewRouter.get('/:interviewId', getInterview);
interviewRouter.put('/:interviewId/start', startInterview);
interviewRouter.post('/:interviewId/submit-answer', uploadToMemory.single('audio'), submitAnswer);
interviewRouter.get('/:interviewId/next-question', getNextQuestion);
interviewRouter.put('/:interviewId/complete', completeInterview);

// Feedback and analysis routes
interviewRouter.get('/:interviewId/feedback', getInterviewFeedback);

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
  
  next(error);
});

export default interviewRouter;