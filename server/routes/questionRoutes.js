import express from 'express';
import expressRateLimit from 'express-rate-limit';
import userAuth from '../middleware/userAuth.js';
import requireRole from '../middleware/requireRole.js';
import {
  listQuestions, getQuestion, createQuestion, updateQuestion, deleteQuestion, duplicateQuestion, listTests, addTest, updateTest,
  deleteTest, validateQuestion, setStatus, getRubric, putRubric, deleteRubric, draftWithAi,
} from '../controllers/questionController.js';

const questionRouter = express.Router();

const perUser = (max) => expressRateLimit({
  windowMs: 60 * 1000, max, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `u:${req.user?.id}`,
  message: { success: false, message: 'Too many requests. Please slow down.' },
});
const validateLimiter = perUser(Number(process.env.QUESTION_VALIDATE_LIMIT) || 20);
const draftLimiter = perUser(Number(process.env.QUESTION_DRAFT_LIMIT) || 6);

questionRouter.use(userAuth, requireRole('lecturer', 'university_admin'));

questionRouter.get('/', listQuestions);
questionRouter.post('/', createQuestion);
questionRouter.post('/draft', draftLimiter, draftWithAi); // before /:id
questionRouter.get('/:id', getQuestion);
questionRouter.put('/:id', updateQuestion);
questionRouter.delete('/:id', deleteQuestion);
questionRouter.post('/:id/duplicate', duplicateQuestion);
questionRouter.patch('/:id/status', setStatus);
questionRouter.post('/:id/validate', validateLimiter, validateQuestion);
questionRouter.get('/:id/tests', listTests);
questionRouter.post('/:id/tests', addTest);
questionRouter.put('/:id/tests/:testId', updateTest);
questionRouter.delete('/:id/tests/:testId', deleteTest);
questionRouter.get('/:id/rubric', getRubric);
questionRouter.put('/:id/rubric', putRubric);
questionRouter.delete('/:id/rubric', deleteRubric);

export default questionRouter;
