import userModel from "../models/userModel.js";
import bcrypt from "bcryptjs";
import crypto from 'crypto';
import pdf from 'pdf-parse';
import { NOT_PDF_MESSAGE } from '../middleware/pdfUpload.js';
import { passwordOk, PASSWORD_MESSAGE, normalizePhone, PHONE_MESSAGE } from '../services/accountRules.js';

// A file that is not a readable PDF is the user's problem to fix, so it is a 400, not a 500.
class NotPdfError extends Error {}

const extractTextFromPDF = async (buffer) => {
  try {
    const data = await pdf(buffer);
    return data.text;
  } catch (error) {
    console.error('PDF extraction error:', error.message);
    throw new NotPdfError(NOT_PDF_MESSAGE);
  }
};

// Middleware to ensure user is a fresher
const ensureFresher = (req, res, next) => {
  if (req.user.userType !== 'fresher' && req.user.accountType !== 'Fresher') {
    return res.status(403).json({
      success: false,
      message: "This endpoint is only available for fresher accounts"
    });
  }
  next();
};

export const getUserProfile = async (req, res) => {
  try {
    // Ensure this is a fresher account
    if (req.user.userType !== 'fresher') {
      return res.status(403).json({
        success: false,
        message: "This endpoint is only available for fresher accounts"
      });
    }

    const userId = req.user._id || req.user.id;
    
    const user = await userModel.findById(userId).select('-password -resetOtp -verifyOtp -resetOtpExpireAt -verifyOtpExpireAt');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user profile"
    });
  }
};

export const updateUserProfile = async (req, res) => {
  try {
    // Ensure this is a fresher account
    if (req.user.userType !== 'fresher') {
      return res.status(403).json({
        success: false,
        message: "This endpoint is only available for fresher accounts"
      });
    }

    const userId = req.user._id || req.user.id;
    // Only these fields can be changed by the user. Role and plan are never accepted from the client.
    const { name, phoneNumber } = req.body || {};

    const cleanName = typeof name === 'string' ? name.trim() : '';
    if (!cleanName || cleanName.length > 100) {
      return res.status(400).json({ success: false, message: "Name is required (1 to 100 characters)" });
    }

    // The phone is optional: absent = leave it as it is, "" or null = clear it, anything else must be 10-15 digits.
    const $set = { name: cleanName, lastActive: new Date() };
    const update = { $set };
    if (phoneNumber === '' || phoneNumber === null) {
      update.$unset = { phoneNumber: 1 };
    } else if (phoneNumber !== undefined) {
      const phone = normalizePhone(phoneNumber);
      if (!phone) return res.status(400).json({ success: false, message: PHONE_MESSAGE });
      $set.phoneNumber = phone;
    }

    const updatedUser = await userModel.findByIdAndUpdate(
      userId,
      update,
      {
        new: true,
        runValidators: true,
        select: '-password -resetOtp -verifyOtp -resetOtpExpireAt -verifyOtpExpireAt'
      }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: updatedUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile"
    });
  }
};

export const changePassword = async (req, res) => {
  try {
    // Ensure this is a fresher account
    if (req.user.userType !== 'fresher') {
      return res.status(403).json({
        success: false,
        message: "This endpoint is only available for fresher accounts"
      });
    }

    const userId = req.user._id || req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required"
      });
    }

    // Same strength rule as accepting an invitation.
    if (!passwordOk(newPassword)) {
      return res.status(400).json({ success: false, message: PASSWORD_MESSAGE });
    }

    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect"
      });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    await userModel.findByIdAndUpdate(userId, {
      password: hashedNewPassword,
      lastActive: new Date()
    });

    res.json({
      success: true,
      message: "Password updated successfully"
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to change password"
    });
  }
};

export const uploadCV = async (req, res) => {
  try {
    // Ensure this is a fresher account
    if (req.user.userType !== 'fresher') {
      return res.status(403).json({
        success: false,
        message: "CV upload is only available for fresher accounts"
      });
    }

    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No CV file uploaded' 
      });
    }
    
    const user = await userModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Extract text from PDF buffer
    const cvText = await extractTextFromPDF(req.file.buffer);
    
    if (!cvText || cvText.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Could not extract text from PDF' 
      });
    }

    // Create hash of CV content for change detection
    const cvHash = crypto.createHash('sha256').update(cvText).digest('hex');

    // Update user with CV data
    await user.updateCV(cvText, req.file.originalname, cvHash);

    res.json({
      success: true,
      message: 'CV uploaded successfully',
      data: {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        uploadedAt: user.currentCV.uploadedAt,
        hasCV: user.hasCV
      }
    });
  } catch (error) {
    if (error instanceof NotPdfError) return res.status(400).json({ success: false, message: error.message });
    console.error('Upload CV error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload CV' 
    });
  }
};

export const getCurrentCV = async (req, res) => {
  try {
    // Ensure this is a fresher account
    if (req.user.userType !== 'fresher') {
      return res.status(403).json({
        success: false,
        message: "CV management is only available for fresher accounts"
      });
    }

    const user = await userModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    if (!user.hasCV) {
      return res.status(404).json({ 
        success: false, 
        message: 'No CV uploaded yet' 
      });
    }
    res.json({
      success: true,
      data: {
        fileName: user.currentCV.fileName,
        uploadedAt: user.currentCV.uploadedAt,
        fileSize: user.currentCV.fileSize,
        hasText: !!(user.currentCV.text && user.currentCV.text.trim().length > 0),
        textLength: user.currentCV.text ? user.currentCV.text.length : 0
      }
    });
  } catch (error) {
    console.error('Get CV error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve CV' 
    });
  }
};

export const deleteCV = async (req, res) => {
  try {
    // Ensure this is a fresher account
    if (req.user.userType !== 'fresher') {
      return res.status(403).json({
        success: false,
        message: "CV management is only available for fresher accounts"
      });
    }

    const user = await userModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    if (!user.hasCV) {
      return res.status(404).json({ 
        success: false, 
        message: 'No CV to delete' 
      });
    }

    await user.clearCV();

    res.json({
      success: true,
      message: 'CV deleted successfully'
    });
  } catch (error) {
    console.error('Delete CV error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete CV' 
    });
  }
};
