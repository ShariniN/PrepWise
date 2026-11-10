import express from 'express';
import { saveRatings } from './skills.controller.js';
import userAuth from '../../middleware/userAuth.js';

const skillAssessor = express.Router();

skillAssessor.use(userAuth);

// POST /api/swot/save-ratings - Save technology confidence ratings
skillAssessor.post('/save-ratings', saveRatings);

export default skillAssessor;
