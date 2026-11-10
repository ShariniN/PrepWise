import express from 'express';
import pdfUpload from '../../middleware/pdfUpload.js';
import { 
  analyzeResume,
  saveAnalysis,
  getSavedAnalysis,
  deleteAnalysis,
} from './cvAnalysis.controller.js';
import userAuth from '../../middleware/userAuth.js';

const analysisRouter = express.Router();

// All routes require authentication
analysisRouter.use(userAuth);

// POST /api/analyze/analyze-resume - Analyze resume against job descriptions (with uploaded file)
analysisRouter.post('/analyze-resume', pdfUpload('resume'), analyzeResume);

// POST /api/analyze/save - Save analysis results
analysisRouter.post('/save', saveAnalysis);

// GET /api/analyze/saved - Get all saved analyses for user
analysisRouter.get('/saved', getSavedAnalysis);

// DELETE /api/analyze/delete/:id - Delete a specific saved analysis
analysisRouter.delete('/delete/:id', deleteAnalysis);


export default analysisRouter;