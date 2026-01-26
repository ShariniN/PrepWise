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
import trainerRoutes from "./routes/TrainerRoutes.js";
import trainingRouter from './routes/TrainingRoute.js';
import adminRouter from './routes/AdminRoutes.js';
import noticesRouter from './routes/NoticesRoute.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dotenv.config();
const app = express();

// Session configuration (OPTIONAL - we're using in-memory storage)
// Only add if you want to use session-based OTP storage instead
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

// Email configuration validation
const validateEmailConfig = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠️  EMAIL_USER or EMAIL_PASS not configured. OTP emails will fail.');
    console.log('📧 To fix this:');
    console.log('1. Set EMAIL_USER to your Gmail address');
    console.log('2. Set EMAIL_PASS to your Gmail App Password (not regular password)');
    console.log('3. Enable 2FA and generate App Password in Gmail settings');
  } else {
    console.log('✅ Email configuration found');
  }
};

// Call validation on startup
validateEmailConfig();


const port = process.env.PORT || 4000

connectDB();

// CORS Configuration
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:5174'
];

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({ 
  origin: allowedOrigins, 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Add request logging middleware for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ---------------- ROUTES ----------------
app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/analyze', analysisRouter);
app.use('/api/swot', skillAssessor);
app.use('/api/interviews', interviewRouter);
app.use('/api/admin', adminRouter);
app.use('/api/notices', noticesRouter);
app.use('/api/code', codeRouter);


// Fixed trainer and training routes
app.use('/api/trainer', trainerRoutes); // Trainer profile routes
app.use('/api/trainings', trainingRouter); // Training CRUD routes (FIXED)
// app.use('/api//training-details/:id',TrainingDetailsPage);

// Test route to verify server is working
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Server is running!',
    timestamp: new Date().toISOString(),
    availableRoutes: {
      trainers: '/api/trainer',
      trainings: '/api/trainings',
      auth: '/api/auth'
    }
  });
});

// ---------------- STATIC ----------------
app.use(express.static(path.join(__dirname, '../client/dist')));
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

app.listen(port, () => {
  console.log(`Server started on PORT: ${port}`);
  console.log(`Available routes:`);
  console.log(`- Trainers: http://localhost:${port}/api/trainer`);
  console.log(`- Trainings: http://localhost:${port}/api/trainings`);
});

export default app;