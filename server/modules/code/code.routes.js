import express from 'express';
import expressRateLimit from 'express-rate-limit';
import userAuth from '../../middleware/userAuth.js';
import { executeCode, executionHealth } from './code.controller.js';

const codeRouter = express.Router();

// Rate limiting for code execution
export const codeExecutionLimiter = expressRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // per 15 minutes
  message: { success: false, error: 'Too many code execution requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

codeRouter.use(userAuth);

codeRouter.post('/execute', codeExecutionLimiter, executeCode);
codeRouter.get('/health', executionHealth);
codeRouter.get('/languages', executionHealth);

export default codeRouter;
