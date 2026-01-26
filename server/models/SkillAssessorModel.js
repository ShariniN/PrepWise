// models/SkillsAssessmentModel.js - Skills Assessment Model
import mongoose from 'mongoose';

const skillsAssessmentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  assessmentType: {
    type: String,
    required: [true, 'Assessment type is required'],
    enum: ['SWOT', 'Technical Skills', 'General Assessment'],
    default: 'SWOT'
  },
  resumeHash: {
    type: String,
    required: [true, 'Resume hash is required'],
    index: true,
    trim: true
  },
  strengths: {
    type: [String],
    default: []
  },
  weaknesses: {
    type: [String],
    default: []
  },
  opportunities: {
    type: [String],
    default: []
  },
  threats: {
    type: [String],
    default: []
  },
  skills: [{
    name: {
      type: String,
      required: [true, 'Skill name is required'],
      trim: true
    },
    category: {
      type: String,
      default: 'General',
      trim: true
    },
    proficiencyLevel: {
      type: Number,
      min: [1, 'Proficiency level must be at least 1'],
      max: [10, 'Proficiency level cannot exceed 10'],
      required: [true, 'Proficiency level is required']
    },
    yearsOfExperience: {
      type: Number,
      min: [0, 'Years of experience cannot be negative'],
      default: 0
    },
    lastUsed: {
      type: Date,
      default: Date.now
    },
    isCoreTechnology: {
      type: Boolean,
      default: false
    }
  }],
  overallScore: {
    type: Number,
    min: [0, 'Overall score cannot be negative'],
    max: [100, 'Overall score cannot exceed 100']
  },
  recommendations: {
    type: [String],
    default: []
  },
  careerSuggestions: {
    type: [String],
    default: []
  },
  improvementAreas: {
    type: [String],
    default: []
  },
  isSaved: {
    type: Boolean,
    default: false,
    index: true
  },
  completedAt: {
    type: Date,
    default: Date.now
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
  collection: 'skills_assessments'
});

// Compound indexes for efficient queries
skillsAssessmentSchema.index({ userId: 1, resumeHash: 1 }, { unique: true, name: 'user_resume_assessment' });
skillsAssessmentSchema.index({ userId: 1, isSaved: 1, updatedAt: -1 }, { name: 'user_saved_assessments' });
skillsAssessmentSchema.index({ userId: 1, assessmentType: 1 }, { name: 'user_assessment_type' });

// Virtual for getting assessment age
skillsAssessmentSchema.virtual('age').get(function() {
  return new Date() - this.createdAt;
});

// Virtual for checking if assessment is recent (within last 30 days)
skillsAssessmentSchema.virtual('isRecent').get(function() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return this.updatedAt > thirtyDaysAgo;
});

// Virtual for getting skill categories
skillsAssessmentSchema.virtual('skillCategories').get(function() {
  if (!this.skills || this.skills.length === 0) return [];
  return [...new Set(this.skills.map(skill => skill.category))];
});

// Virtual for getting core technologies
skillsAssessmentSchema.virtual('coreTechnologies').get(function() {
  if (!this.skills || this.skills.length === 0) return [];
  return this.skills.filter(skill => skill.isCoreTechnology);
});

// Virtual for getting expert level skills (proficiency >= 8)
skillsAssessmentSchema.virtual('expertSkills').get(function() {
  if (!this.skills || this.skills.length === 0) return [];
  return this.skills.filter(skill => skill.proficiencyLevel >= 8);
});

// Virtual for getting beginner level skills (proficiency <= 3)
skillsAssessmentSchema.virtual('beginnerSkills').get(function() {
  if (!this.skills || this.skills.length === 0) return [];
  return this.skills.filter(skill => skill.proficiencyLevel <= 3);
});

// Virtual for calculating average proficiency
skillsAssessmentSchema.virtual('averageProficiency').get(function() {
  if (!this.skills || this.skills.length === 0) return 0;
  const sum = this.skills.reduce((total, skill) => total + skill.proficiencyLevel, 0);
  return Math.round((sum / this.skills.length) * 10) / 10; // Round to 1 decimal place
});

// Ensure virtuals are included when converting to JSON
skillsAssessmentSchema.set('toJSON', { virtuals: true });
skillsAssessmentSchema.set('toObject', { virtuals: true });

