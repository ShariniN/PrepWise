import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long']
  },
  phoneNumber: {
    type: String,
    trim: true,
    match: [/^\d{10,15}$/, 'Please enter a valid phone number']
  },
  accountType: {  // ← ADD THIS FIELD
    type: String,
    enum: ['Trainer', 'Fresher'],
    required: [true, 'Account type is required']
  },
  accountPlan: {
    type: String,
    enum: ['basic', 'premium'],
    default: 'basic'
  },
  isAccountVerified: {
    type: Boolean,
    default: false
  },
  // CV Storage fields - only for fresher accounts
  currentCV: {
    text: {
      type: String,
      trim: true,
      default: ''
    },
    hash: {
      type: String,
      trim: true,
      default: '',
      index: true // Index for efficient lookups
    },
    fileName: {
      type: String,
      trim: true,
      default: ''
    },
    uploadedAt: {
      type: Date,
      default: null
    },
    fileSize: {
      type: Number,
      default: 0
    }
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
  lastActive: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'users'
});

// Define indexes separately
userSchema.index({ email: 1 }, { unique: true, name: 'email_unique' });
userSchema.index({ isAccountVerified: 1 }, { name: 'account_verified' });
userSchema.index({ accountPlan: 1 }, { name: 'account_plan' });
userSchema.index({ accountType: 1 }, { name: 'account_type' }); // ← ADD INDEX FOR accountType
userSchema.index({ lastActive: -1 }, { name: 'last_active' });
userSchema.index({ 'currentCV.hash': 1 }, { name: 'cv_hash_lookup', sparse: true }); // Sparse index for CV hash

// Virtual for checking if user has uploaded CV
userSchema.virtual('hasCV').get(function() {
  return !!(this.currentCV && this.currentCV.text && this.currentCV.text.trim().length > 0);
});

// Virtual for CV upload age
userSchema.virtual('cvAge').get(function() {
  if (!this.currentCV || !this.currentCV.uploadedAt) return null;
  return new Date() - this.currentCV.uploadedAt;
});

// Ensure virtuals are included when converting to JSON
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

// Pre-save middleware
userSchema.pre('save', function(next) {
  if (!this.isNew) {
    this.lastActive = new Date();
  }
  
  // Clean up CV text if provided
  if (this.currentCV && this.currentCV.text) {
    this.currentCV.text = this.currentCV.text.trim();
  }
  
  next();
});

// Instance methods
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.verifyOtp;
  delete userObject.resetOtp;
  delete userObject.verifyOtpExpireAt;
  delete userObject.resetOtpExpireAt;
  return userObject;
};

// CV-related methods (now available to all users since they're all freshers)
userSchema.methods.updateCV = function(cvText, fileName, hash) {
  this.currentCV = {
    text: cvText.trim(),
    hash: hash,
    fileName: fileName,
    uploadedAt: new Date(),
    fileSize: cvText.length
  };
  return this.save();
};

userSchema.methods.clearCV = function() {
  this.currentCV = {
    text: '',
    hash: '',
    fileName: '',
    uploadedAt: null,
    fileSize: 0
  };
  return this.save();
};

userSchema.methods.getCVText = function() {
  return this.currentCV && this.currentCV.text ? this.currentCV.text : '';
};

userSchema.methods.getCVHash = function() {
  return this.currentCV && this.currentCV.hash ? this.currentCV.hash : '';
};

// Static methods for CV-related queries
userSchema.statics.findByResumeHash = function(hash) {
  return this.find({ 'currentCV.hash': hash });
};

userSchema.statics.getUsersWithCV = function() {
  return this.find({ 
    'currentCV.text': { $exists: true, $ne: '' } 
  });
};

const userModel = mongoose.model('User', userSchema);

export default userModel;



