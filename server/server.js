import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import connectDB from './config/mongodb.js';

import authRouter from './routes/AuthRoutes.js';
import skillAssessor from './routes/SkillAssessorRoutes.js';
import userRouter from './routes/UserRoutes.js';
import analysisRouter from './routes/CVanalysisRoutes.js';
import interviewRouter from './routes/InterviewRoutes.js';
import codeRouter from './routes/codeRoutes.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 4000;

// ---------------- DATABASE ----------------
connectDB();

// ---------------- MIDDLEWARE ----------------
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:5174'
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000 // 10 minutes
  }
}));

// ---------------- ROUTES ----------------
app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/analyze', analysisRouter);
app.use('/api/swot', skillAssessor);
app.use('/api/interviews', interviewRouter);
app.use('/api/code', codeRouter);

// ---------------- STATIC FILES ----------------
app.use(express.static(path.join(__dirname, '../client/dist')));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// ---------------- ERROR HANDLER ----------------
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// ---------------- SERVER ----------------
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

export default app;