// Pre-save middleware
skillsAssessmentSchema.pre('save', function(next) {
  // Update updatedAt if document is modified
  if (!this.isNew) {
    this.updatedAt = new Date();
  }
  
  // Clean up arrays
  ['strengths', 'weaknesses', 'opportunities', 'threats', 'recommendations', 
   'careerSuggestions', 'improvementAreas'].forEach(field => {
    if (this[field] && Array.isArray(this[field])) {
      this[field] = this[field].map(item => item.trim()).filter(item => item.length > 0);
    }
  });
  
  // Clean up skills
  if (this.skills && Array.isArray(this.skills)) {
    this.skills.forEach(skill => {
      if (skill.name) skill.name = skill.name.trim();
      if (skill.category) skill.category = skill.category.trim();
    });
  }
  
  // Calculate overall score if not provided
  if (!this.overallScore && this.skills && this.skills.length > 0) {
    this.overallScore = Math.round(this.averageProficiency * 10);
  }
  
  next();
});

// Static methods for common queries
skillsAssessmentSchema.statics.findByUser = function(userId) {
  return this.find({ userId }).sort({ updatedAt: -1 });
};

skillsAssessmentSchema.statics.findSavedByUser = function(userId, limit = 20) {
  return this.find({ userId, isSaved: true })
    .sort({ updatedAt: -1 })
    .limit(limit);
};

skillsAssessmentSchema.statics.findByAssessmentType = function(userId, assessmentType) {
  return this.find({ userId, assessmentType }).sort({ updatedAt: -1 });
};

skillsAssessmentSchema.statics.findByResumeHash = function(resumeHash) {
  return this.find({ resumeHash }).sort({ updatedAt: -1 });
};

skillsAssessmentSchema.statics.findUserAssessment = function(userId, resumeHash) {
  return this.findOne({ userId, resumeHash });
};

skillsAssessmentSchema.statics.getRecentAssessments = function(userId, days = 30) {
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - days);
  
  return this.find({ 
    userId, 
    createdAt: { $gte: dateThreshold } 
  }).sort({ createdAt: -1 });
};

// Instance methods
skillsAssessmentSchema.methods.belongsToUser = function(userId) {
  return this.userId.toString() === userId.toString();
};

skillsAssessmentSchema.methods.markAsSaved = function() {
  this.isSaved = true;
  return this.save();
};

skillsAssessmentSchema.methods.markAsUnsaved = function() {
  this.isSaved = false;
  return this.save();
};

skillsAssessmentSchema.methods.addSkill = function(skillData) {
  this.skills.push(skillData);
  return this.save();
};

skillsAssessmentSchema.methods.updateSkill = function(skillName, updates) {
  const skill = this.skills.find(s => s.name === skillName);
  if (skill) {
    Object.assign(skill, updates);
    return this.save();
  }
  throw new Error('Skill not found');
};

skillsAssessmentSchema.methods.removeSkill = function(skillName) {
  this.skills = this.skills.filter(s => s.name !== skillName);
  return this.save();
};

skillsAssessmentSchema.methods.getSkillsByCategory = function(category) {
  return this.skills.filter(skill => skill.category === category);
};

skillsAssessmentSchema.methods.getSkillsByProficiency = function(minLevel, maxLevel) {
  return this.skills.filter(skill => 
    skill.proficiencyLevel >= minLevel && skill.proficiencyLevel <= maxLevel
  );
};

skillsAssessmentSchema.methods.getTopSkills = function(limit = 10) {
  return this.skills
    .sort((a, b) => b.proficiencyLevel - a.proficiencyLevel)
    .slice(0, limit);
};

skillsAssessmentSchema.methods.getSkillsNeedingImprovement = function(threshold = 5) {
  return this.skills.filter(skill => skill.proficiencyLevel < threshold);
};

skillsAssessmentSchema.methods.generateSummary = function() {
  const totalSkills = this.skills.length;
  const expertCount = this.expertSkills.length;
  const beginnerCount = this.beginnerSkills.length;
  const avgProficiency = this.averageProficiency;
  
  return {
    totalSkills,
    expertCount,
    beginnerCount,
    averageProficiency,
    overallScore: this.overallScore,
    skillCategories: this.skillCategories.length,
    coreTechnologies: this.coreTechnologies.length
  };
};

// Create and export the model
const SkillsAssessment = mongoose.model('SkillsAssessment', skillsAssessmentSchema);

export default SkillsAssessment;