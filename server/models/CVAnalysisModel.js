// models/CVAnalysisModel.js - Updated with minimal changes for user CV reference
import mongoose from 'mongoose';

const cvAnalysisSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  // MODIFIED: Make resumeText optional since it can come from user profile now
  resumeText: {
    type: String,
    required: false, // Changed from true to false
    trim: true,
    default: '' // Added default
  },
  resumeHash: {
    type: String,
    required: [true, 'Resume hash is required'],
    index: true,
    trim: true
  },
  // NEW: Flag to indicate if CV was loaded from user profile
  usedProfileCV: {
    type: Boolean,
    default: false
  },
  jobDescriptions: {
    type: [String],
    required: [true, 'Job descriptions are required'],
    validate: {
      validator: function(arr) {
        return arr && arr.length > 0;
      },
      message: 'At least one job description is required'
    }
  },
  results: [{
    jobIndex: {
      type: Number,
      default: 0
    },
    jobTitle: {
      type: String,
      trim: true
    },
    company: {
      type: String,
      trim: true
    },
    matchPercentage: {
      type: Number,
      required: [true, 'Match percentage is required'],
      min: [0, 'Match percentage cannot be negative'],
      max: [100, 'Match percentage cannot exceed 100']
    },
    isNonTechRole: {
      type: Boolean,
      default: false
    },
    strengths: {
      type: [String],
      default: []
    },
    contentWeaknesses: {
      type: [String],
      default: []
    },
    structureWeaknesses: {
      type: [String],
      default: []
    },
    contentRecommendations: {
      type: [String],
      default: []
    },
    structureRecommendations: {
      type: [String],
      default: []
    },
    message: {
      type: String,
      trim: true
    },
    skillsMatched: {
      type: [String],
      default: []
    },
    skillsMissing: {
      type: [String],
      default: []
    }
  }],
  isSaved: {
    type: Boolean,
    default: false,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true,
  collection: 'cv_analyses'
});

// Compound indexes for efficient queries
cvAnalysisSchema.index({ userId: 1, resumeHash: 1 }, { unique: true, name: 'user_resume_unique' });
cvAnalysisSchema.index({ userId: 1, isSaved: 1, updatedAt: -1 }, { name: 'user_saved_recent' });
cvAnalysisSchema.index({ userId: 1, createdAt: -1 }, { name: 'user_chronological' });
cvAnalysisSchema.index({ userId: 1, usedProfileCV: 1 }, { name: 'user_profile_cv' }); // NEW index

// Virtual for getting analysis age
cvAnalysisSchema.virtual('age').get(function() {
  return new Date() - this.createdAt;
});

// Virtual for checking if analysis is recent (within last 7 days)
cvAnalysisSchema.virtual('isRecent').get(function() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return this.updatedAt > sevenDaysAgo;
});

// Virtual for getting best match result
cvAnalysisSchema.virtual('bestMatch').get(function() {
  if (!this.results || this.results.length === 0) return null;
  return this.results.reduce((best, current) => 
    (current.matchPercentage || 0) > (best.matchPercentage || 0) ? current : best
  );
});

// Virtual for getting average match percentage
cvAnalysisSchema.virtual('averageMatch').get(function() {
  if (!this.results || this.results.length === 0) return 0;
  const softwareRoles = this.results.filter(r => !r.isNonTechRole);
  if (softwareRoles.length === 0) return 0;
  
  const sum = softwareRoles.reduce((total, result) => total + (result.matchPercentage || 0), 0);
  return Math.round(sum / softwareRoles.length);
});

// NEW: Virtual to check if CV text is available (either stored or from profile)
cvAnalysisSchema.virtual('hasCVText').get(function() {
  return !!(this.resumeText && this.resumeText.trim().length > 0);
});

// Ensure virtuals are included when converting to JSON
cvAnalysisSchema.set('toJSON', { virtuals: true });
cvAnalysisSchema.set('toObject', { virtuals: true });

