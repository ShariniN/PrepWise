import express from 'express';
import pdfUpload from '../middleware/pdfUpload.js';
import { 
  analyzeResume,
  saveAnalysis,
  toggleSaveStatus,  // New method
  getSavedAnalysis,
  deleteAnalysis,
  getAllAnalyses,
  getAnalysisById,
  getTechnologyStats,
  analyzeWithProfileCV
} from '../controllers/cvAnalysiscontroller.js';
import userAuth from '../middleware/userAuth.js';

const analysisRouter = express.Router();

// All routes require authentication
analysisRouter.use(userAuth);

analysisRouter.post('/toggle-save', toggleSaveStatus); 
// POST /api/analyze/analyze-resume - Analyze resume against job descriptions (with uploaded file)
analysisRouter.post('/analyze-resume', pdfUpload('resume'), analyzeResume);

// NEW: POST /api/analyze/analyze-profile-cv - Analyze using profile CV (no file upload needed)
analysisRouter.post('/analyze-profile-cv', analyzeWithProfileCV);

// POST /api/analyze/save - Save analysis results
analysisRouter.post('/save', saveAnalysis);

// GET /api/analyze/saved - Get all saved analyses for user
analysisRouter.get('/saved', getSavedAnalysis);

// DELETE /api/analyze/delete/:id - Delete a specific saved analysis
analysisRouter.delete('/delete/:id', deleteAnalysis);


export default analysisRouter;