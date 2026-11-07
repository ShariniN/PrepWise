import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

import authRouter from './routes/AuthRoutes.js';
import skillAssessor from './routes/SkillAssessorRoutes.js';
import userRouter from './routes/UserRoutes.js';
import analysisRouter from './routes/CVanalysisRoutes.js';
import interviewRouter from './routes/InterviewRoutes.js';
import codeRouter from './routes/codeRoutes.js';
import institutionRouter from './routes/InstitutionRoutes.js';
import courseRouter from './routes/CourseRoutes.js';
import meRouter from './routes/MeRoutes.js';
import complianceRouter from './routes/ComplianceRoutes.js';
import practiceRouter from './routes/practiceRoutes.js';
import questionRouter from './routes/questionRoutes.js';
import analyticsRouter from './routes/AnalyticsRoutes.js';
import gradingRouter from './routes/GradingRoutes.js';
import assessmentRouter from './routes/assessmentRoutes.js';
import integrityRouter from './routes/integrityRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ---------------- MIDDLEWARE ----------------
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:5174'
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ---------------- ROUTES ----------------
app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/analyze', analysisRouter);
app.use('/api/swot', skillAssessor);
app.use('/api/interviews', interviewRouter);
app.use('/api/code', codeRouter);
app.use('/api/institution', institutionRouter);
app.use('/api/courses', courseRouter);
app.use('/api/me', meRouter);
app.use('/api/compliance', complianceRouter);
app.use('/api/practice', practiceRouter);
app.use('/api/questions', questionRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/grading', gradingRouter);
app.use('/api/assessments', assessmentRouter);
app.use('/api/integrity', integrityRouter);

// Unknown API paths must return JSON 404, never the web page
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

// ---------------- STATIC FILES ----------------
app.use(express.static(path.join(__dirname, '../client/dist')));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// ---------------- ERROR HANDLER ----------------
app.use((error, req, res, next) => {
  // Typed errors raised from shared code (tenancy, AI usage cap)
  if (error?.code === 'AI_MONTHLY_CAP' || error?.name === 'TenantError' || error?.code === 'EXECUTION_UNAVAILABLE') {
    return res.status(error.status).json({ success: false, message: error.message, code: error.code });
  }
  console.error(error);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

export default app;
