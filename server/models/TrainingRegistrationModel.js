// models/TrainingRegistrationModel.js
import mongoose from 'mongoose';

const trainingRegistrationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  trainingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Training',
    required: [true, 'Training ID is required'],
    index: true
  },
  participantInfo: {
    name: {
      type: String,
      required: [true, 'Participant name is required'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Participant email is required'],
      trim: true,
      lowercase: true,
      match: [/.+@.+\..+/, 'Please enter a valid email address']
    },
    contact: {
      type: String,
      required: [true, 'Contact number is required'],
      trim: true
    },
    affiliation: {
      type: String,
      required: [true, 'Affiliation is required'],
      enum: ['undergraduate', 'intern', 'postgraduate', 'professional', 'other'],
      trim: true
    }
  },
  selectedSlot: {
    type: String,
    trim: true,
    // Required only for soft skills training
    validate: {
      validator: function(value) {
        // This will be validated at the application level
        return true;
      },
      message: 'Selected slot is required for soft skills training'
    }
  },
  registrationDate: {
    type: Date,
    default: Date.now,
    index: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'failed', 'refunded'],
    default: 'pending',
    index: true
  },
  paymentDetails: {
    method: {
      type: String,
      enum: ['card', 'bank', 'mobile', 'free'],
      trim: true
    },
    transactionId: {
      type: String,
      trim: true
    },
    amount: {
      type: String,
      trim: true
    },
    timestamp: {
      type: Date
    }
  },
  registrationStatus: {
    type: String,
    enum: ['registered', 'cancelled', 'completed', 'no-show'],
    default: 'registered',
    index: true
  },
  confirmationCode: {
    type: String,
    unique: true,
    sparse: true
  },
  trainingLinkSent: {
    type: Boolean,
    default: false
  },
  trainingLinkSentAt: {
    type: Date
  },
  attendanceMarked: {
    type: Boolean,
    default: false
  },
  attendanceStatus: {
    type: String,
    enum: ['present', 'absent', 'partial'],
    sparse: true
  },
  feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      trim: true
    },
    submittedAt: {
      type: Date
    }
  },
  certificateIssued: {
    type: Boolean,
    default: false
  },
  certificateIssuedAt: {
    type: Date
  },
  notes: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  confirmedAt: {
    type: Date
  },
  cancelledAt: {
    type: Date
  },
  cancellationReason: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  collection: 'training_registrations'
});

/* ========= Indexes ========= */
// Compound indexes for efficient queries
trainingRegistrationSchema.index({ userId: 1, trainingId: 1 }, { 
  unique: true, 
  name: 'user_training_registration',
  partialFilterExpression: { registrationStatus: { $ne: 'cancelled' } }
});
trainingRegistrationSchema.index({ userId: 1, paymentStatus: 1 });
trainingRegistrationSchema.index({ trainingId: 1, registrationStatus: 1 });
trainingRegistrationSchema.index({ registrationDate: -1 });

/* ========= Virtual Fields ========= */
trainingRegistrationSchema.virtual('isActive').get(function() {
  return ['registered', 'completed'].includes(this.registrationStatus);
});

trainingRegistrationSchema.virtual('isPaid').get(function() {
  return this.paymentStatus === 'confirmed';
});

trainingRegistrationSchema.virtual('canBeCancelled').get(function() {
  return this.registrationStatus === 'registered' && this.paymentStatus !== 'refunded';
});

