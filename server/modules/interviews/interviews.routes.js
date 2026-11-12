import express from 'express';
import multer from 'multer';
import userAuth from '../../middleware/userAuth.js';
import { executeCode } from '../code/code.controller.js';
import rateLimit from 'express-rate-limit';
import { transcriptionService, TranscriptionUnavailableError } from '../../services/transcription.js';

import {
  startInterview,
  submitAnswer,
  completeInterview,
  getInterviewFeedback,
  getUserInterviews,
  getInterview,
  getInterviewSetup,
  createInterview
} from './interviews.controller.js';

const interviewRouter = express.Router();

// Rate limiting for code execution
const codeExecutionLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Increased limit for better UX
  message: 'Too many code execution requests, please try again later.'
});

const MAX_AUDIO_MB = 25; // Groq's limit for one transcription upload
const NOT_AUDIO = 'Only audio files are allowed';
// Audio stays in memory for the one request and is never written to disk.
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/') || file.mimetype === 'application/octet-stream') cb(null, true);
    else cb(new Error(NOT_AUDIO), false);
  }
});

const TRANSCRIPTION_UNAVAILABLE = "Voice answers aren't available right now. Type your answer instead.";

export const transcribeAudio = async (req, res) => {
  if (!req.file?.buffer?.length) {
    return res.status(400).json({ success: false, error: 'No audio file provided', message: 'No audio file provided' });
  }
  if (!process.env.GROQ_API_KEY) {
    return res.status(503).json({ success: false, code: 'TRANSCRIPTION_UNAVAILABLE', message: TRANSCRIPTION_UNAVAILABLE, error: TRANSCRIPTION_UNAVAILABLE });
  }
  try {
    const { text, durationSec } = await transcriptionService.transcribe(req.file.buffer, {
      filename: req.file.originalname || 'answer.webm', mimetype: req.file.mimetype,
    });
    res.json({ success: true, text, durationSec });
  } catch (error) {
    if (!(error instanceof TranscriptionUnavailableError)) console.error('Transcription error:', error);
    else console.error(error.message);
    res.status(503).json({ success: false, code: 'TRANSCRIPTION_UNAVAILABLE', message: TRANSCRIPTION_UNAVAILABLE, error: TRANSCRIPTION_UNAVAILABLE });
  }
};

// All interview routes require authentication
interviewRouter.use(userAuth);

interviewRouter.post('/transcribe', audioUpload.single('audio'), transcribeAudio);

// Old path kept for older clients; same single execution service as /api/code/execute
interviewRouter.post('/execute-code', codeExecutionLimiter, executeCode);

// Start screen and interview creation
interviewRouter.get('/setup', getInterviewSetup);
interviewRouter.post('/create', createInterview);

// User history routes
interviewRouter.get('/history', getUserInterviews);

// Interview management routes
interviewRouter.get('/:interviewId', getInterview);
interviewRouter.put('/:interviewId/start', startInterview);
interviewRouter.post('/:interviewId/submit-answer', submitAnswer);
interviewRouter.put('/:interviewId/complete', completeInterview);

// Feedback and analysis routes
interviewRouter.get('/:interviewId/feedback', getInterviewFeedback);

// Error handling middleware
interviewRouter.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: `File size too large. Maximum size allowed is ${MAX_AUDIO_MB}MB.`
      });
    }
    return res.status(400).json({ success: false, error: error.message });
  }

  if (error.message === NOT_AUDIO) {
    return res.status(400).json({
      success: false,
      error: 'Invalid file type. Please upload audio files only.'
    });
  }

  next(error);
});

export default interviewRouter;
