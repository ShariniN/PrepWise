
// routes/trainingRoutes.js - Updated with Registration & Payment
import express from 'express';
import userAuth from "../middleware/userAuth.js";
import {
  createTraining,
  updateTraining,
  deleteTraining,
  getTrainerTrainings,
  getTraining,
  getAllTrainings,
  registerForTraining,
  sendPaymentOTP,
  verifyPaymentOTP,
} from '../controllers/trainingController.js';

const router = express.Router();

// Public routes (no authentication required)
router.get('/all', getAllTrainings); // Get all trainings with filters

// Payment OTP routes (no auth required for sending, auth required for verification)
router.post('/send-payment-otp', sendPaymentOTP); // Send OTP for payment verification

router.get('/:id', getTraining); // Get specific training by ID

// Protected routes (authentication required)
router.use(userAuth); // Apply auth middleware to all routes below

// Training CRUD operations (for trainers)
router.post('/', createTraining); // Create new training
router.get('/trainer/my-trainings', getTrainerTrainings); // Get trainings for logged-in trainer
router.put('/:id', updateTraining); // Update training
router.delete('/:id', deleteTraining); // Delete training

// Training registration & payment (for users)
router.post('/:id/register', registerForTraining); // Register for training
router.post('/verify-payment-otp', verifyPaymentOTP); // New: Verify payment OTP and complete registration

// User registration management
// router.get('/user/my-registrations', getUserRegistrations); // Get user's registrations

export default router;