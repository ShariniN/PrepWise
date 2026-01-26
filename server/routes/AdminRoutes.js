// routes/adminRoutes.js - Fixed Version
import express from "express";
import User from "../models/userModel.js";
import Trainer from "../models/TrainerModel.js";
import Notice from "../models/NoticesModel.js";
import SkillsAssessment from "../models/SkillAssessorModel.js";
import InterviewModel from "../models/InterviewModel.js";
import {getFresherById} from "../controllers/userController.js"; 
import {getAllTrainings,getTraining,getTrainerTrainings,deleteTraining} from "../controllers/trainingController.js";
import Training from "../models/TrainingModel.js";

//admin authentication imports
import {loginAdmin, getAdminProfile} from "../controllers/adminController.js";
import {protectAdmin} from "../middleware/adminAuth.js";

//admin
const adminRouter = express.Router();

// Admin login routes - FIXED: Removed extra 'admin/' from path
adminRouter.post('/login', loginAdmin);
adminRouter.get('/profile', protectAdmin, getAdminProfile);

/* ---------------- Freshers ---------------- */

// Get all freshers with enhanced data including skills assessment and interview scores
adminRouter.get('/freshers', protectAdmin, async (req, res) => {
  try {
    console.log('Fetching freshers...');
    
    const freshers = await User.find({ accountType: 'Fresher' })
      .select('name email phoneNumber createdAt lastActive currentCV swot overallFeedback hasCV')
      .sort({ createdAt: -1 });

    console.log(`Found ${freshers.length} freshers`);

    if (freshers.length === 0) {
      return res.json({
        success: true,
        data: []
      });
    }

    // Get skills assessments and interviews for all freshers
    const fresherIds = freshers.map(f => f._id);
    
    console.log('Fetching skills assessments...');
    let skillsAssessments = [];
    try {
      skillsAssessments = await SkillsAssessment.find({ 
        userId: { $in: fresherIds },
        isSaved: true 
      }).sort({ updatedAt: -1 });
      console.log(`Found ${skillsAssessments.length} skills assessments`);
    } catch (skillsError) {
      console.error('Error fetching skills assessments:', skillsError);
      // Continue without skills assessments
    }
    
    console.log('Fetching interviews...');
    let interviews = [];
    try {
      interviews = await InterviewModel.find({ 
        userId: { $in: fresherIds },
        status: 'completed'
      }).sort({ completedAt: -1 });
      console.log(`Found ${interviews.length} completed interviews`);
    } catch (interviewError) {
      console.error('Error fetching interviews:', interviewError);
      // Continue without interviews
    }

    // Map skills assessments by userId (get latest for each user)
    const skillsAssessmentMap = new Map();
    skillsAssessments.forEach(assessment => {
      const userId = assessment.userId.toString();
      if (!skillsAssessmentMap.has(userId)) {
        skillsAssessmentMap.set(userId, assessment);
      }
    });

    // Map interviews by userId (get latest for each user)
    const interviewMap = new Map();
    interviews.forEach(interview => {
      const userId = interview.userId.toString();
      if (!interviewMap.has(userId)) {
        interviewMap.set(userId, interview);
      }
    });

    // Enhance fresher data
    const enhancedFreshers = freshers.map(fresher => {
      try {
        const fresherObj = fresher.toObject();
        const userId = fresher._id.toString();
        
        // Add skills assessment data
        const skillsAssessment = skillsAssessmentMap.get(userId);
        if (skillsAssessment) {
          fresherObj.skillsAssessment = {
            hasAssessment: true,
            overallScore: skillsAssessment.overallScore || 0,
            averageProficiency: skillsAssessment.averageProficiency || 0,
            totalSkills: skillsAssessment.skills ? skillsAssessment.skills.length : 0,
            // Display all skills with their proficiency levels
            skills: skillsAssessment.skills ? skillsAssessment.skills.map(skill => ({
              name: skill.name || 'Unknown Skill',
              proficiencyLevel: skill.proficiencyLevel || 0,
              category: skill.category || 'General',
              yearsOfExperience: skill.yearsOfExperience || 0
            })) : [],
            topSkills: skillsAssessment.skills ? 
              skillsAssessment.skills
                .sort((a, b) => (b.proficiencyLevel || 0) - (a.proficiencyLevel || 0))
                .slice(0, 5)
                .map(skill => ({
                  name: skill.name || 'Unknown Skill',
                  proficiencyLevel: skill.proficiencyLevel || 0,
                  category: skill.category || 'General'
                })) : [],
            strengths: skillsAssessment.strengths || [],
            weaknesses: skillsAssessment.weaknesses || [],
            opportunities: skillsAssessment.opportunities || [],
            threats: skillsAssessment.threats || [],
            completedAt: skillsAssessment.completedAt || null
          };
        } else {
          fresherObj.skillsAssessment = {
            hasAssessment: false,
            overallScore: null,
            averageProficiency: null,
            totalSkills: 0,
            skills: [],
            topSkills: [],
            strengths: [],
            weaknesses: [],
            opportunities: [],
            threats: [],
            completedAt: null
          };
        }

        // Add interview data with detailed category percentages
        const interview = interviewMap.get(userId);
        if (interview && interview.overallFeedback) {
          fresherObj.interviewScore = {
            hasInterview: true,
            overallScore: interview.overallFeedback.score || 0,
            readinessLevel: interview.overallFeedback.readinessLevel || 'Not Assessed',
            // Display all category percentages
            categoryPercentages: {
              behavioral: (interview.overallFeedback.categoryPercentages && interview.overallFeedback.categoryPercentages.behavioral) || 0,
              technical: (interview.overallFeedback.categoryPercentages && interview.overallFeedback.categoryPercentages.technical) || 0,
              coding: (interview.overallFeedback.categoryPercentages && interview.overallFeedback.categoryPercentages.coding) || 0,
              communication: (interview.overallFeedback.categoryPercentages && interview.overallFeedback.categoryPercentages.communication) || 0,
              technicalAccuracy: (interview.overallFeedback.categoryPercentages && interview.overallFeedback.categoryPercentages.technicalAccuracy) || 0,
              problemSolving: (interview.overallFeedback.categoryPercentages && interview.overallFeedback.categoryPercentages.problemSolving) || 0
            },
            // Additional feedback details
            feedback: interview.overallFeedback.feedback || null,
            completedAt: interview.completedAt || null,
            totalQuestions: (interview.questions && interview.questions.length) || 0,
            completedQuestions: (interview.responses && interview.responses.length) || 0
          };
        } else {
          fresherObj.interviewScore = {
            hasInterview: false,
            overallScore: null,
            readinessLevel: null,
            categoryPercentages: null,
            feedback: null,
            completedAt: null,
            totalQuestions: 0,
            completedQuestions: 0
          };
        }

        return fresherObj;
      } catch (enhanceError) {
        console.error(`Error enhancing fresher ${fresher._id}:`, enhanceError);
        // Return basic fresher object if enhancement fails
        const basicFresher = fresher.toObject();
        basicFresher.skillsAssessment = { hasAssessment: false };
        basicFresher.interviewScore = { hasInterview: false };
        return basicFresher;
      }
    });

    console.log('Successfully enhanced fresher data');

    res.json({
      success: true,
      data: enhancedFreshers
    });

  } catch (error) {
    console.error('Error fetching freshers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch freshers',
      error: error.message
    });
  }
});

