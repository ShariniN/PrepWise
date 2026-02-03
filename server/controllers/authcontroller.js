import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import userModel from "../models/userModel.js";
import transporter from "../config/nodemailer.js";
import { EMAIL_VERIFY_TEMPLATE, PASSWORD_RESET_TEMPLATE } from "../config/emailTemplates.js";
import { v4 as uuidv4 } from "uuid";

//Register functionality - MODIFIED TO HANDLE BOTH USER TYPES
export const registerUser = async (req, res) => {
  const { name, email, password, phoneNumber, accountType } = req.body;

  if (!name || !email || !password || !phoneNumber || !accountType) {
    return res.json({ success: false, message: "Missing Details" });
  }

  if (!["Trainer", "Fresher"].includes(accountType)) {
    return res.json({ success: false, message: "Invalid account type" });
  }

  if (!/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/.test(password)) {
    return res.json({
      success: false,
      message: "Password must be at least 6 characters long, include one uppercase letter, one number, and one special character",
    });
  }
  
  if (!/^\d{10}$/.test(phoneNumber)) {
    return res.json({
      success: false,
      message: "Phone number must be exactly 10 digits",
    });
  }

  try {
    // Check if user already exists in both models
    const existingUser = await userModel.findOne({ email });
    const existingTrainer = await trainerModel.findOne({ email });

    if (existingUser || existingTrainer) {
      return res.json({ success: false, message: "User already exists with this email" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = String(Math.floor(100000 + Math.random() * 900000));

    let newAccount;
    let token;

    if (accountType === "Fresher") {
      // Create Fresher in userModel
      newAccount = new userModel({
        name,
        email,
        password: hashedPassword,
        phoneNumber,
        accountType,
        verifyOtp: otp,
        verifyOtpExpireAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      });
      await newAccount.save();

      // Generate JWT token for fresher
      token = jwt.sign(
        { id: newAccount._id, accountType: newAccount.accountType, userType: 'fresher' },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

    } else if (accountType === "Trainer") {
      // Create Trainer in trainerModel
      newAccount = new trainerModel({
        trainerId: uuidv4(),
        name,
        email,
        password: hashedPassword,
        contact: phoneNumber,
        specializationSkills: [],
        experiences: [],
        education: [],
        // Add OTP fields for trainers (you'll need to add these to trainerModel)
        verifyOtp: otp,
        verifyOtpExpireAt: Date.now() + 24 * 60 * 60 * 1000,
        isAccountVerified: false
      });
      await newAccount.save();

      // Generate JWT token for trainer
      token = jwt.sign(
        { id: newAccount._id, accountType: accountType, userType: 'trainer' },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );
    }

    // Set token as cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Send verification OTP email
    const mailOptions = {
      from: process.env.SENDER_EMAIL,
      to: email,
      subject: "Welcome to PrepWise - Verify Your Email",
      html: EMAIL_VERIFY_TEMPLATE.replace("{{otp}}", otp).replace("{{email}}", email)
    };

    await transporter.sendMail(mailOptions);

    return res.json({ 
      success: true, 
      message: `${accountType} registration successful! Please check your email for verification OTP.`,
      needsVerification: true,
      accountType: accountType
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.json({ success: false, message: error.message });
  }
};

//Login functionality - MODIFIED TO CHECK BOTH MODELS
export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.json({
      success: false,
      message: "Email and password are required to login.",
    });
  }

  try {
    // Check both models for the user
    let user = await userModel.findOne({ email });
    let userType = 'fresher';
    
    if (!user) {
      user = await trainerModel.findOne({ email }).select('+password');
      userType = 'trainer';
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password. Please try again",
      });
    }

    // Compare password
    let isMatch;
    if (userType === 'trainer' && user.comparePassword) {
      // Use trainer's comparePassword method
      isMatch = await user.comparePassword(password);
    } else {
      // Use bcrypt for fresher accounts
      isMatch = await bcrypt.compare(password, user.password);
    }

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password. Please try again",
      });
    }

    // Generate JWT and set cookie
    const token = jwt.sign(
      { id: user._id, accountType: user.accountType || 'Trainer', userType },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Return appropriate response based on user type
    return res.json({ 
      success: true, 
      accountType: user.accountType || 'Trainer',
      isAccountVerified: user.isAccountVerified || false,
      needsVerification: !(user.isAccountVerified || false),
      userType: userType
    });
  } catch (error) {
    console.error("Login error:", error);
    res.json({ success: false, message: error.message });
  }
};

//Logout functionality (unchanged)
export const logout = async (req, res) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    });

    return res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

