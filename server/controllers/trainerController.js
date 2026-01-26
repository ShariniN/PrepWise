// controllers/trainerController.js - Complete updated version allowing multiple reviews
import Trainer from "../models/TrainerModel.js";
import Training from "../models/TrainingModel.js";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

// Get trainer profile - Updated to include trainings
export const getTrainerProfile = async (req, res) => {
  try {
    const trainerId = req.user.id; // comes from auth middleware
    const trainer = await Trainer.findById(trainerId).lean();
    
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    // Fetch trainings for this trainer
    const trainings = await Training.find({ trainerId }).sort({ updatedAt: -1 }).lean();

    // Prepare personalDetails object for frontend
    const personalDetails = {
      _id: trainer._id,
      name: trainer.name,
      email: trainer.email,
      phone: trainer.contact,
      address: trainer.address || "",
      profileImage: trainer.profileImage || "/api/placeholder/150/150",
      bio: trainer.bio || "",
      joinDate: trainer.createdAt.toDateString(),
      rating: trainer.ratings.average || 0,
      totalStudents: trainings.reduce((sum, t) => sum + (t.registeredParticipants || 0), 0),
      totalHours: trainings.reduce((sum, t) => {
        const hours = t.duration ? parseInt(t.duration) : 0;
        return sum + hours;
      }, 0),
      trainerId: trainer.trainerId,
      specializationSkills: trainer.specializationSkills || [],
      isAccountVerified: trainer.isAccountVerified
    };

    res.status(200).json({
      success: true,
      data: {
        personalDetails,
        education: trainer.education || [],
        certifications: trainer.certifications || [],
        trainingPrograms: trainings,
        experiences: trainer.experiences || [],
        reviews: trainer.reviews || []
      }
    });
  } catch (error) {
    console.error("Get trainer profile error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Update trainer profile
export const updateTrainerProfile = async (req, res) => {
  try {
    const trainerId = req.user.id;
    const updateData = req.body;

    // Remove fields that shouldn't be updated directly
    delete updateData.password;
    delete updateData.email;
    delete updateData.trainerId;
    delete updateData.verifyOtp;
    delete updateData.resetOtp;
    delete updateData._id;

    // Map frontend field names to backend field names
    const mappedData = {
      ...updateData,
      contact: updateData.contact || updateData.phone,
      lastActive: new Date()
    };

    const updatedTrainer = await Trainer.findByIdAndUpdate(
      trainerId,
      mappedData,
      { 
        new: true,
        runValidators: true
      }
    );

    if (!updatedTrainer) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found"
      });
    }

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: updatedTrainer
    });
  } catch (error) {
    console.error('Update trainer profile error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message
    });
  }
};

// Change trainer password
export const changeTrainerPassword = async (req, res) => {
  try {
    const trainerId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required"
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long"
      });
    }

    const trainer = await Trainer.findById(trainerId).select('+password');
    if (!trainer) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found"
      });
    }

    const isCurrentPasswordValid = await trainer.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect"
      });
    }

    trainer.password = newPassword;
    await trainer.save();

    res.json({
      success: true,
      message: "Password updated successfully"
    });
  } catch (error) {
    console.error('Change trainer password error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to change password"
    });
  }
};

// Add skill to trainer
export const addSkill = async (req, res) => {
  try {
    const trainerId = req.user.id;
    const { skill } = req.body;

    if (!skill || skill.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Skill is required"
      });
    }

    const trainer = await Trainer.findById(trainerId);
    if (!trainer) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found"
      });
    }

    await trainer.addSkill(skill);

    res.json({
      success: true,
      message: "Skill added successfully",
      data: trainer.specializationSkills
    });
  } catch (error) {
    console.error('Add skill error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to add skill"
    });
  }
};

