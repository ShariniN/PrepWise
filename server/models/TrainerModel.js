// models/trainerModel.js - Fixed Trainer Model with training-specific reviews
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const trainerSchema = new mongoose.Schema({
  trainerId: {
    type: String,
    required: [true, 'Trainer ID is required'],
    unique: true,
    trim: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Trainer name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/.+@.+\..+/, 'Please enter a valid email address']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long'],
    select: false
  },
  contact: {
    type: String,
    required: [true, 'Contact number is required'],
    trim: true
  },
  address: {
    type: String,
    trim: true,
    default: ''
  },
  profileImage: {
    type: String,
    default: '/api/placeholder/150/150'
  },
  bio: {
    type: String,
    trim: true,
    default: ''
  },
  accountType: {
    type: String,
    default: 'Trainer',
    enum: ['Trainer']
  },
  // OTP verification fields
  isAccountVerified: {
    type: Boolean,
    default: false
  },
  verifyOtp: {
    type: String,
    default: ''
  },
  verifyOtpExpireAt: {
    type: Number,
    default: 0
  },
  resetOtp: {
    type: String,
    default: ''
  },
  resetOtpExpireAt: {
    type: Number,
    default: 0
  },
  specializationSkills: {
    type: [String],
    default: []
  },
  experiences: [{
    title: { type: String, required: true, trim: true },
    company: { type: String, trim: true },
    years: { type: Number, min: 0, default: 0 },
    description: { type: String, trim: true }
  }],
  education: [{
    degree: { type: String, required: true, trim: true },
    institution: { type: String, required: true, trim: true },
    yearOfCompletion: { type: Number }
  }],
  certifications: [{
    name: { type: String, required: true, trim: true },
    issuingOrganization: { type: String, trim: true },
    issueDate: { type: Date },
    expirationDate: { type: Date },
    credentialId: { type: String, trim: true },
    credentialUrl: { type: String, trim: true }
  }],
  ratings: {
    average: { type: Number, min: 0, max: 5, default: 0 },
    totalRatings: { type: Number, default: 0 }
  },
  reviews: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    trainingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Training' }, // Optional - for training-specific reviews
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, trim: true, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  lastActive: {
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
  collection: 'trainers'
});

// Compound index for searching by name + skills
trainerSchema.index({ name: 1, specializationSkills: 1 }, { name: 'name_skills_index' });
trainerSchema.index({ email: 1 }, { unique: true, name: 'email_unique' });
trainerSchema.index({ isAccountVerified: 1 }, { name: 'account_verified' });
trainerSchema.index({ 'reviews.userId': 1, 'reviews.trainingId': 1 }, { name: 'reviews_user_training' });

/* ========= Virtuals ========= */
trainerSchema.virtual('experienceYears').get(function() {
  if (!this.experiences || this.experiences.length === 0) return 0;
  return this.experiences.reduce((sum, exp) => sum + (exp.years || 0), 0);
});

trainerSchema.virtual('highestEducation').get(function() {
  if (!this.education || this.education.length === 0) return null;
  return this.education.reduce((latest, edu) =>
    !latest || (edu.yearOfCompletion > latest.yearOfCompletion) ? edu : latest
  , null);
});

/* ========= Middleware ========= */
// Hash password before saving
trainerSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  this.updatedAt = new Date();
  if (!this.isNew) {
    this.lastActive = new Date();
  }

  // Clean up skills
  if (this.specializationSkills && Array.isArray(this.specializationSkills)) {
    this.specializationSkills = this.specializationSkills
      .map(skill => skill.trim())
      .filter(skill => skill.length > 0);
  }

  next();
});

/* ========= Methods ========= */
// Compare passwords for login
trainerSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Override toJSON to exclude sensitive fields
trainerSchema.methods.toJSON = function() {
  const trainerObject = this.toObject();
  delete trainerObject.password;
  delete trainerObject.verifyOtp;
  delete trainerObject.resetOtp;
  delete trainerObject.verifyOtpExpireAt;
  delete trainerObject.resetOtpExpireAt;
  return trainerObject;
};

