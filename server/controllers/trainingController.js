

// controllers/trainingController.js - Enhanced with Registration & Payment
import Training from "../models/TrainingModel.js";
import Trainer from "../models/TrainerModel.js";
import userModel from "../models/userModel.js";
import TrainingRegistration from "../models/TrainingRegistrationModel.js";
import nodemailer from 'nodemailer';
import crypto from 'crypto';


// In-memory OTP storage (consider using Redis in production)
const otpStorage = new Map();

// Email transporter setup
const createTransporter = () => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error('Email configuration missing. Please set EMAIL_USER and EMAIL_PASS environment variables.');
      throw new Error('Email configuration missing');
    }

    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      debug: true,
      logger: true
    });
  } catch (error) {
    console.error('Failed to create email transporter:', error);
    throw error;
  }
};

// Create a new training
export const createTraining = async (req, res) => {
  try {
    const trainerId = req.user?.id; // Get from auth middleware
    
    if (!trainerId) {
      return res.status(401).json({
        success: false,
        message: 'Trainer authentication required'
      });
    }

    const {
      title,
      trainingType,
      trainingCategory,
      availableSlots,
      startDate,
      timeSlot,
      duration,
      price,
      status,
      description,
      onlineLink
    } = req.body;

    // Validation
    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Training title is required'
      });
    }

    if (!trainingType) {
      return res.status(400).json({
        success: false,
        message: 'Training type is required'
      });
    }

    // Validate soft skills requirements
    if (trainingType === 'soft skills' && !timeSlot) {
      return res.status(400).json({
        success: false,
        message: 'Time slot is required for soft skills training'
      });
    }

    // Verify trainer exists
    const trainer = await Trainer.findById(trainerId);
    if (!trainer) {
      return res.status(404).json({
        success: false,
        message: 'Trainer not found'
      });
    }

    // Create training object
    const trainingData = {
      trainerId,
      title: title.trim(),
      trainingType,
      trainingCategory: trainingCategory || '',
      availableSlots: parseInt(availableSlots) || 0,
      startDate: startDate ? new Date(startDate) : null,
      timeSlot: timeSlot || '',
      duration: duration || '',
      price: price || '',
      status: status || 'upcoming',
      description: description || '',
      onlineLink: onlineLink || ''
    };

    const newTraining = await Training.create(trainingData);
    
    res.status(201).json({
      success: true,
      message: 'Training created successfully',
      data: newTraining
    });

  } catch (error) {
    console.error('Error creating training:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Update an existing training
export const updateTraining = async (req, res) => {
  try {
    const { id } = req.params;
    const trainerId = req.user?.id;
    const updateData = req.body;

    if (!trainerId) {
      return res.status(401).json({
        success: false,
        message: 'Trainer authentication required'
      });
    }

    // Validation
    if (!updateData.title || !updateData.title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Training title is required'
      });
    }

    if (!updateData.trainingType) {
      return res.status(400).json({
        success: false,
        message: 'Training type is required'
      });
    }

    // Validate soft skills requirements
    if (updateData.trainingType === 'soft skills' && !updateData.timeSlot) {
      return res.status(400).json({
        success: false,
        message: 'Time slot is required for soft skills training'
      });
    }

    // Find training and verify ownership
    const training = await Training.findById(id);
    if (!training) {
      return res.status(404).json({
        success: false,
        message: 'Training not found'
      });
    }

    if (training.trainerId.toString() !== trainerId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this training'
      });
    }

    // Prepare update data
    const cleanUpdateData = {
      title: updateData.title.trim(),
      trainingType: updateData.trainingType,
      trainingCategory: updateData.trainingCategory || '',
      availableSlots: parseInt(updateData.availableSlots) || training.availableSlots,
      startDate: updateData.startDate ? new Date(updateData.startDate) : training.startDate,
      timeSlot: updateData.timeSlot || '',
      duration: updateData.duration || '',
      price: updateData.price || '',
      status: updateData.status || training.status,
      description: updateData.description || '',
      onlineLink: updateData.onlineLink || '',
      updatedAt: new Date()
    };

    const updatedTraining = await Training.findByIdAndUpdate(
      id, 
      cleanUpdateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Training updated successfully',
      data: updatedTraining
    });

  } catch (error) {
    console.error('Error updating training:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Delete a training
export const deleteTraining = async (req, res) => {
  try {
    const { id } = req.params;
    const trainerId = req.user?.id;

    if (!trainerId) {
      return res.status(401).json({
        success: false,
        message: 'Trainer authentication required'
      });
    }

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Training ID is required'
      });
    }

    // Find training and verify ownership
    const training = await Training.findById(id);
    if (!training) {
      return res.status(404).json({
        success: false,
        message: 'Training not found'
      });
    }

    if (training.trainerId.toString() !== trainerId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this training'
      });
    }

    // Check if training has registered participants
    if (training.registeredParticipants > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete training with registered participants'
      });
    }

    await Training.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Training deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting training:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get all trainings for a trainer
