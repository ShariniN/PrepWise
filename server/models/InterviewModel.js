import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  questionId: { type: String, required: true },
  type: { 
    type: String, 
    required: true, 
    enum: ['behavioral', 'technical', 'system_design', 'coding', 'problem-solving'] 
  },
  question: { type: String, required: true },
  category: { type: String, required: true },
  difficulty: { 
    type: String, 
    required: true, 
    enum: ['easy', 'medium', 'hard'] 
  },
  expectedDuration: { type: Number, default: 120 }, 
  // Optional hidden tests for coding questions. Never sent to the client (see getNextQuestion).
  tests: { type: [new mongoose.Schema({ input: String, expectedOutput: String, comparison: String }, { _id: true })], default: undefined },
  followUpQuestions: [{ type: String }],
  starterCode: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  language: { 
    type: String,
    default: null // Language for coding questions
  }
});

const executionResultsSchema = new mongoose.Schema({
  output: { type: String },
  error: { type: String },
  executionTime: { type: String },
  memory: { type: String },
  success: { type: Boolean, default: false },
  statusCode: { type: Number },
  // Set by the server when it re-runs the code. Anything the browser sends for these fields is discarded.
  verdict: { type: String },
  serverVerified: { type: Boolean, default: false },
  unavailable: { type: Boolean, default: false },
  testsPassed: { type: Number },
  testsTotal: { type: Number },
  executedAt: { type: Date, default: Date.now }
}, { _id: false });

// Delivery coaching, measured in the student's browser (camera + transcript). Numbers only:
// no video or images are ever uploaded or stored. Coaching only: never feeds into the score.
// Sanitised by sanitizeDeliveryMetrics in controllers/interviewController.js before it is stored.
const deliveryMetricsSchema = new mongoose.Schema({
  cameraUsed: { type: Boolean, default: false },
  faceVisiblePct: { type: Number, min: 0, max: 100, default: null },
  eyeContactPct: { type: Number, min: 0, max: 100, default: null },
  lookAwayCount: { type: Number, min: 0, default: null },
  headMovement: { type: String, enum: ['low', 'medium', 'high', null], default: null },
  wordsPerMinute: { type: Number, min: 0, default: null },
  fillerWordCount: { type: Number, min: 0, default: null },
  durationSec: { type: Number, min: 0, default: null }
}, { _id: false });

const responseSchema = new mongoose.Schema({
  questionId: { type: String, required: true },
  question: { type: String, required: true },
  questionType: { type: String, required: true },
  audioUrl: { type: String }, 
  transcription: { type: String },
  textResponse: { type: String },
  code: { type: String },
  language: { type: String }, // Language used for coding responses
  responseTime: { type: Number }, 
  recordingDuration: { type: Number }, 
  submittedAt: { type: Date, default: Date.now },
  skipped: { type: Boolean, default: false },
  executionResults: executionResultsSchema, // JDoodle execution results
  deliveryMetrics: { type: deliveryMetricsSchema, default: null },
  feedback: {
    score: { type: Number, min: 0, max: 100 },
    questionRelevance: { type: Number, min: 0, max: 10 },
    responseType: { 
      type: String, 
      enum: ['perfectly-relevant', 'mostly-relevant', 'partially-relevant', 'mostly-irrelevant', 'completely-off-topic', 'skipped'],
      default: 'partially-relevant' 
    },
    correctness: { type: Number, min: 0, max: 10 },
    syntax: { type: Number, min: 0, max: 10 },
    languageBestPractices: { type: Number, min: 0, max: 10 },
    efficiency: { type: Number, min: 0, max: 10 },
    structureAndReadability: { type: Number, min: 0, max: 10 },
    edgeCaseHandling: { type: Number, min: 0, max: 10 },
    strengths: [{ type: String }],
    improvements: [{ type: String }],
    detailedAnalysis: { type: String },
    overallAssessment: { type: String },
    communicationClarity: { type: Number, min: 0, max: 10 },
    technicalAccuracy: { type: Number, min: 0, max: 10 },
    structuredResponse: { type: Number, min: 0, max: 10 },
    codeQuality: { type: Number, min: 0, max: 10 },
    timeEfficiency: { type: Number, min: 0, max: 10 },
    // Where this score came from. Dashboards must exclude 'fallback'.
    source: { type: String, enum: ['tests', 'ai', 'human', 'fallback'] },
    // Whether the coding result behind this feedback was verified by the server sandbox
    executionSource: { type: String, enum: ['server', 'unavailable', 'none'] }
  }
});

const interviewSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'user', 
    required: true 
  },
  // Set at creation from req.user; not required so older documents stay valid
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', default: null, index: true },
  jobDescription: { type: String, required: true },
  resumeText: { type: String, required: true },
  
  questions: [questionSchema],
  totalQuestions: { type: Number, default: 10 },
  currentQuestionIndex: { type: Number, default: 0 },
  
  status: { 
    type: String, 
    enum: ['created', 'in_progress', 'completed', 'cancelled'], 
    default: 'created' 
  },

  usedProfileCV: {
    type: Boolean,
    default: false
  },

  // True when the AI could not generate tailored questions and the generic practice set was used instead.
  usedFallbackQuestions: {
    type: Boolean,
    default: false
  },

  cvSource: {
    type: String,
    enum: ['profile', 'manual', 'upload'],
    default: 'manual'
  },
  
  startedAt: { type: Date },
  completedAt: { type: Date },
  totalDuration: { type: Number }, 
  
  responses: [responseSchema],

  // Enhanced feedback structure to support JDoodle results
  overallFeedback: {
    score: { type: Number, min: 0, max: 100 },
    readinessLevel: { type: String },
    feedback: {
      strengths: [{ type: String }],
      improvements: [{ type: String }],
      recommendations: [{ type: String }],
      generalFeedback: { type: String },
      categoryScores: {
        behavioralSkills: { type: Number, min: 0, max: 100 },
        technicalKnowledge: { type: Number, min: 0, max: 100 },
        codingAbility: { type: Number, min: 0, max: 100 },
        communication: { type: Number, min: 0, max: 100 }
      },
      detailedAssessment: { type: String }
    },
    categoryPercentages: {
      behavioral: { type: Number, min: 0, max: 100 },
      technical: { type: Number, min: 0, max: 100 },
      coding: { type: Number, min: 0, max: 100 },
      communication: { type: Number, min: 0, max: 100 },
      technicalAccuracy: { type: Number, min: 0, max: 100 },
      problemSolving: { type: Number, min: 0, max: 100 }
    },
    breakdown: {
      totalQuestions: { type: Number },
      behavioralQuestions: { type: Number },
      technicalQuestions: { type: Number },
      codingQuestions: { type: Number },
      averageResponseTime: { type: Number },
      codeExecutionSuccess: { type: Number, min: 0, max: 100 }, // % of successful code executions
      averageExecutionTime: { type: Number } // Average execution time for coding questions
    }
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Pre-save middleware
interviewSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

interviewSchema.pre('save', function(next) {
  const validTypes = ['behavioral', 'technical', 'system_design', 'coding', 'problem-solving'];
  
  for (let question of this.questions) {
    if (!validTypes.includes(question.type)) {
      console.warn(`Invalid question type: ${question.type}, converting to 'technical'`);
      question.type = 'technical';
    }
  }
  next();
});

// Indexes
interviewSchema.index({ userId: 1, createdAt: -1 });
interviewSchema.index({ status: 1 });
interviewSchema.index({ userId: 1, status: 1 });

// Virtual properties
interviewSchema.virtual('duration').get(function() {
  if (this.startedAt && this.completedAt) {
    return Math.round((this.completedAt - this.startedAt) / 1000);
  }
  return null;
});

// JSON transformation
interviewSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

const InterviewModel = mongoose.models.interview || mongoose.model('interview', interviewSchema);

export default InterviewModel;