// Remove skill from trainer
export const removeSkill = async (req, res) => {
  try {
    const trainerId = req.user.id;
    const { skill } = req.body;

    if (!skill) {
      return res.status(400).json({
        success: false,
        message: "Skill is required"
      });
    }

    const trainer = await Trainer.findById(trainerId);
    if (!trainer) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found"
      });
    }

    await trainer.removeSkill(skill);

    res.json({
      success: true,
      message: "Skill removed successfully",
      data: trainer.specializationSkills
    });
  } catch (error) {
    console.error('Remove skill error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to remove skill"
    });
  }
};

// Add experience to trainer
export const addExperience = async (req, res) => {
  try {
    const trainerId = req.user.id;
    const experienceData = req.body;

    if (!experienceData.title) {
      return res.status(400).json({
        success: false,
        message: "Experience title is required"
      });
    }

    const trainer = await Trainer.findById(trainerId);
    if (!trainer) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found"
      });
    }

    await trainer.addExperience(experienceData);

    res.json({
      success: true,
      message: "Experience added successfully",
      data: trainer.experiences
    });
  } catch (error) {
    console.error('Add experience error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to add experience"
    });
  }
};

// Add education to trainer
export const addEducation = async (req, res) => {
  try {
    const trainerId = req.user.id;
    const educationData = req.body;

    if (!educationData.degree || !educationData.institution) {
      return res.status(400).json({
        success: false,
        message: "Degree and institution are required"
      });
    }

    const trainer = await Trainer.findById(trainerId);
    if (!trainer) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found"
      });
    }

    await trainer.addEducation(educationData);

    res.json({
      success: true,
      message: "Education added successfully",
      data: trainer.education
    });
  } catch (error) {
    console.error('Add education error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to add education"
    });
  }
};

// Get all trainers (public route)
export const getAllTrainers = async (req, res) => {
  try {
    const { 
      skill, 
      experience, 
      rating, 
      page = 1, 
      limit = 10, 
      search, 
      sortBy = 'updatedAt',
      sortOrder = 'desc' 
    } = req.query;

    let query = { isAccountVerified: true };
    
    if (skill) {
      query.specializationSkills = { $in: [skill] };
    }
    
    if (rating) {
      query['ratings.average'] = { $gte: parseFloat(rating) };
    }
    
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const trainers = await Trainer.find(query)
      .select('-password -verifyOtp -resetOtp -verifyOtpExpireAt -resetOtpExpireAt')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Trainer.countDocuments(query);

    res.json({
      success: true,
      data: trainers,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all trainers error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch trainers"
    });
  }
};

// Get trainer by ID (public route)
export const getTrainerById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid trainer ID"
      });
    }
    
    const trainer = await Trainer.findById(id)
      .select('-password -verifyOtp -resetOtp -verifyOtpExpireAt -resetOtpExpireAt')
      .lean();

    if (!trainer) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found"
      });
    }

    // Get trainer's trainings
    const trainings = await Training.find({ trainerId: id })
      .select('title trainingType status startDate registeredParticipants availableSlots')
      .sort({ startDate: -1 });

    res.json({
      success: true,
      data: {
        ...trainer,
        trainings
      }
    });
  } catch (error) {
    console.error('Get trainer by ID error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch trainer"
    });
  }
};

// Enhanced training review functions for trainerController.js
// Add these functions to your existing trainerController.js

