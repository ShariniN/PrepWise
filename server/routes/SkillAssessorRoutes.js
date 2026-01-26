
import express from 'express';
import { saveRatings, getRatings, deleteRatings, getRatingsStats } from '../controllers/skillAssessorController.js';
import userAuth from '../middleware/userAuth.js';
import SkillsAssessment from '../models/SkillAssessorModel.js';

const skillAssessor = express.Router();

// Health check route (no auth required)
skillAssessor.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'SWOT service is running',
    timestamp: new Date().toISOString()
  });
});

// Apply authentication middleware to all routes below this point
skillAssessor.use(userAuth);

// Test route to verify auth is working
skillAssessor.get('/test-auth', (req, res) => {
  res.json({
    success: true,
    message: 'SWOT authentication working!',
    user: {
      id: req.user.id
    },
    timestamp: new Date().toISOString()
  });
});


// POST /api/swot/save-ratings - Save technology confidence ratings
skillAssessor.post('/save-ratings', saveRatings);

// GET /api/swot/ratings - Get all ratings for the authenticated user
skillAssessor.get('/ratings', getRatings);

// GET /api/swot/stats - Get user statistics  
skillAssessor.get('/stats', getRatingsStats);

// GET /api/swot/ratings/:resumeHash - Get ratings for a specific resume
// Important: This must come AFTER /ratings to avoid route conflicts
skillAssessor.get('/ratings/:resumeHash', getRatings);

// DELETE /api/swot/delete/:id - Delete specific technology ratings
skillAssessor.delete('/delete/:id', deleteRatings);

export default skillAssessor;