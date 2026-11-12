import express from 'express'
import { acceptInvite, isAuthenticated, login, logout, resetPassword, sendResetOtp, signup, verifyEmailLink, resendVerificationLink } from './auth.controller.js';
import rateLimit from 'express-rate-limit';
import userAuth from '../../middleware/userAuth.js';


// Signup and resend send email to any address, so one client cannot ask for unlimited mail.
const mailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.SIGNUP_MAIL_LIMIT) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Try again later.' },
});

const authRouter = express.Router();
authRouter.post("/accept-invite", acceptInvite);
authRouter.post("/signup", mailLimiter, signup);
authRouter.post("/verify-email", verifyEmailLink);
authRouter.post("/resend-verification", mailLimiter, resendVerificationLink);
authRouter.post('/login', login);
authRouter.post('/logout', logout);
authRouter.get('/is-auth', userAuth, isAuthenticated)
authRouter.post('/send-reset-otp', sendResetOtp);
authRouter.post('/reset-password', resetPassword);

export default authRouter;
