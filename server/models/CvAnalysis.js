import mongoose from 'mongoose';

const cvAnalysisSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  // Set at creation from req.user; not required so older documents stay valid
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', default: null, index: true },
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
  targetRoleId: { type: mongoose.Schema.Types.ObjectId, default: null },
  extractedTechnologies: { type: [mongoose.Schema.Types.Mixed], default: [] },
  // Empty when the CV was scored against a target role instead of pasted job descriptions.
  jobDescriptions: {
    type: [String],
    default: []
  },
  results: [{
    jobIndex: {
      type: Number,
      default: 0
    },
    kind: {
      type: String,
      enum: ['target_role', 'job_description'],
      default: 'job_description'
    },
    targetRoleId: { type: mongoose.Schema.Types.ObjectId, default: null },
    hasError: { type: Boolean, default: false },
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
    // True when the AI could not write the advice (strengths, weaknesses, recommendations are then empty).
    recommendationsUnavailable: {
      type: Boolean,
      default: false
    },
    // How the match percentage was calculated: AI score, keyword score, matched/missing skills,
    // and whether the AI was available. Shown to the student so the number can be checked.
    scoreBreakdown: {
      type: mongoose.Schema.Types.Mixed,
      default: null
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

cvAnalysisSchema.statics.findSavedByUser = function(userId, limit = 20) {
  return this.find({ userId, isSaved: true })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select('-resumeText'); // Exclude large text field
};

// Create and export the model
const CVAnalysis = mongoose.model('CVAnalysis', cvAnalysisSchema);

export default CVAnalysis;