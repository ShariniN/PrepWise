import express from "express";
import userAuth from "../../middleware/userAuth.js";
import pdfUpload from "../../middleware/pdfUpload.js";
import {
  getUserProfile,
  updateUserProfile,
  changePassword,
  uploadCV,
  getCurrentCV,
  deleteCV,
} from "./users.controller.js";

import { 
  getSavedAnalysis, 
  deleteAnalysis
} from '../cvAnalysis/cvAnalysis.controller.js';

const userRouter = express.Router();

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

export default userRouter;