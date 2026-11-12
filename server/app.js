import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

import authRouter from './modules/auth/auth.routes.js';
import userRouter from './modules/users/users.routes.js';
import analysisRouter from './modules/cvAnalysis/cvAnalysis.routes.js';
import interviewRouter from './modules/interviews/interviews.routes.js';
import institutionRouter from './modules/people/people.routes.js';
import institutionSettingsRouter from './modules/institution/institution.routes.js';
import meRouter from './modules/compliance/me.routes.js';
import complianceRouter from './modules/compliance/compliance.routes.js';
import practiceRouter from './modules/practice/practice.routes.js';
import dashboardRouter from './modules/dashboard/dashboard.routes.js';

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

// Outside production any localhost port may call the API (Vite picks a free port when 5173 is taken).
const localhostOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    if (process.env.NODE_ENV !== 'production' && localhostOrigin.test(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ---------------- ROUTES ----------------
app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/analyze', analysisRouter);
app.use('/api/interviews', interviewRouter);
app.use('/api/institution', institutionSettingsRouter);
app.use('/api/institution', institutionRouter);
app.use('/api/me', meRouter);
app.use('/api/compliance', complianceRouter);
app.use('/api/practice', practiceRouter);
app.use('/api/dashboard', dashboardRouter);

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
