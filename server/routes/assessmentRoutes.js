import express from 'express';
import expressRateLimit from 'express-rate-limit';
import userAuth from '../middleware/userAuth.js';
import requireRole from '../middleware/requireRole.js';
import * as c from '../controllers/assessmentController.js';
import { postIntegrityEvents } from '../controllers/integrityController.js';

const assessmentRouter = express.Router();
const student = requireRole('student');
const staff = requireRole('lecturer', 'university_admin');

const perUser = (max, windowMs = 60 * 1000) => expressRateLimit({
  windowMs, max, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `u:${req.user?.id}`,
  message: { success: false, message: 'Too many requests. Please slow down.' },
});
const runLimiter = perUser(Number(process.env.PRACTICE_RUN_LIMIT) || 20);
const submitLimiter = perUser(Number(process.env.PRACTICE_SUBMIT_LIMIT) || 20);
const eventLimiter = perUser(Number(process.env.INTEGRITY_EVENT_LIMIT) || 120);

assessmentRouter.use(userAuth);

// ---- student session routes (declared first so "sessions" is never read as an assessment id) ----
assessmentRouter.get('/sessions/:sessionId', student, c.getSession);
assessmentRouter.get('/sessions/:sessionId/results', student, c.sessionResults);
assessmentRouter.get('/sessions/:sessionId/questions/:questionId', student, c.getSessionQuestion);
assessmentRouter.post('/sessions/:sessionId/questions/:questionId/run', student, runLimiter, c.runInSession);
assessmentRouter.post('/sessions/:sessionId/questions/:questionId/submit', student, submitLimiter, c.submitInSession);
assessmentRouter.put('/sessions/:sessionId/questions/:questionId/autosave', student, c.autosaveInSession);
assessmentRouter.post('/sessions/:sessionId/questions/:questionId/events', student, c.eventsInSession);
assessmentRouter.post('/sessions/:sessionId/integrity-events', student, eventLimiter, postIntegrityEvents);
assessmentRouter.post('/sessions/:sessionId/finish', student, c.finishSession);

// ---- shared list / detail (role decides the view) ----
assessmentRouter.get('/', requireRole('student', 'lecturer', 'university_admin'), c.listAssessments);
assessmentRouter.get('/:id', requireRole('student', 'lecturer', 'university_admin'), c.getAssessment);
assessmentRouter.post('/:id/start', student, c.startSession);

// ---- staff ----
assessmentRouter.post('/', staff, c.createAssessment);
assessmentRouter.put('/:id', staff, c.updateAssessment);
assessmentRouter.patch('/:id/status', staff, c.setStatus);
assessmentRouter.put('/:id/accommodations/:userId', staff, c.setAccommodation);
assessmentRouter.delete('/:id/accommodations/:userId', staff, c.removeAccommodation);
assessmentRouter.get('/:id/sessions', staff, c.listSessions);
assessmentRouter.post('/:id/sessions/:sessionId/extend', staff, c.extendSession);

export default assessmentRouter;