// Fixed version of addTrainingReview with proper error handling
export const addTrainingReview = async (req, res) => {
  console.log('=== ADD TRAINING REVIEW DEBUG START ===');
  
  try {
    const { trainerId } = req.params;
    const { trainingId, rating, comment } = req.body;
    const userId = req.user?.id;

    console.log('Request params:', { trainerId });
    console.log('Request body:', { trainingId, rating, comment });
    console.log('User from auth:', { userId, user: req.user });

    // Validation with detailed logging
    if (!trainingId) {
      console.log('Validation failed: No trainingId');
      return res.status(400).json({
        success: false,
        message: 'Training ID is required for training-specific reviews'
      });
    }

    if (!rating || rating < 1 || rating > 5) {
      console.log('Validation failed: Invalid rating:', rating);
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    if (!comment || !comment.trim()) {
      console.log('Validation failed: Empty comment');
      return res.status(400).json({
        success: false,
        message: 'Comment is required'
      });
    }

    if (!userId) {
      console.log('Validation failed: No user ID from auth');
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Validate ObjectIds
    console.log('Validating ObjectIds...');
    if (!mongoose.Types.ObjectId.isValid(trainerId)) {
      console.log('Invalid trainerId:', trainerId);
      return res.status(400).json({
        success: false,
        message: 'Invalid trainer ID'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(trainingId)) {
      console.log('Invalid trainingId:', trainingId);
      return res.status(400).json({
        success: false,
        message: 'Invalid training ID'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.log('Invalid userId:', userId);
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    console.log('ObjectId validation passed');

    // Check if training exists and belongs to the trainer
    console.log('Fetching training...');
    const training = await Training.findById(trainingId).lean();
    
    if (!training) {
      console.log('Training not found:', trainingId);
      return res.status(404).json({
        success: false,
        message: 'Training not found'
      });
    }

    console.log('Training found:', {
      id: training._id,
      title: training.title,
      trainerId: training.trainerId
    });

    // Ensure training belongs to the trainer (handle both string and ObjectId)
    const trainingTrainerId = training.trainerId.toString();
    if (trainingTrainerId !== trainerId) {
      console.log('Training ownership mismatch:', {
        trainingTrainerId,
        paramTrainerId: trainerId
      });
      return res.status(400).json({
        success: false,
        message: 'Training does not belong to this trainer'
      });
    }

    console.log('Training ownership verified');

    // Find trainer
    console.log('Fetching trainer...');
    const trainer = await Trainer.findById(trainerId);
    
    if (!trainer) {
      console.log('Trainer not found:', trainerId);
      return res.status(404).json({
        success: false,
        message: 'Trainer not found'
      });
    }

    console.log('Trainer found:', {
      id: trainer._id,
      name: trainer.name,
      reviewsCount: trainer.reviews?.length || 0
    });

    // FIXED: Check if user is registered for this training
    console.log('Checking user registration...');
    
    // Convert to ObjectIds for proper comparison
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const trainingObjectId = new mongoose.Types.ObjectId(trainingId);
    
    // Check multiple possible fields where user registration might be stored
    const userRegistration = await Training.findOne({
      _id: trainingObjectId,
      $or: [
        { 'registrations.userId': userObjectId },
        { 'participants.userId': userObjectId },
        { 'participants': userObjectId },
        { 'enrolledUsers': userObjectId },
        { 'registeredUsers': userObjectId }
      ]
    }).lean();

    console.log('Registration check result:', {
      found: !!userRegistration, // FIXED: Use userRegistration instead of isUserRegistered
      userId: userId,
      trainingId: trainingId
    });

    if (!userRegistration) { // FIXED: Use userRegistration instead of isUserRegistered
      console.log('User not registered for training');
      return res.status(403).json({
        success: false,
        message: 'You must be registered for this training to leave a review'
      });
    }

    console.log('User registration verified');

    // Check if user has already reviewed this specific training
    console.log('Checking for existing review...');
    const existingReview = trainer.reviews.find(
      review => {
        const reviewUserId = review.userId?.toString();
        const reviewTrainingId = review.trainingId?.toString();
        console.log('Comparing review:', {
          reviewUserId,
          reviewTrainingId,
          targetUserId: userId,
          targetTrainingId: trainingId,
          match: reviewUserId === userId && reviewTrainingId === trainingId
        });
        return reviewUserId === userId && reviewTrainingId === trainingId;
      }
    );

    if (existingReview) {
      console.log('Existing review found:', existingReview._id);
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this training'
      });
    }

    console.log('No existing review found, proceeding with review creation');

    // Add training-specific review using model method
    console.log('Calling addTrainingReview method...');
    console.log('Method parameters:', {
      userId,
      trainingId,
      rating: parseInt(rating),
      comment: comment.trim()
    });

    try {
      await trainer.addTrainingReview(userId, trainingId, parseInt(rating), comment.trim());
      console.log('addTrainingReview method completed successfully');
    } catch (methodError) {
      console.error('Error in addTrainingReview method:', methodError);
      throw methodError;
    }

    console.log('Review added successfully, sending response...');

    res.status(201).json({
      success: true,
      message: 'Training review submitted successfully',
      data: {
        ratings: {
          average: trainer.ratings.average,
          totalRatings: trainer.ratings.totalRatings
        }
      }
    });

    console.log('=== ADD TRAINING REVIEW DEBUG SUCCESS ===');

  } catch (error) {
    console.error('=== ADD TRAINING REVIEW DEBUG ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Check for specific error types
    if (error.name === 'ValidationError') {
      console.error('Mongoose validation error:', error.errors);
      return res.status(400).json({
        success: false,
        message: 'Validation error: ' + Object.values(error.errors).map(e => e.message).join(', ')
      });
    }
    
    if (error.name === 'MongoError' || error.name === 'MongoServerError') {
      console.error('MongoDB error:', error);
      return res.status(500).json({
        success: false,
        message: 'Database error while submitting review'
      });
    }

    if (error.message === 'User has already reviewed this training') {
      console.error('Duplicate review attempt');
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    console.error('Unhandled error in addTrainingReview');
    res.status(500).json({
      success: false,
      message: 'Server error while submitting review',
      debug: process.env.NODE_ENV === 'development' ? {
        error: error.message,
        stack: error.stack
      } : undefined
    });
  }
};

// General trainer review (legacy support) - Add this function
export const addReview = async (req, res) => {
  try {
    const { id: trainerId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.id;

    // Validation
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    if (!comment || !comment.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Comment is required'
      });
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(trainerId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid trainer ID'
      });
    }

    // Find trainer
    const trainer = await Trainer.findById(trainerId);
    if (!trainer) {
      return res.status(404).json({
        success: false,
        message: 'Trainer not found'
      });
    }

    // For general reviews, check for duplicates to maintain some control
    const existingGeneralReview = trainer.reviews.find(
      review => review.userId.toString() === userId.toString() && !review.trainingId
    );

    if (existingGeneralReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already left a general review for this trainer'
      });
    }

    // Add general review using model method
    await trainer.addReview(userId, parseInt(rating), comment.trim());

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      data: {
        ratings: {
          average: trainer.ratings.average,
          totalRatings: trainer.ratings.totalRatings
        }
      }
    });

  } catch (error) {
    console.error('Error adding general review:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while submitting review'
    });
  }
};

