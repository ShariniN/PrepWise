// routes/trainerRoutes.js - Updated with training-specific review routes
import express from "express";
import userAuth from "../middleware/userAuth.js";
import {
  getTrainerProfile,
  updateTrainerProfile,
  addSkill,
  removeSkill,
  addExperience,
  addEducation,
  getAllTrainers,
  getTrainerById,
  changeTrainerPassword,
  addReview,
  addTrainingReview,
  getTrainerReviews,
  canUserReviewTraining
} from "../controllers/trainerController.js";

const trainerRouter = express.Router();

// Public routes (no auth required)
trainerRouter.get("/all", getAllTrainers); // Get all trainers with filtering
trainerRouter.get("/:id/reviews", getTrainerReviews); // Get reviews for specific trainer (public)

// Protected routes (auth required)
trainerRouter.use(userAuth); // Apply auth middleware to all routes below

// Training-specific review routes (these must come before general :id routes)
trainerRouter.post("/:trainerId/training-review", addTrainingReview); // Add training-specific review
trainerRouter.get("/:trainerId/training/:trainingId/can-review", canUserReviewTraining); // Check if user can review specific training

// Profile management
trainerRouter.get("/profile/me", getTrainerProfile); // Get own profile
trainerRouter.put("/profile/me", updateTrainerProfile); // Update own profile
trainerRouter.put("/change-password", changeTrainerPassword); // Change password

// Skills management
trainerRouter.post("/skills", addSkill); // Add skill
trainerRouter.delete("/skills", removeSkill); // Remove skill

// Experience management
trainerRouter.post("/experience", addExperience); // Add experience

// Education management
trainerRouter.post("/education", addEducation); // Add education

// Review management
trainerRouter.get("/:id", getTrainerById); // Get specific trainer by ID
trainerRouter.post("/:id/review", addReview); // Add general review to specific trainer

export default trainerRouter;