// Pre-save middleware
cvAnalysisSchema.pre('save', function(next) {
  // Update updatedAt if document is modified
  if (!this.isNew) {
    this.updatedAt = new Date();
  }
  
  // Clean up text fields
  if (this.resumeText) {
    this.resumeText = this.resumeText.trim();
  }
  
  // Clean up job descriptions
  if (this.jobDescriptions && Array.isArray(this.jobDescriptions)) {
    this.jobDescriptions = this.jobDescriptions.map(desc => desc.trim()).filter(desc => desc.length > 0);
  }
  
  // Clean up results
  if (this.results && Array.isArray(this.results)) {
    this.results.forEach(result => {
      if (result.message) result.message = result.message.trim();
      if (result.jobTitle) result.jobTitle = result.jobTitle.trim();
      if (result.company) result.company = result.company.trim();
      
      // Clean up arrays
      ['strengths', 'contentWeaknesses', 'structureWeaknesses', 
       'contentRecommendations', 'structureRecommendations', 
       'skillsMatched', 'skillsMissing'].forEach(field => {
        if (result[field] && Array.isArray(result[field])) {
          result[field] = result[field].map(item => item.trim()).filter(item => item.length > 0);
        }
      });
    });
  }
  
  next();
});

// Static methods for common queries
cvAnalysisSchema.statics.findByUser = function(userId) {
  return this.find({ userId }).sort({ updatedAt: -1 });
};

cvAnalysisSchema.statics.findSavedByUser = function(userId, limit = 20) {
  return this.find({ userId, isSaved: true })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select('-resumeText'); // Exclude large text field
};

cvAnalysisSchema.statics.findByResumeHash = function(resumeHash) {
  return this.find({ resumeHash }).sort({ updatedAt: -1 });
};

cvAnalysisSchema.statics.findUserAnalysis = function(userId, resumeHash) {
  return this.findOne({ userId, resumeHash });
};

// NEW: Find analyses that used profile CV
cvAnalysisSchema.statics.findByProfileCV = function(userId) {
  return this.find({ userId, usedProfileCV: true }).sort({ updatedAt: -1 });
};

cvAnalysisSchema.statics.getRecentAnalyses = function(userId, days = 30) {
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - days);
  
  return this.find({ 
    userId, 
    createdAt: { $gte: dateThreshold } 
  }).sort({ createdAt: -1 });
};

// Instance methods
cvAnalysisSchema.methods.belongsToUser = function(userId) {
  return this.userId.toString() === userId.toString();
};

cvAnalysisSchema.methods.markAsSaved = function() {
  this.isSaved = true;
  return this.save();
};

cvAnalysisSchema.methods.markAsUnsaved = function() {
  this.isSaved = false;
  return this.save();
};

cvAnalysisSchema.methods.addResult = function(resultData) {
  this.results.push(resultData);
  return this.save();
};

cvAnalysisSchema.methods.updateResult = function(index, resultData) {
  if (this.results[index]) {
    this.results[index] = { ...this.results[index], ...resultData };
    return this.save();
  }
  throw new Error('Result index not found');
};

// NEW: Method to set resume text from user profile
cvAnalysisSchema.methods.setResumeFromProfile = function(resumeText, resumeHash) {
  this.resumeText = resumeText;
  this.resumeHash = resumeHash;
  this.usedProfileCV = true;
  return this;
};

// NEW: Method to get resume text (with fallback logic)
cvAnalysisSchema.methods.getResumeText = async function() {
  if (this.resumeText && this.resumeText.trim().length > 0) {
    return this.resumeText;
  }
  
  // If no resume text stored, try to get from user profile
  if (this.usedProfileCV) {
    const User = mongoose.model('User');
    const user = await User.findById(this.userId);
    if (user && user.currentCV && user.currentCV.text) {
      return user.currentCV.text;
    }
  }
  
  return '';
};

cvAnalysisSchema.methods.getSoftwareRoles = function() {
  return this.results.filter(result => !result.isNonTechRole);
};

cvAnalysisSchema.methods.getNonTechRoles = function() {
  return this.results.filter(result => result.isNonTechRole);
};

cvAnalysisSchema.methods.getTopStrengths = function(limit = 5) {
  const allStrengths = this.results.reduce((acc, result) => {
    return acc.concat(result.strengths || []);
  }, []);
  
  // Count frequency and return top strengths
  const strengthCount = {};
  allStrengths.forEach(strength => {
    strengthCount[strength] = (strengthCount[strength] || 0) + 1;
  });
  
  return Object.entries(strengthCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, limit)
    .map(([strength]) => strength);
};

cvAnalysisSchema.methods.getAllRecommendations = function() {
  return this.results.reduce((acc, result) => {
    const contentRecs = result.contentRecommendations || [];
    const structureRecs = result.structureRecommendations || [];
    return acc.concat(contentRecs, structureRecs);
  }, []);
};

// Create and export the model
const CVAnalysis = mongoose.model('CVAnalysis', cvAnalysisSchema);

export default CVAnalysis;