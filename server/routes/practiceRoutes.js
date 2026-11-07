import express from 'express';
import expressRateLimit from 'express-rate-limit';
import userAuth from '../middleware/userAuth.js';
import requireRole from '../middleware/requireRole.js';
import { blockLockedQuestion, blockLockedAttempt } from '../services/assessments/lock.js';
import {
  listQuestions, getQuestion, runCode, submit, startDraft, getDraft, autosave, addEvents,
} from '../controllers/practiceController.js';

const practiceRouter = express.Router();

const perUser = (max, windowMs = 60 * 1000) => expressRateLimit({
  windowMs, max, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `u:${req.user?.id}`,
  message: { success: false, message: 'Too many requests. Please slow down.' },
});

// Limits are env-tunable so tests can lower them.
const runLimiter = perUser(Number(process.env.PRACTICE_RUN_LIMIT) || 20);
const submitLimiter = perUser(Number(process.env.PRACTICE_SUBMIT_LIMIT) || 20);

practiceRouter.use(userAuth, requireRole('student'));

practiceRouter.get('/questions', listQuestions);
practiceRouter.get('/questions/:id', blockLockedQuestion, getQuestion);
practiceRouter.post('/questions/:id/run', blockLockedQuestion, runLimiter, runCode);
practiceRouter.post('/questions/:id/submit', blockLockedQuestion, submitLimiter, submit);
practiceRouter.post('/questions/:id/attempts', blockLockedQuestion, startDraft);
practiceRouter.get('/questions/:id/draft', blockLockedQuestion, getDraft);
practiceRouter.put('/attempts/:id/autosave', blockLockedAttempt, autosave);
practiceRouter.post('/attempts/:id/events', blockLockedAttempt, addEvents);

export default practiceRouter;
