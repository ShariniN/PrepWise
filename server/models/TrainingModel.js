
// models/TrainingModel.js
import mongoose from 'mongoose';

const trainingSchema = new mongoose.Schema({
  trainerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Trainer', 
    required: true 
  },
  title: { 
    type: String, 
    required: [true, 'Training title is required'], 
    trim: true 
  },
  trainingType: { 
    type: String, 
    enum: ['technical', 'soft skills'], 
    required: [true, 'Training type is required'] 
  },
  trainingCategory: { 
    type: String, 
    trim: true 
  },
  duration: { 
    type: String, 
    trim: true 
  },
  
  // Number of participants registered
  registeredParticipants: { 
    type: Number, 
    default: 0,
    min: 0
  },
  // Total available slots
  availableSlots: { 
    type: Number, 
    default: 0,
    min: 0
  },

  // Required for soft skills training
  timeSlot: { 
    type: String, 
    trim: true,
    required: function() { 
      return this.trainingType === 'soft skills'; 
    }
  },

  price: { 
    type: String, 
    trim: true 
  },
  status: { 
    type: String, 
    enum: ['active', 'completed', 'upcoming'], 
    default: 'upcoming' 
  },
  startDate: { 
    type: Date,
    index: true
  },
  description: { 
    type: String, 
    trim: true 
  },
  onlineLink: { 
    type: String, 
    trim: true 
  },

  // Track participants who registered
  participants: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    registeredAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['registered', 'cancelled', 'completed'], default: 'registered' }
  }],

  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
}, {
  timestamps: true,
  collection: 'trainings'
});

/* ========= Indexes ========= */
trainingSchema.index({ trainerId: 1, status: 1 });
trainingSchema.index({ trainingType: 1, startDate: 1 });
trainingSchema.index({ trainingCategory: 1 });

/* ========= Middleware ========= */
trainingSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Update registered participants count
  this.registeredParticipants = this.participants.filter(p => p.status === 'registered').length;
  
  next();
});

/* ========= Virtual Fields ========= */
trainingSchema.virtual('isFullyBooked').get(function() {
  return this.registeredParticipants >= this.availableSlots;
});

trainingSchema.virtual('availableSpots').get(function() {
  return Math.max(0, this.availableSlots - this.registeredParticipants);
});

/* ========= Instance Methods ========= */
// Register a participant
trainingSchema.methods.registerParticipant = function(userId) {
  if (this.registeredParticipants >= this.availableSlots) {
    throw new Error('No available slots left');
  }
  
  // Check if user already registered
  const existingParticipant = this.participants.find(
    p => p.userId.toString() === userId.toString() && p.status === 'registered'
  );
  
  if (existingParticipant) {
    throw new Error('User already registered for this training');
  }
  
  this.participants.push({ userId, status: 'registered' });
  return this.save();
};

// Cancel a registration
trainingSchema.methods.cancelRegistration = function(userId) {
  const participant = this.participants.find(
    p => p.userId.toString() === userId.toString() && p.status === 'registered'
  );
  
  if (!participant) {
    throw new Error('User is not registered for this training');
  }
  
  participant.status = 'cancelled';
  return this.save();
};

// Mark training as completed
trainingSchema.methods.markCompleted = function() {
  this.status = 'completed';
  this.participants.forEach(participant => {
    if (participant.status === 'registered') {
      participant.status = 'completed';
    }
  });
  return this.save();
};

/* ========= Static Methods ========= */
trainingSchema.statics.findByType = function(type) {
  return this.find({ trainingType: type }).sort({ startDate: 1 });
};

trainingSchema.statics.findByCategory = function(category) {
  return this.find({ trainingCategory: category }).sort({ startDate: 1 });
};

trainingSchema.statics.findByTrainer = function(trainerId) {
  return this.find({ trainerId }).sort({ updatedAt: -1 });
};

trainingSchema.statics.findUpcoming = function() {
  return this.find({ 
    status: { $in: ['upcoming', 'active'] },
    startDate: { $gte: new Date() }
  }).sort({ startDate: 1 });
};

/* ========= Settings ========= */
trainingSchema.set('toJSON', { virtuals: true });
trainingSchema.set('toObject', { virtuals: true });

const Training = mongoose.model('Training', trainingSchema);
export default Training;