// Clean, optimized registration check based on your schema
export const canUserReviewTraining = async (req, res) => {
  try {
    const { trainerId, trainingId } = req.params;
    const userId = req.user.id;

    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(trainerId) || !mongoose.Types.ObjectId.isValid(trainingId)) {
      return res.status(400).json({
        success: false,
        canReview: false,
        reason: 'Invalid IDs'
      });
    }

    // Get training and trainer
    const training = await Training.findById(trainingId).lean();
    
    if (!training) {
      return res.status(200).json({
        success: true,
        canReview: false,
        reason: 'Training not found'
      });
    }

    const trainer = await Trainer.findById(trainerId);
    
    if (!trainer) {
      return res.status(200).json({
        success: true,
        canReview: false,
        reason: 'Trainer not found'
      });
    }

    // Check if training belongs to trainer
    if (training.trainerId.toString() !== trainerId) {
      return res.status(200).json({
        success: true,
        canReview: false,
        reason: 'Training does not belong to this trainer'
      });
    }

    // Check if user is registered for this training
    let isRegistered = false;

    // Check participants array (based on your working schema)
    if (training.participants && Array.isArray(training.participants)) {
      isRegistered = training.participants.some(participant => {
        if (typeof participant === 'string') {
          return participant === userId;
        } else if (typeof participant === 'object' && participant !== null) {
          // Check for userId field or direct ObjectId comparison
          return participant.userId?.toString() === userId || participant._id?.toString() === userId;
        }
        return false;
      });
    }

    // Fallback: Check registrations array if participants check failed
    if (!isRegistered && training.registrations && Array.isArray(training.registrations)) {
      isRegistered = training.registrations.some(registration => {
        if (typeof registration === 'string') {
          return registration === userId;
        } else if (typeof registration === 'object' && registration !== null) {
          return registration.userId?.toString() === userId || registration.user?.toString() === userId;
        }
        return false;
      });
    }

    if (!isRegistered) {
      return res.status(200).json({
        success: true,
        canReview: false,
        reason: 'Not registered for this training',
        isRegistered: false
      });
    }

    // Check if already reviewed this specific training
    const existingReview = trainer.reviews.find(
      review => review.userId.toString() === userId && 
                review.trainingId && 
                review.trainingId.toString() === trainingId
    );

    if (existingReview) {
      return res.status(200).json({
        success: true,
        canReview: false,
        reason: 'Already reviewed this training',
        isRegistered: true,
        hasReviewed: true
      });
    }

    // User can review
    res.status(200).json({
      success: true,
      canReview: true,
      reason: 'Can review this training',
      isRegistered: true,
      hasReviewed: false
    });

  } catch (error) {
    console.error('Error in canUserReviewTraining:', error);
    res.status(500).json({
      success: false,
      canReview: false,
      message: 'Server error while checking review eligibility'
    });
  }
};

