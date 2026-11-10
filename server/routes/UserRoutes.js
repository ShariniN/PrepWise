import express from "express";
import userAuth from "../middleware/userAuth.js";
import pdfUpload from "../middleware/pdfUpload.js";
import {
  getUserProfile,
  updateUserProfile,
  changePassword,
  uploadCV,
  getCurrentCV,
  deleteCV,
} from "../controllers/userController.js";

import { 
  getSavedAnalysis, 
  deleteAnalysis
} from '../controllers/cvAnalysiscontroller.js';

// Import Skills Assessment controller methods
import { 
  getRatings, 
  deleteRatings, 
  getRatingsStats,
  getRatingDetails 
} from '../controllers/skillAssessorController.js';

const userRouter = express.Router();


// Middleware to ensure user is a fresher (for protected routes)
const ensureFresher = (req, res, next) => {
  if (req.user.userType !== 'fresher' && req.user.accountType !== 'Fresher') {
    return res.status(403).json({
      success: false,
      message: "This endpoint is only available for fresher accounts"
    });
  }
  next();
};

// All routes require authentication
userRouter.use(userAuth);

// Profile routes (fresher only)
userRouter.get('/profile', getUserProfile);
userRouter.put('/profile', updateUserProfile);
userRouter.put('/change-password', changePassword);

// CV Management routes (fresher only)
userRouter.put('/upload-cv', pdfUpload('cv'), uploadCV);
userRouter.get('/cv', getCurrentCV);
userRouter.delete('/cv', deleteCV);

// CV Analysis routes (fresher only)
userRouter.get('/saved-analyses', getSavedAnalysis); 
userRouter.delete('/analysis/:id', deleteAnalysis);

// Skills Assessment routes (fresher only)
userRouter.get('/skills-assessments', getRatings);
userRouter.get('/skills-stats', getRatingsStats);
userRouter.get('/skills-assessment/:id', getRatingDetails);
userRouter.delete('/assessment/:id', deleteRatings);

export default userRouter;