// Add skill
trainerSchema.methods.addSkill = function(skill) {
  if (!this.specializationSkills.includes(skill.trim())) {
    this.specializationSkills.push(skill.trim());
  }
  return this.save();
};

// Remove skill
trainerSchema.methods.removeSkill = function(skill) {
  this.specializationSkills = this.specializationSkills.filter(s => s !== skill.trim());
  return this.save();
};

// Add experience
trainerSchema.methods.addExperience = function(experienceData) {
  this.experiences.push(experienceData);
  return this.save();
};

// Add education
trainerSchema.methods.addEducation = function(educationData) {
  this.education.push(educationData);
  return this.save();
};

// FIXED: Add training review method
trainerSchema.methods.addTrainingReview = async function(userId, trainingId, rating, comment) {
  // Check if user has already reviewed this training
  const existingReviewIndex = this.reviews.findIndex(review => 
    review.userId.toString() === userId.toString() && 
    review.trainingId && 
    review.trainingId.toString() === trainingId.toString()
  );

  if (existingReviewIndex !== -1) {
    throw new Error('User has already reviewed this training');
  }

  // Add new review
  const newReview = {
    userId: new mongoose.Types.ObjectId(userId),
    trainingId: new mongoose.Types.ObjectId(trainingId),
    rating: rating,
    comment: comment,
    createdAt: new Date()
  };

  this.reviews.push(newReview);

  // Recalculate ratings
  this.recalculateRatings();

  // Save and return
  return await this.save();
};

// Method to recalculate overall ratings
trainerSchema.methods.recalculateRatings = function() {
  if (!this.reviews || this.reviews.length === 0) {
    this.ratings.average = 0;
    this.ratings.totalRatings = 0;
    return;
  }

  const totalRating = this.reviews.reduce((sum, review) => sum + review.rating, 0);
  this.ratings.average = Math.round((totalRating / this.reviews.length) * 10) / 10;
  this.ratings.totalRatings = this.reviews.length;
};

// Get reviews for a specific training
trainerSchema.methods.getTrainingReviews = function(trainingId) {
  return this.reviews.filter(review => 
    review.trainingId && 
    review.trainingId.toString() === trainingId.toString()
  );
};

// Check if user has reviewed a specific training
trainerSchema.methods.hasUserReviewedTraining = function(userId, trainingId) {
  return this.reviews.some(review => 
    review.userId.toString() === userId.toString() && 
    review.trainingId && 
    review.trainingId.toString() === trainingId.toString()
  );
};

// Get training review statistics
trainerSchema.methods.getTrainingReviewStats = function(trainingId) {
  const trainingReviews = this.getTrainingReviews(trainingId);
  
  if (trainingReviews.length === 0) {
    return {
      averageRating: 0,
      totalReviews: 0,
      ratingBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    };
  }

  const averageRating = trainingReviews.reduce((sum, r) => sum + r.rating, 0) / trainingReviews.length;
  const ratingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  
  trainingReviews.forEach(review => {
    ratingBreakdown[review.rating]++;
  });

  return {
    averageRating: Math.round(averageRating * 10) / 10,
    totalReviews: trainingReviews.length,
    ratingBreakdown
  };
};

// Get user's review for specific training
trainerSchema.methods.getUserTrainingReview = function(userId, trainingId) {
  return this.reviews.find(review => 
    review.userId.toString() === userId.toString() && 
    review.trainingId && 
    review.trainingId.toString() === trainingId.toString()
  );
};

/* ========= Static Methods ========= */
trainerSchema.statics.findBySkill = function(skill) {
  return this.find({ specializationSkills: skill }).sort({ updatedAt: -1 });
};

trainerSchema.statics.findByName = function(name) {
  return this.find({ name: new RegExp(name, 'i') });
};

trainerSchema.statics.findVerified = function() {
  return this.find({ isAccountVerified: true });
};

trainerSchema.statics.findWithMinRating = function(minRating) {
  return this.find({ 'ratings.average': { $gte: minRating } });
};

/* ========= Settings ========= */
trainerSchema.set('toJSON', { virtuals: true });
trainerSchema.set('toObject', { virtuals: true });

const Trainer = mongoose.model('Trainer', trainerSchema);
export default Trainer;