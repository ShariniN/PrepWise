// import express from "express";
// import multer from 'multer';
// import userAuth from "../middleware/userAuth.js";
// import {
//   getUserProfile,
//   updateUserProfile,
//   changePassword,
//   upgradeToPremium,
//   downgradeToBasic,
//   uploadCV,
//   getCurrentCV,
//   deleteCV,
//   getAllFreshers,
//   getFresherById,
//   updateFresher,
//   deleteFresher,
// } from "../controllers/userController.js";


// import { 
//   getSavedAnalysis, 
//   deleteAnalysis
// } from '../controllers/cvAnalysiscontroller.js';

// // Import Skills Assessment controller methods
// import { 
//   getRatings, 
//   deleteRatings, 
//   getRatingsStats,
//   getRatingDetails 
// } from '../controllers/skillAssessorController.js';

// const userRouter = express.Router();

// // Configure multer for CV uploads
// const storage = multer.memoryStorage();
// const upload = multer({ 
//   storage: storage,
//   limits: {
//     fileSize: 10 * 1024 * 1024, // 10MB limit
//   },
//   fileFilter: (req, file, cb) => {
//     if (file.mimetype === 'application/pdf') {
//       cb(null, true);
//     } else {
//       cb(new Error('Only PDF files are allowed'), false);
//     }
//   }
// });

// // All routes require authentication
// userRouter.use(userAuth);

// // Profile routes
// userRouter.get('/profile', getUserProfile);
// userRouter.put('/profile', updateUserProfile);
// userRouter.put('/change-password', changePassword);

// // NEW: CV Management routes
// userRouter.put('/upload-cv', upload.single('cv'), uploadCV);
// userRouter.get('/cv', getCurrentCV);
// userRouter.delete('/cv', deleteCV);

// // Subscription routes
// userRouter.put('/upgrade-premium', upgradeToPremium);
// userRouter.put('/downgrade-basic', downgradeToBasic);

// // CV Analysis routes
// userRouter.get('/saved-analyses', getSavedAnalysis); 
// userRouter.delete('/analysis/:id', deleteAnalysis);

// // Skills Assessment routes  
// userRouter.get('/skills-assessments', getRatings);
// userRouter.get('/skills-stats', getRatingsStats);
// userRouter.get('/skills-assessment/:id', getRatingDetails);
// userRouter.delete('/assessment/:id', deleteRatings);

// //for the admin dashboard
// userRouter.get("/freshers",getAllFreshers);
// userRouter.get("/freshers/:id", getFresherById);
// userRouter.put("/freshers/:id",updateFresher);
// userRouter.delete("/freshers/:id",deleteFresher);

// export default userRouter;

import express from "express";
import multer from 'multer';
import userAuth from "../middleware/userAuth.js";
import {
  getUserProfile,
  updateUserProfile,
  changePassword,
  upgradeToPremium,
  downgradeToBasic,
  uploadCV,
  getCurrentCV,
  deleteCV,
  getAllFreshers,
  getFresherById,
  updateFresher,
  deleteFresher,
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

// Configure multer for CV uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

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
userRouter.put('/upload-cv', upload.single('cv'), uploadCV);
userRouter.get('/cv', getCurrentCV);
userRouter.delete('/cv', deleteCV);

// Subscription routes (fresher only)
userRouter.put('/upgrade-premium', upgradeToPremium);
userRouter.put('/downgrade-basic', downgradeToBasic);

// CV Analysis routes (fresher only)
userRouter.get('/saved-analyses', getSavedAnalysis); 
userRouter.delete('/analysis/:id', deleteAnalysis);

// Skills Assessment routes (fresher only)
userRouter.get('/skills-assessments', getRatings);
userRouter.get('/skills-stats', getRatingsStats);
userRouter.get('/skills-assessment/:id', getRatingDetails);
userRouter.delete('/assessment/:id', deleteRatings);

// Admin dashboard routes (these might need additional admin middleware)
userRouter.get("/freshers", getAllFreshers);
userRouter.get("/freshers/:id", getFresherById);
userRouter.put("/freshers/:id", updateFresher);
userRouter.delete("/freshers/:id", deleteFresher);

export default userRouter;