export const getTrainerTrainings = async (req, res) => {
  try {
    const trainerId = req.user?.id || req.params.trainerId;

    if (!trainerId) {
      return res.status(400).json({
        success: false,
        message: 'Trainer ID is required'
      });
    }

    const trainings = await Training.find({ trainerId })
      .sort({ updatedAt: -1 })
      .populate('participants.userId', 'name email');

    res.json({
      success: true,
      data: trainings
    });

  } catch (error) {
    console.error('Error fetching trainings:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get single training
export const getTraining = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Training ID is required'
      });
    }

    const training = await Training.findById(id)
      .populate('trainerId', 'name email contact specializationSkills experiences education ratings reviews')
      .populate('participants.userId', 'name email');
    
    if (!training) {
      return res.status(404).json({
        success: false,
        message: 'Training not found'
      });
    }

    res.json({
      success: true,
      data: training
    });

  } catch (error) {
    console.error('Error fetching training:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get all trainings (public route with filters)
export const getAllTrainings = async (req, res) => {
  try {
    const {
      trainingType,
      trainingCategory,
      status,
      startDate,
      page = 1,
      limit = 10,
      search,
      sortBy = 'startDate',
      sortOrder = 'asc'
    } = req.query;

    let query = { status: { $in: ['upcoming', 'active'] } };
    
    // Apply filters
    if (trainingType) query.trainingType = trainingType;
    if (trainingCategory) query.trainingCategory = { $regex: trainingCategory, $options: 'i' };
    if (status) query.status = status;
    if (startDate) {
      query.startDate = { $gte: new Date(startDate) };
    }
    
    // Search in title and description
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { trainingCategory: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const trainings = await Training.find(query)
      .populate('trainerId', 'name email ratings')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Training.countDocuments(query);

    res.json({
      success: true,
      data: trainings,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error fetching all trainings:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Register for a training (for users)
export const registerForTraining = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { participantInfo, selectedSlot } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const training = await Training.findById(id);
    if (!training) {
      return res.status(404).json({
        success: false,
        message: 'Training not found'
      });
    }

    // Check if training is available
    if (training.availableSlots <= training.registeredParticipants) {
      return res.status(400).json({
        success: false,
        message: 'Training is fully booked'
      });
    }

    // Check if user already registered
    const existingParticipant = training.participants.find(
      p => p.userId.toString() === userId.toString() && p.status === 'registered'
    );

    if (existingParticipant) {
      return res.status(400).json({
        success: false,
        message: 'You are already registered for this training'
      });
    }

    // Create registration record
    const registrationData = {
      userId,
      trainingId: id,
      participantInfo: {
        name: participantInfo.name,
        email: participantInfo.email,
        contact: participantInfo.contact,
        affiliation: participantInfo.affiliation
      },
      selectedSlot: training.trainingType === 'soft skills' ? selectedSlot : null,
      registrationDate: new Date(),
      paymentStatus: 'pending'
    };

    const registration = await TrainingRegistration.create(registrationData);

    res.json({
      success: true,
      message: 'Registration initiated. Proceed to payment.',
      data: {
        registrationId: registration._id,
        registeredParticipants: training.registeredParticipants,
        availableSpots: training.availableSlots - training.registeredParticipants
      }
    });

  } catch (error) {
    console.error('Error registering for training:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Registration failed'
    });
  }
};


// Send payment OTP
export const sendPaymentOTP = async (req, res) => {
  try {
    const { email, trainingId, amount } = req.body;

    console.log('Payment OTP request:', { email, trainingId, amount });

    if (!email || !trainingId) {
      return res.status(400).json({
        success: false,
        message: 'Email and training ID are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    };

    // Verify training exists
    const training = await Training.findById(trainingId);
    if (!training) {
      return res.status(404).json({
        success: false,
        message: 'Training not found'
      });
    }

    // Generate OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpExpiry = Date.now() + 5 * 60 * 1000; // 5 minutes

    // Store OTP in memory
    const otpKey = `payment_${email}_${trainingId}`;
    otpStorage.set(otpKey, {
      otp,
      email,
      trainingId,
      expiry: otpExpiry,
      attempts: 0,
      amount: amount || training.price
    });

    // Clean up expired OTPs
    setTimeout(() => {
      otpStorage.delete(otpKey);
    }, 5 * 60 * 1000);

    // Send OTP email
    try {
      const transporter = createTransporter();
      
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'PrepWise - Payment Verification Code',
        html: `
          <!DOCTYPE html>
          <html xmlns="http://www.w3.org/1999/xhtml">
          <head>
            <title>Payment Verification</title>
            <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&display=swap" rel="stylesheet">
            <style type="text/css">
              body { margin: 0; padding: 0; font-family: 'Open Sans', sans-serif; background: #E5E5E5; }
              table, td { border-collapse: collapse; }
              .container { width: 100%; max-width: 500px; margin: 70px auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; }
              .main-content { padding: 40px 30px; color: #333333; }
              .otp-code { background: #f8f9fa; border: 2px solid #28a745; border-radius: 10px; padding: 20px; margin: 20px 0; text-align: center; }
              .training-info { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 15px; margin: 20px 0; }
              .security-info { background: #d1ecf1; border: 1px solid #bee5eb; border-radius: 8px; padding: 15px; margin: 20px 0; }
              .footer { background: #f8f9fa; padding: 20px 30px; text-align: center; font-size: 12px; color: #6c757d; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600;">Payment Verification</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">PrepWise Training Platform</p>
              </div>
              
              <div class="main-content">
                <h2 style="color: #333; margin: 0 0 20px 0; font-size: 20px;">Verify Your Payment</h2>
                
                <p style="margin: 0 0 20px 0; line-height: 1.5;">Hello,</p>
                
                <p style="margin: 0 0 20px 0; line-height: 1.5;">You are completing payment for the training: <strong>${training.title}</strong></p>
                
                <p style="margin: 0 0 20px 0; line-height: 1.5;">Please use the verification code below to confirm your payment:</p>
                
                <div class="otp-code">
                  <p style="margin: 0 0 10px 0; color: #666; font-size: 14px;">Your verification code is:</p>
                  <h1 style="margin: 0; color: #28a745; font-size: 32px; letter-spacing: 4px; font-weight: bold;">${otp}</h1>
                </div>
                
                <div class="training-info">
                  <h3 style="margin: 0 0 10px 0; color: #856404; font-size: 16px;">Payment Details:</h3>
                  <p style="margin: 5px 0; color: #856404;"><strong>Training:</strong> ${training.title}</p>
                  <p style="margin: 5px 0; color: #856404;"><strong>Type:</strong> ${training.trainingType}</p>
                  <p style="margin: 5px 0; color: #856404;"><strong>Amount:</strong> ${amount || training.price || 'Free'}</p>
                  ${training.startDate ? `<p style="margin: 5px 0; color: #856404;"><strong>Date:</strong> ${new Date(training.startDate).toLocaleDateString()}</p>` : ''}
                </div>
                
                <div class="security-info">
                  <h4 style="margin: 0 0 10px 0; color: #0c5460; font-size: 14px;">Security Notice:</h4>
                  <ul style="margin: 0; padding-left: 20px; color: #0c5460; font-size: 13px;">
                    <li>This code is valid for 5 minutes only</li>
                    <li>Do not share this code with anyone</li>
                    <li>If you didn't request this payment, please ignore this email</li>
                  </ul>
                </div>
                
                <p style="margin: 20px 0 0 0; line-height: 1.5; color: #666;">Thank you for choosing PrepWise for your training needs.</p>
              </div>
              
              <div class="footer">
                <p style="margin: 0 0 5px 0;">This is an automated email from PrepWise. Please do not reply to this email.</p>
                <p style="margin: 0;">If you have any questions, please contact our support team.</p>
              </div>
            </div>
          </body>
          </html>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log('Payment OTP email sent successfully to:', email);

      res.json({
        success: true,
        message: 'Payment verification code sent to your email'
      });

    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      otpStorage.delete(otpKey);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification code. Please try again.',
        error: process.env.NODE_ENV === 'development' ? emailError.message : undefined
      });
    }

  } catch (error) {
    console.error('Error in sendPaymentOTP:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Verify payment OTP and process payment
export const verifyPaymentOTP = async (req, res) => {
  try {
    const { trainingId, registrationData, paymentDetails, otp, selectedSlot } = req.body;
    const userId = req.user?.id;

    console.log('Payment OTP verification request:', { trainingId, otp: '***', userId });

    if (!otp || otp.length !== 6) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 6-digit verification code'
      });
    }

    if (!trainingId || !registrationData || !paymentDetails) {
      return res.status(400).json({
        success: false,
        message: 'Missing required payment information'
      });
    }

    // Retrieve and verify OTP
    const otpKey = `payment_${registrationData.participantInfo.email}_${trainingId}`;
    const storedOtpData = otpStorage.get(otpKey);

    if (!storedOtpData) {
      return res.status(400).json({
        success: false,
        message: 'Verification code not found or expired. Please request a new code.'
      });
    }

    // Check if OTP expired
    if (Date.now() > storedOtpData.expiry) {
      otpStorage.delete(otpKey);
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired. Please request a new code.'
      });
    }

    // Verify OTP
    if (storedOtpData.otp !== otp) {
      storedOtpData.attempts = (storedOtpData.attempts || 0) + 1;
      
      if (storedOtpData.attempts >= 3) {
        otpStorage.delete(otpKey);
        return res.status(400).json({
          success: false,
          message: 'Too many failed attempts. Please request a new verification code.'
        });
      }
      
      return res.status(400).json({
        success: false,
        message: `Invalid verification code. ${3 - storedOtpData.attempts} attempts remaining.`
      });
    }

    // Get training and verify availability
    const training = await Training.findById(trainingId);
    if (!training) {
      return res.status(404).json({
        success: false,
        message: 'Training not found'
      });
    }

    // Check availability
    if (training.availableSlots <= training.registeredParticipants) {
      return res.status(400).json({
        success: false,
        message: 'Training is fully booked'
      });
    }

    // Check if user already registered
    const existingParticipant = training.participants.find(
      p => p.userId.toString() === userId.toString() && p.status === 'registered'
    );

    if (existingParticipant) {
      return res.status(400).json({
        success: false,
        message: 'You are already registered for this training'
      });
    }

    // Process registration
    try {
      // Add participant to training
      training.participants.push({
        userId,
        registrationDate: new Date(),
        status: 'registered',
        paymentStatus: 'confirmed',
        selectedSlot: training.trainingType === 'soft skills' ? selectedSlot : null,
        participantInfo: registrationData.participantInfo
      });

      // Update registered participants count
      training.registeredParticipants = (training.registeredParticipants || 0) + 1;
      
      await training.save();

      // Create registration record
      const registration = await TrainingRegistration.create({
        userId,
        trainingId,
        participantInfo: registrationData.participantInfo,
        selectedSlot: training.trainingType === 'soft skills' ? selectedSlot : null,
        registrationDate: new Date(),
        paymentStatus: 'confirmed',
        paymentDetails: {
          method: paymentDetails.method,
          timestamp: new Date(),
          verifiedAt: new Date()
        },
        confirmedAt: new Date()
      });

      // Send payment confirmation email
      try {
        const transporter = createTransporter();
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: registrationData.participantInfo.email,
          subject: 'Payment Confirmed - Training Registration Complete',
          html: `
            <!DOCTYPE html>
            <html xmlns="http://www.w3.org/1999/xhtml">
            <head>
              <title>Payment Confirmation</title>
              <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&display=swap" rel="stylesheet">
              <style type="text/css">
                body { margin: 0; padding: 0; font-family: 'Open Sans', sans-serif; background: #E5E5E5; }
                .container { width: 100%; max-width: 500px; margin: 70px auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
                .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); padding: 30px; text-align: center; }
                .main-content { padding: 40px 30px; color: #333333; }
                .success-badge { background: #d4edda; border: 2px solid #c3e6cb; border-radius: 10px; padding: 20px; margin: 20px 0; text-align: center; }
                .training-details { background: #f8f9fa; border-left: 4px solid #28a745; padding: 20px; margin: 20px 0; border-radius: 5px; }
                .participant-info { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0; }
                .training-link { background: #e7f3ff; border: 2px solid #b3d9ff; border-radius: 10px; padding: 20px; margin: 20px 0; }
                .next-steps { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 15px; margin: 20px 0; }
                .footer { background: #f8f9fa; padding: 20px 30px; text-align: center; font-size: 12px; color: #6c757d; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600;">Payment Confirmed!</h1>
                  <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">PrepWise Training Platform</p>
                </div>
                
                <div class="main-content">
                  <div class="success-badge">
                    <h2 style="color: #155724; margin: 0 0 10px 0; font-size: 18px;">Registration Complete</h2>
                    <p style="color: #155724; margin: 0; font-size: 14px;">Your payment has been confirmed and you are now registered for the training.</p>
                  </div>
                  
                  <h3 style="color: #333; margin: 30px 0 15px 0; font-size: 18px;">Training Details:</h3>
                  
                  <div class="training-details">
                    <p style="margin: 8px 0;"><strong>Training:</strong> ${training.title}</p>
                    <p style="margin: 8px 0;"><strong>Type:</strong> ${training.trainingType}</p>
                    <p style="margin: 8px 0;"><strong>Category:</strong> ${training.trainingCategory}</p>
                    ${training.startDate ? `<p style="margin: 8px 0;"><strong>Start Date:</strong> ${new Date(training.startDate).toLocaleDateString()}</p>` : ''}
                    ${selectedSlot ? `<p style="margin: 8px 0;"><strong>Time Slot:</strong> ${selectedSlot}</p>` : ''}
                    ${training.duration ? `<p style="margin: 8px 0;"><strong>Duration:</strong> ${training.duration}</p>` : ''}
                    <p style="margin: 8px 0;"><strong>Amount Paid:</strong> ${storedOtpData.amount || 'Free'}</p>
                    <p style="margin: 8px 0;"><strong>Payment Method:</strong> ${paymentDetails.method}</p>
                    <p style="margin: 8px 0;"><strong>Registration Date:</strong> ${new Date().toLocaleDateString()}</p>
                  </div>

                  <h3 style="color: #333; margin: 30px 0 15px 0; font-size: 18px;">Participant Information:</h3>
                  <div class="participant-info">
                    <p style="margin: 8px 0;"><strong>Name:</strong> ${registrationData.participantInfo.name}</p>
                    <p style="margin: 8px 0;"><strong>Email:</strong> ${registrationData.participantInfo.email}</p>
                    <p style="margin: 8px 0;"><strong>Contact:</strong> ${registrationData.participantInfo.contact}</p>
                    ${registrationData.participantInfo.affiliation ? `<p style="margin: 8px 0;"><strong>Affiliation:</strong> ${registrationData.participantInfo.affiliation}</p>` : ''}
                  </div>

                  ${training.onlineLink ? `
                    <div class="training-link">
                      <h3 style="margin: 0 0 15px 0; color: #0066cc; font-size: 16px;">Training Access Link:</h3>
                      <p style="margin: 0 0 15px 0;">
                        <a href="${training.onlineLink}" style="color: #0066cc; font-weight: bold; text-decoration: none; background: white; padding: 10px 15px; border-radius: 5px; border: 1px solid #b3d9ff; display: inline-block;">${training.onlineLink}</a>
                      </p>
                      <p style="margin: 0; color: #0066cc; font-size: 14px;">Please join 5-10 minutes before the scheduled start time.</p>
                    </div>
                  ` : ''}

                  <div class="next-steps">
                    <h4 style="margin: 0 0 10px 0; color: #856404; font-size: 14px;">Next Steps:</h4>
                    <ul style="margin: 0; padding-left: 20px; color: #856404; font-size: 13px;">
                      <li>Save this email for your records</li>
                      <li>Check your email regularly for training updates</li>
                      <li>Prepare any materials mentioned in the training description</li>
                      ${training.onlineLink ? '<li>Test your internet connection and device before the training</li>' : ''}
                    </ul>
                  </div>

                  <p style="color: #333; margin: 30px 0 0 0; line-height: 1.5;">Thank you for choosing PrepWise for your professional development. We're excited to have you in this training!</p>
                </div>
                
                <div class="footer">
                  <p style="margin: 0 0 5px 0;">This is an automated confirmation from PrepWise.</p>
                  <p style="margin: 0 0 15px 0;">For support, contact us at support@prepwise.com</p>
                  <p style="margin: 0; font-weight: bold;">Registration ID: ${registration._id}</p>
                </div>
              </div>
            </body>
            </html>
          `
        };

        await transporter.sendMail(mailOptions);
        console.log('Payment confirmation email sent successfully');

      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
        // Don't fail the payment if email fails - payment is already processed
      }

      // Clear OTP from storage
      otpStorage.delete(otpKey);
      console.log('Payment OTP cleared from storage');

      res.json({
        success: true,
        message: 'Payment confirmed successfully! Registration completed.',
        data: {
          registrationId: registration._id,
          trainingLink: training.onlineLink,
          registeredParticipants: training.registeredParticipants,
          availableSpots: training.availableSlots - training.registeredParticipants
        }
      });

    } catch (dbError) {
      console.error('Database error during registration:', dbError);
      return res.status(500).json({
        success: false,
        message: 'Payment verified but registration failed. Please contact support.'
      });
    }

  } catch (error) {
    console.error('Error in verifyPaymentOTP:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Clean up expired OTPs periodically
export const cleanupExpiredOTPs = () => {
  const now = Date.now();
  for (const [key, data] of otpStorage.entries()) {
    if (now > data.expiry) {
      otpStorage.delete(key);
    }
  }
};

// Run cleanup every 5 minutes
setInterval(cleanupExpiredOTPs, 5 * 60 * 1000);