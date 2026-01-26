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
  executedAt: { type: Date, default: Date.now }
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
    timeEfficiency: { type: Number, min: 0, max: 10 }
  }
});

const interviewSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'user', 
    required: true 
  },
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

// Instance methods
interviewSchema.methods.getCurrentQuestion = function() {
  const answeredCount = this.responses.length;
  return this.questions[answeredCount] || null;
};

interviewSchema.methods.isComplete = function() {
  return this.responses.length >= this.questions.length;
};

interviewSchema.methods.getProgress = function() {
  if (this.questions.length === 0) return 0;
  return Math.round((this.responses.length / this.questions.length) * 100);
};

// Get coding execution statistics
interviewSchema.methods.getCodeExecutionStats = function() {
  const codingResponses = this.responses.filter(r => r.questionType === 'coding' && r.executionResults);
  
  if (codingResponses.length === 0) {
    return {
      totalExecutions: 0,
      successfulExecutions: 0,
      successRate: 0,
      averageExecutionTime: 0
    };
  }
  
  const successfulExecutions = codingResponses.filter(r => r.executionResults.success).length;
  const totalExecutionTime = codingResponses.reduce((sum, r) => {
    const execTime = parseFloat(r.executionResults.executionTime) || 0;
    return sum + execTime;
  }, 0);
  
  return {
    totalExecutions: codingResponses.length,
    successfulExecutions,
    successRate: Math.round((successfulExecutions / codingResponses.length) * 100),
    averageExecutionTime: totalExecutionTime / codingResponses.length
  };
};

// Get question type breakdown
interviewSchema.methods.getQuestionTypeBreakdown = function() {
  const breakdown = {
    behavioral: 0,
    technical: 0,
    coding: 0,
    'problem-solving': 0,
    'system_design': 0
  };
  
  this.questions.forEach(q => {
    if (breakdown.hasOwnProperty(q.type)) {
      breakdown[q.type]++;
    }
  });
  
  return breakdown;
};

// Static methods
interviewSchema.statics.findUserInterviewsPaginated = function(userId, page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .select('status overallFeedback createdAt completedAt totalDuration questions responses');
};

// Get user's coding performance stats
interviewSchema.statics.getUserCodingStats = function(userId) {
  return this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId), status: 'completed' } },
    { $unwind: '$responses' },
    { $match: { 'responses.questionType': 'coding' } },
    {
      $group: {
        _id: '$userId',
        totalCodingQuestions: { $sum: 1 },
        successfulExecutions: {
          $sum: { $cond: [{ $eq: ['$responses.executionResults.success', true] }, 1, 0] }
        },
        averageScore: { $avg: '$responses.feedback.score' },
        averageExecutionTime: { $avg: { $toDouble: '$responses.executionResults.executionTime' } }
      }
    }
  ]);
};

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