trainingRegistrationSchema.virtual('daysSinceRegistration').get(function() {
  const diffTime = Math.abs(new Date() - this.registrationDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

/* ========= Middleware ========= */
// Pre-save middleware
trainingRegistrationSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Generate confirmation code if payment is confirmed and code doesn't exist
  if (this.paymentStatus === 'confirmed' && !this.confirmationCode) {
    this.confirmationCode = generateConfirmationCode();
    this.confirmedAt = new Date();
  }
  
  // Clean up participant info
  if (this.participantInfo) {
    this.participantInfo.name = this.participantInfo.name?.trim();
    this.participantInfo.email = this.participantInfo.email?.trim().toLowerCase();
    this.participantInfo.contact = this.participantInfo.contact?.trim();
  }
  
  next();
});

// Pre-remove middleware
trainingRegistrationSchema.pre('remove', async function(next) {
  try {
    // Update training participant count when registration is removed
    const Training = mongoose.model('Training');
    await Training.findByIdAndUpdate(this.trainingId, {
      $pull: { participants: { userId: this.userId } }
    });
    next();
  } catch (error) {
    next(error);
  }
});

/* ========= Instance Methods ========= */
// Generate unique confirmation code
function generateConfirmationCode() {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substr(2, 4).toUpperCase();
  return `TRN${timestamp}${random}`;
}

// Mark as cancelled
trainingRegistrationSchema.methods.cancel = function(reason) {
  this.registrationStatus = 'cancelled';
  this.cancelledAt = new Date();
  this.cancellationReason = reason || 'User cancelled';
  return this.save();
};

// Mark as completed
trainingRegistrationSchema.methods.complete = function() {
  this.registrationStatus = 'completed';
  this.attendanceMarked = true;
  this.attendanceStatus = 'present';
  return this.save();
};

// Add feedback
trainingRegistrationSchema.methods.addFeedback = function(rating, comment) {
  this.feedback = {
    rating,
    comment: comment || '',
    submittedAt: new Date()
  };
  return this.save();
};

// Mark training link as sent
trainingRegistrationSchema.methods.markTrainingLinkSent = function() {
  this.trainingLinkSent = true;
  this.trainingLinkSentAt = new Date();
  return this.save();
};

// Issue certificate
trainingRegistrationSchema.methods.issueCertificate = function() {
  if (this.registrationStatus === 'completed' && this.attendanceStatus === 'present') {
    this.certificateIssued = true;
    this.certificateIssuedAt = new Date();
    return this.save();
  }
  throw new Error('Cannot issue certificate: training not completed or user was absent');
};

// Update attendance
trainingRegistrationSchema.methods.updateAttendance = function(status, notes) {
  this.attendanceMarked = true;
  this.attendanceStatus = status;
  if (notes) {
    this.notes = notes;
  }
  
  // Automatically mark as completed if present
  if (status === 'present') {
    this.registrationStatus = 'completed';
  }
  
  return this.save();
};

// Check if eligible for refund
trainingRegistrationSchema.methods.isEligibleForRefund = function() {
  const daysSince = this.daysSinceRegistration;
  return this.paymentStatus === 'confirmed' && 
         this.registrationStatus === 'registered' && 
         daysSince <= 7; // 7-day refund policy
};

// Generate registration summary
trainingRegistrationSchema.methods.getSummary = function() {
  return {
    confirmationCode: this.confirmationCode,
    participantName: this.participantInfo.name,
    email: this.participantInfo.email,
    registrationDate: this.registrationDate,
    paymentStatus: this.paymentStatus,
    registrationStatus: this.registrationStatus,
    selectedSlot: this.selectedSlot,
    isActive: this.isActive,
    isPaid: this.isPaid,
    canBeCancelled: this.canBeCancelled
  };
};

/* ========= Static Methods ========= */
// Find active registrations for a user
trainingRegistrationSchema.statics.findActiveByUser = function(userId) {
  return this.find({ 
    userId, 
    registrationStatus: { $in: ['registered', 'completed'] },
    paymentStatus: 'confirmed'
  }).populate('trainingId');
};

// Find registrations by training
trainingRegistrationSchema.statics.findByTraining = function(trainingId, status = null) {
  const query = { trainingId };
  if (status) {
    query.registrationStatus = status;
  }
  return this.find(query).populate('userId', 'name email').sort({ registrationDate: -1 });
};

// Find pending payments
trainingRegistrationSchema.statics.findPendingPayments = function(olderThanMinutes = 30) {
  const cutoffTime = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  return this.find({
    paymentStatus: 'pending',
    registrationDate: { $lt: cutoffTime }
  }).populate('trainingId', 'title');
};

// Get registration statistics
trainingRegistrationSchema.statics.getStats = function(trainerId = null) {
  const matchStage = trainerId ? 
    { $match: { trainerId: new mongoose.Types.ObjectId(trainerId) } } :
    { $match: {} };
    
  return this.aggregate([
    {
      $lookup: {
        from: 'trainings',
        localField: 'trainingId',
        foreignField: '_id',
        as: 'training'
      }
    },
    { $unwind: '$training' },
    matchStage,
    {
      $group: {
        _id: null,
        totalRegistrations: { $sum: 1 },
        confirmedPayments: { 
          $sum: { $cond: [{ $eq: ['$paymentStatus', 'confirmed'] }, 1, 0] } 
        },
        completedTrainings: { 
          $sum: { $cond: [{ $eq: ['$registrationStatus', 'completed'] }, 1, 0] } 
        },
        cancelledRegistrations: { 
          $sum: { $cond: [{ $eq: ['$registrationStatus', 'cancelled'] }, 1, 0] } 
        }
      }
    }
  ]);
};

// Find users who need reminders
trainingRegistrationSchema.statics.findUsersNeedingReminders = function() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const dayAfterTomorrow = new Date(tomorrow);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
  
  return this.find({
    registrationStatus: 'registered',
    paymentStatus: 'confirmed',
    reminderSent: { $ne: true }
  }).populate({
    path: 'trainingId',
    match: {
      startDate: {
        $gte: tomorrow,
        $lt: dayAfterTomorrow
      }
    }
  }).populate('userId', 'name email');
};

/* ========= Schema Settings ========= */
trainingRegistrationSchema.set('toJSON', { 
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

trainingRegistrationSchema.set('toObject', { virtuals: true });

const TrainingRegistration = mongoose.models.TrainingRegistration || mongoose.model('TrainingRegistration', trainingRegistrationSchema);
export default TrainingRegistration;