// UPDATED: Get trainer reviews with enhanced filtering
export const getTrainerReviews = async (req, res) => {
  try {
    const { id: trainerId } = req.params;
    const { trainingId } = req.query; // Optional filter by specific training

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(trainerId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid trainer ID'
      });
    }

    const trainer = await Trainer.findById(trainerId)
      .populate({
        path: 'reviews.userId',
        select: 'name email'
      })
      .populate({
        path: 'reviews.trainingId',
        select: 'title trainingType status'
      });

    if (!trainer) {
      return res.status(404).json({
        success: false,
        message: 'Trainer not found'
      });
    }

    // Filter reviews if trainingId is specified
    let reviews = trainer.reviews;
    if (trainingId) {
      if (!mongoose.Types.ObjectId.isValid(trainingId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid training ID'
        });
      }
      reviews = reviews.filter(review => 
        review.trainingId && review.trainingId._id.toString() === trainingId
      );
    }

    // Sort by most recent first
    reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Format reviews for frontend
    const formattedReviews = reviews.map(review => ({
      _id: review._id,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
      user: review.userId ? {
        _id: review.userId._id,
        name: review.userId.name,
        email: review.userId.email
      } : null,
      training: review.trainingId ? {
        _id: review.trainingId._id,
        title: review.trainingId.title,
        trainingType: review.trainingId.trainingType,
        status: review.trainingId.status
      } : null
    }));

    // Calculate training-specific stats if filtering by training
    let trainingStats = null;
    if (trainingId && formattedReviews.length > 0) {
      const trainingReviews = formattedReviews.filter(r => r.training);
      trainingStats = {
        averageRating: trainingReviews.reduce((sum, r) => sum + r.rating, 0) / trainingReviews.length,
        totalReviews: trainingReviews.length,
        ratingBreakdown: {
          5: trainingReviews.filter(r => r.rating === 5).length,
          4: trainingReviews.filter(r => r.rating === 4).length,
          3: trainingReviews.filter(r => r.rating === 3).length,
          2: trainingReviews.filter(r => r.rating === 2).length,
          1: trainingReviews.filter(r => r.rating === 1).length
        }
      };
    }

    res.status(200).json({
      success: true,
      data: {
        reviews: formattedReviews,
        ratings: trainer.ratings,
        reviewCounts: {
          total: trainer.reviews.length,
          withTraining: trainer.reviews.filter(r => r.trainingId).length,
          generalReviews: trainer.reviews.filter(r => !r.trainingId).length,
          forThisTraining: trainingId ? formattedReviews.length : 0
        },
        trainingStats
      }
    });

  } catch (error) {
    console.error('Error fetching trainer reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching reviews'
    });
  }
};