//Send verification OTP - MODIFIED TO HANDLE BOTH USER TYPES
export const sendVerifyOtp = async (req, res) => {
  try {
    const { userType } = req.user; // This should be set by middleware
    let user;

    if (userType === 'fresher') {
      user = await userModel.findById(req.user.id);
    } else {
      user = await trainerModel.findById(req.user.id);
    }

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    // If already verified, do not send OTP
    if (user.isAccountVerified) {
      return res.json({
        success: false,
        message: "Account is already verified",
      });
    }

    // Generate 6 digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));

    // Store OTP and expiry
    user.verifyOtp = otp;
    user.verifyOtpExpireAt = Date.now() + 24 * 60 * 60 * 1000;

    await user.save();

    // Prepare email
    const mailOptions = {
      from: process.env.SENDER_EMAIL,
      to: user.email,
      subject: "OTP to Verify Account",
      html: EMAIL_VERIFY_TEMPLATE.replace("{{otp}}", otp).replace("{{email}}", user.email)
    };

    await transporter.sendMail(mailOptions);

    res.json({ success: true, message: "Verification OTP sent" });
  } catch (error) {
    console.error("Send OTP error:", error);
    res.json({ success: false, message: error.message });
  }
};

//Email verification using OTP - MODIFIED TO HANDLE BOTH USER TYPES
export const verifyEmail = async (req, res) => {
  const { otp } = req.body;
  const { userType } = req.user;

  if (!req.user.id || !otp) {
    return res.json({ success: false, message: "Missing details" });
  }

  try {
    let user;
    
    if (userType === 'fresher') {
      user = await userModel.findById(req.user.id);
    } else {
      user = await trainerModel.findById(req.user.id);
    }

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    if (user.verifyOtp === "" || user.verifyOtp !== otp) {
      return res.json({ success: false, message: "Invalid OTP" });
    }

    if (user.verifyOtpExpireAt < Date.now()) {
      return res.json({ success: false, message: "OTP expired" });
    }

    user.isAccountVerified = true;
    user.verifyOtp = "";
    user.verifyOtpExpireAt = 0;

    await user.save();
    return res.json({ success: true, message: "Email verified successfully" });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
};

//Check if user is authenticated - MODIFIED TO HANDLE BOTH USER TYPES
export const isAuthenticated = async (req, res) => {
  try {
    const { userType } = req.user;
    let user;
    
    if (userType === 'fresher') {
      user = await userModel.findById(req.user.id);
    } else {
      user = await trainerModel.findById(req.user.id);
    }

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    // Format user data based on type
    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      accountType: user.accountType || 'Trainer',
      isAccountVerified: user.isAccountVerified || false,
      phoneNumber: user.phoneNumber || user.contact,
      lastActive: user.lastActive || user.updatedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      userType: userType
    };

    // Add fresher-specific fields
    if (userType === 'fresher') {
      userData.accountPlan = user.accountPlan;
    }
    
    // Add trainer-specific fields
    if (userType === 'trainer') {
      userData.trainerId = user.trainerId;
      userData.specializationSkills = user.specializationSkills;
      userData.experienceYears = user.experienceYears;
    }

    return res.json({ 
      success: true, 
      user: userData 
    });
  } catch (error) {
    console.error("Auth check error:", error);
    return res.json({ success: false, message: error.message });
  }
};

//Send password reset OTP - MODIFIED TO HANDLE BOTH USER TYPES
export const sendResetOtp = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.json({ success: false, message: "Email is required" });
  }

  try {
    // Check both models
    let user = await userModel.findOne({ email });
    let userType = 'fresher';
    
    if (!user) {
      user = await trainerModel.findOne({ email });
      userType = 'trainer';
    }
    
    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));

    user.resetOtp = otp;
    user.resetOtpExpireAt = Date.now() + 15 * 60 * 1000;

    await user.save();

    const mailOptions = {
      from: process.env.SENDER_EMAIL,
      to: user.email,
      subject: "OTP to Reset Password",
      html: PASSWORD_RESET_TEMPLATE.replace("{{otp}}", otp).replace("{{email}}", user.email)
    };

    await transporter.sendMail(mailOptions);

    res.json({ success: true, message: "Reset OTP sent" });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
};

//Reset user password - MODIFIED TO HANDLE BOTH USER TYPES
export const resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.json({
      success: false,
      message: "Email, OTP and the new password are required",
    });
  }

  try {
    // Check both models
    let user = await userModel.findOne({ email });
    let userType = 'fresher';
    
    if (!user) {
      user = await trainerModel.findOne({ email });
      userType = 'trainer';
    }
    
    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    if (user.resetOtp === "" || user.resetOtp !== otp) {
      return res.json({ success: false, message: "Invalid OTP" });
    }

    if (user.resetOtpExpireAt < Date.now()) {
      return res.json({ success: false, message: "OTP expired" });
    }

    // Hash new password
    if (userType === 'trainer') {
      // For trainers, set password directly (pre-save hook will hash it)
      user.password = newPassword;
    } else {
      // For freshers, hash manually
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedPassword;
    }

    user.resetOtp = "";
    user.resetOtpExpireAt = 0;

    await user.save();

    return res.json({
      success: true,
      message: "Password has been reset successfully",
    });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
};