// GET single fresher by ID
adminRouter.get("/freshers/:id", protectAdmin, getFresherById);

// UPDATE fresher
adminRouter.put("/freshers/:id", protectAdmin, async (req, res) => {
  try {
    const fresher = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!fresher) return res.status(404).json({ success: false, message: "Fresher not found" });
    res.json({ success: true, data: fresher });
  } catch (err) {
    console.error('Error updating fresher:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DEACTIVATE fresher
adminRouter.put("/freshers/:id/deactivate", protectAdmin, async (req, res) => {
  try {
    const fresher = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!fresher) return res.status(404).json({ success: false, message: "Fresher not found" });
    res.json({ success: true, data: fresher });
  } catch (err) {
    console.error('Error deactivating fresher:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE fresher
adminRouter.delete("/freshers/:id", protectAdmin, async (req, res) => {
  try {
    const fresher = await User.findByIdAndDelete(req.params.id);
    if (!fresher) return res.status(404).json({ success: false, message: "Fresher not found" });
    res.json({ success: true, message: "Fresher deleted successfully" });
  } catch (err) {
    console.error('Error deleting fresher:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ---------------- Trainers ---------------- */

// Get all trainers with enhanced data including created trainings
adminRouter.get('/trainers', protectAdmin, async (req, res) => {
  try {
    console.log('Fetching trainers...');

    const trainers = await Trainer.find({})
      .select('name email contact createdAt lastActive education experiences specializationSkills')
      .sort({ createdAt: -1 });

    console.log(`Found ${trainers.length} trainers`);

    if (trainers.length === 0) {
      return res.json({
        success: true,
        data: []
      });
    }

    // Get trainings created by these trainers
    const trainerIds = trainers.map(t => t._id);
    
    console.log('Fetching trainings...');
    let trainings = [];
    try {
      trainings = await Training.find({ trainerId: { $in: trainerIds } })
        .sort({ createdAt: -1 });
      console.log(`Found ${trainings.length} trainings`);
    } catch (trainingError) {
      console.error('Error fetching trainings:', trainingError);
      // Continue without trainings
    }

    // Group trainings by trainerId
    const trainingsByTrainer = new Map();
    trainings.forEach(training => {
      const trainerId = training.trainerId.toString();
      if (!trainingsByTrainer.has(trainerId)) {
        trainingsByTrainer.set(trainerId, []);
      }
      trainingsByTrainer.get(trainerId).push(training);
    });

    // Enhance trainer data
    const enhancedTrainers = trainers.map(trainer => {
      try {
        const trainerObj = trainer.toObject();
        const trainerId = trainer._id.toString();
        
        const trainerTrainings = trainingsByTrainer.get(trainerId) || [];
        
        trainerObj.createdTrainings = {
          total: trainerTrainings.length,
          active: trainerTrainings.filter(t => t.status === 'active').length,
          upcoming: trainerTrainings.filter(t => t.status === 'upcoming').length,
          completed: trainerTrainings.filter(t => t.status === 'completed').length,
          totalParticipants: trainerTrainings.reduce((sum, t) => sum + (t.registeredParticipants || 0), 0),
          // Complete training details for display
          trainings: trainerTrainings.map(training => ({
            _id: training._id,
            title: training.title || 'Untitled Training',
            status: training.status || 'unknown',
            trainingType: training.trainingType || 'general',
            trainingCategory: training.trainingCategory || 'uncategorized',
            duration: training.duration || 'TBD',
            registeredParticipants: training.registeredParticipants || 0,
            availableSlots: training.availableSlots || 0,
            startDate: training.startDate || null,
            price: training.price || 'Free',
            description: training.description || '',
            createdAt: training.createdAt || new Date()
          }))
        };

        return trainerObj;
      } catch (enhanceError) {
        console.error(`Error enhancing trainer ${trainer._id}:`, enhanceError);
        // Return basic trainer object if enhancement fails
        const basicTrainer = trainer.toObject();
        basicTrainer.createdTrainings = {
          total: 0,
          active: 0,
          upcoming: 0,
          completed: 0,
          totalParticipants: 0,
          trainings: []
        };
        return basicTrainer;
      }
    });

    console.log('Successfully enhanced trainer data');

    res.json({
      success: true,
      data: enhancedTrainers
    });

  } catch (error) {
    console.error('Error fetching trainers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trainers',
      error: error.message
    });
  }
});

// GET single trainer by ID
adminRouter.get("/trainers/:id", protectAdmin, async (req, res) => {
  try {
    const trainer = await Trainer.findById(req.params.id);
    if (!trainer) return res.status(404).json({ success: false, message: "Trainer not found" });
    res.json({ success: true, data: trainer });
  } catch (err) {
    console.error('Error fetching trainer:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DEACTIVATE trainer
adminRouter.put("/trainers/:id/deactivate", protectAdmin, async (req, res) => {
  try {
    const trainer = await Trainer.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!trainer) return res.status(404).json({ success: false, message: "Trainer not found" });
    res.json({ success: true, data: trainer });
  } catch (err) {
    console.error('Error deactivating trainer:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE trainer
adminRouter.delete("/trainers/:id", protectAdmin, async (req, res) => {
  try {
    const trainer = await Trainer.findByIdAndDelete(req.params.id);
    if (!trainer) return res.status(404).json({ success: false, message: "Trainer not found" });
    res.json({ success: true, message: "Trainer deleted successfully" });
  } catch (err) {
    console.error('Error deleting trainer:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ---------------- Training Data ---------------- */

// Get training registrations
adminRouter.get('/training-registrations', protectAdmin, async (req, res) => {
  try {
    const registrations = await TrainingRegistration.find({})
      .populate('userId', 'name email phoneNumber')
      .populate('trainingId', 'title status')
      .sort({ registrationDate: -1 });
    
    const formattedRegistrations = registrations.map(reg => ({
      userId: reg.userId?._id,
      userName: reg.userId?.name,
      userEmail: reg.userId?.email,
      trainingId: reg.trainingId?._id,
      trainingTitle: reg.trainingId?.title,
      registrationStatus: reg.registrationStatus,
      paymentStatus: reg.paymentStatus,
      registrationDate: reg.registrationDate,
      selectedSlot: reg.selectedSlot
    }));

    res.json({
      success: true,
      data: formattedRegistrations
    });
  } catch (error) {
    console.error('Error fetching training registrations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch training registrations',
      error: error.message
    });
  }
});

// Get trainer trainings
adminRouter.get('/trainer-trainings', protectAdmin, async (req, res) => {
  try {
    const trainings = await Training.find({})
      .populate('trainerId', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: trainings
    });
  } catch (error) {
    console.error('Error fetching trainer trainings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trainer trainings',
      error: error.message
    });
  }
});

/* ---------------- Notices ---------------- */

// GET all notices
adminRouter.get("/notices", protectAdmin, async (req, res) => {
  try {
    const notices = await Notice.find().sort({ createdAt: -1 });
    res.json({ success: true, count: notices.length, data: notices });
  } catch (err) {
    console.error("Error fetching notices:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET single notice by ID
adminRouter.get("/notices/:id", protectAdmin, async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);
    if (!notice) return res.status(404).json({ success: false, message: "Notice not found" });
    res.json({ success: true, data: notice });
  } catch (err) {
    console.error("Error fetching notice:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// CREATE new notice
adminRouter.post("/notices", protectAdmin, async (req, res) => {
  try {
    console.log("Received notice data:", req.body);
    
    // Validate required fields
    const { eventName, eventDescription } = req.body;
    if (!eventName || !eventDescription) {
      return res.status(400).json({ 
        success: false, 
        message: "Event name and description are required" 
      });
    }

    // Create notice with validated data
    const noticeData = {
      eventName: eventName.trim(),
      eventDescription: eventDescription.trim(),
      date: req.body.date || null,
      time: req.body.time || null,
      venue: req.body.venue?.trim() || null,
      registrationLink: req.body.registrationLink?.trim() || null,
      otherInfo: req.body.otherInfo?.trim() || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const notice = new Notice(noticeData);
    const savedNotice = await notice.save();
    
    console.log("Notice saved successfully:", savedNotice);
    res.status(201).json({ 
      success: true, 
      message: "Notice created successfully", 
      data: savedNotice 
    });
  } catch (err) {
    console.error("Error creating notice:", err);
    
    // Handle validation errors
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ 
        success: false, 
        message: "Validation error", 
        errors 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: "Failed to create notice: " + err.message 
    });
  }
});

// UPDATE notice
adminRouter.put("/notices/:id", protectAdmin, async (req, res) => {
  try {
    console.log("Updating notice:", req.params.id, req.body);
    
    // Validate required fields
    const { eventName, eventDescription } = req.body;
    if (!eventName || !eventDescription) {
      return res.status(400).json({ 
        success: false, 
        message: "Event name and description are required" 
      });
    }

    const updateData = {
      eventName: eventName.trim(),
      eventDescription: eventDescription.trim(),
      date: req.body.date || null,
      time: req.body.time || null,
      venue: req.body.venue?.trim() || null,
      registrationLink: req.body.registrationLink?.trim() || null,
      otherInfo: req.body.otherInfo?.trim() || null,
      updatedAt: new Date()
    };

    const notice = await Notice.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    );
    
    if (!notice) {
      return res.status(404).json({ 
        success: false, 
        message: "Notice not found" 
      });
    }
    
    res.json({ 
      success: true, 
      message: "Notice updated successfully", 
      data: notice 
    });
  } catch (err) {
    console.error("Error updating notice:", err);
    
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ 
        success: false, 
        message: "Validation error", 
        errors 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: "Failed to update notice: " + err.message 
    });
  }
});

// DELETE notice
adminRouter.delete("/notices/:id", protectAdmin, async (req, res) => {
  try {
    const notice = await Notice.findByIdAndDelete(req.params.id);
    if (!notice) {
      return res.status(404).json({ 
        success: false, 
        message: "Notice not found" 
      });
    }
    
    res.json({ 
      success: true, 
      message: "Notice deleted successfully" 
    });
  } catch (err) {
    console.error("Error deleting notice:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to delete notice: " + err.message 
    });
  }
});

export default adminRouter;