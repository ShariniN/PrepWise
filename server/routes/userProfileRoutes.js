import express from 'express';
import bcrypt from 'bcryptjs';
import userModel from '../models/userModel.js';
import CVAnalysis from '../models/CVAnalysisModel.js';
import { TechnologyRating } from '../models/SkillAssessorModel.js';
import skillsAssessmentModel from '../models/SkillAssessorModel.js';
import userAuth from '../middleware/userAuth.js';

const userRouter = express.Router();

// GET /api/user/profile - Get user profile
userRouter.get('/profile', userAuth, async (req, res) => {
  try {
    const user = await userModel.findById(req.user.id).select('-password -verifyOtp -resetOtp');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/user/profile - Update user profile
userRouter.put('/profile', userAuth, async (req, res) => {
  try {
    const { name, phoneNumber, accountType } = req.body;
    
    const user = await userModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Update fields if provided
    if (name) user.name = name;
    if (phoneNumber) user.phoneNumber = phoneNumber;
    if (accountType) user.accountType = accountType;

    await user.save();

    // Return updated user without sensitive information
    const updatedUser = await userModel.findById(req.user.id).select('-password -verifyOtp -resetOtp');
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/user/change-password - Change user password
userRouter.put('/change-password', userAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new passwords are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long' });
    }

    const user = await userModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    user.password = hashedPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/user/saved-analyses - Enhanced version with better formatting
userRouter.get('/saved-analyses', userAuth, async (req, res) => {
  try {
    const savedAnalyses = await CVAnalysis.find({
      userId: req.user.id,
      isSaved: true
    })
    .sort({ updatedAt: -1 })
    .limit(20)
    .select('-userId -resumeText'); // Exclude sensitive data

    // Transform data for user profile display
    const formattedAnalyses = savedAnalyses.map(analysis => {
      const results = analysis.results || [];
      const softwareRoles = results.filter(r => !r.isNonTechRole);
      
      // Calculate average match percentage
      const avgMatch = softwareRoles.length > 0 
        ? Math.round(softwareRoles.reduce((sum, r) => sum + (r.matchPercentage || 0), 0) / softwareRoles.length)
        : 0;

      // Get the best matching job (highest percentage)
      const bestMatch = softwareRoles.reduce((best, current) => 
        (current.matchPercentage || 0) > (best.matchPercentage || 0) ? current : best, 
        { matchPercentage: 0 }
      );

      // Extract job title and company from job description if available
      let jobTitle = 'Software Engineering Position';
      let company = 'Company';
      
      if (analysis.jobDescriptions && analysis.jobDescriptions.length > 0) {
        const firstJobDesc = analysis.jobDescriptions[0];
        // Simple extraction logic - you can enhance this
        const titleMatch = firstJobDesc.match(/(?:position|role|title):\s*([^\n<]+)/i);
        const companyMatch = firstJobDesc.match(/(?:company|organization):\s*([^\n<]+)/i) || 
                           firstJobDesc.match(/<strong>([^<]+)<\/strong>/);
        
        if (titleMatch) jobTitle = titleMatch[1].trim();
        if (companyMatch) company = companyMatch[1].trim();
      }

      return {
        id: analysis._id,
        jobTitle,
        company,
        matchPercentage: avgMatch,
        totalJobs: results.length,
        softwareJobs: softwareRoles.length,
        createdAt: analysis.createdAt,
        updatedAt: analysis.updatedAt,
        strengths: bestMatch.strengths || [],
        recommendations: [
          ...(bestMatch.contentRecommendations || []),
          ...(bestMatch.structureRecommendations || [])
        ].slice(0, 5), // Limit to 5 recommendations
        hasMultipleJobs: results.length > 1
      };
    });

    res.json({
      success: true,
      data: formattedAnalyses,
      count: formattedAnalyses.length
    });

  } catch (error) {
    console.error('Error fetching saved analyses:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch saved CV analyses'
    });
  }
});

// GET /api/user/skills-assessments - Enhanced version with better formatting
userRouter.get('/skills-assessments', userAuth, async (req, res) => {
  try {
    const skillsAssessments = await TechnologyRating.find({
      userId: req.user.id,
      saved: true
    })
    .sort({ updatedAt: -1 })
    .limit(20);

    // Transform data for user profile display
    const formattedAssessments = skillsAssessments.map(assessment => {
      const technologies = assessment.technologies || [];
      const summary = assessment.summary || {};
      
      // Calculate overall score based on confidence levels
      const avgConfidence = summary.averageConfidence || 0;
      const score = Math.round((avgConfidence / 10) * 100); // Convert to 0-100 scale

      // Determine assessment type based on technologies
      let assessmentType = 'Technical Skills Assessment';
      const techCategories = [...new Set(technologies.map(t => t.category))];
      if (techCategories.length > 0) {
        assessmentType = techCategories.join(', ') + ' Assessment';
      }

      // Determine level based on average confidence
      let level = 'Beginner';
      if (avgConfidence >= 8) level = 'Expert';
      else if (avgConfidence >= 6) level = 'Advanced';
      else if (avgConfidence >= 4) level = 'Intermediate';

      return {
        id: assessment._id,
        assessmentType,
        level,
        score,
        totalTechnologies: summary.totalTechnologies || technologies.length,
        averageConfidence: avgConfidence,
        expertCount: summary.expertCount || 0,
        proficientCount: summary.proficientCount || 0,
        learningCount: summary.learningCount || 0,
        completedAt: assessment.updatedAt,
        createdAt: assessment.createdAt,
        topTechnologies: technologies
          .sort((a, b) => b.confidenceLevel - a.confidenceLevel)
          .slice(0, 5)
          .map(t => ({ name: t.name, confidence: t.confidenceLevel })),
        isRecent: assessment.isRecent
      };
    });

    res.json({
      success: true,
      data: formattedAssessments,
      count: formattedAssessments.length
    });

  } catch (error) {
    console.error('Error fetching skills assessments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch skills assessments'
    });
  }
});

// DELETE /api/user/analysis/:id - Delete a saved CV analysis (enhanced)
userRouter.delete('/analysis/:id', userAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await CVAnalysis.findOneAndDelete({
      _id: id,
      userId: req.user.id
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'CV analysis not found'
      });
    }

    res.json({
      success: true,
      message: 'CV analysis deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting CV analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete CV analysis'
    });
  }
});

// DELETE /api/user/assessment/:id - Delete a skills assessment (enhanced)
userRouter.delete('/assessment/:id', userAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await TechnologyRating.findOneAndDelete({
      _id: id,
      userId: req.user.id
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Skills assessment not found'
      });
    }

    res.json({
      success: true,
      message: 'Skills assessment deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting skills assessment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete skills assessment'
    });
  }
});

// GET /api/user/analysis/:id/details - Get detailed CV analysis
userRouter.get('/analysis/:id/details', userAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const analysis = await CVAnalysis.findOne({
      _id: id,
      userId: req.user.id
    });

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: 'CV analysis not found'
      });
    }

    res.json({
      success: true,
      data: {
        id: analysis._id,
        jobDescriptions: analysis.jobDescriptions,
        results: analysis.results,
        createdAt: analysis.createdAt,
        updatedAt: analysis.updatedAt,
        isSaved: analysis.isSaved
      }
    });

  } catch (error) {
    console.error('Error fetching analysis details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analysis details'
    });
  }
});

// GET /api/user/assessment/:id/details - Get detailed skills assessment
userRouter.get('/assessment/:id/details', userAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const assessment = await TechnologyRating.findOne({
      _id: id,
      userId: req.user.id
    });

    if (!assessment) {
      return res.status(404).json({
        success: false,
        message: 'Skills assessment not found'
      });
    }

    res.json({
      success: true,
      data: {
        id: assessment._id,
        technologies: assessment.technologies,
        summary: assessment.summary,
        resumeHash: assessment.resumeHash,
        createdAt: assessment.createdAt,
        updatedAt: assessment.updatedAt,
        saved: assessment.saved
      }
    });

  } catch (error) {
    console.error('Error fetching assessment details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assessment details'
    });
  }
});

// PUT /api/user/upgrade-premium - Upgrade to premium
userRouter.put('/upgrade-premium', userAuth, async (req, res) => {
  try {
    const user = await userModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.accountPlan === 'premium') {
      return res.status(400).json({ success: false, message: 'Already on premium plan' });
    }

    // Here you would typically integrate with payment processing
    // For now, we'll just update the account plan
    user.accountPlan = 'premium';
    await user.save();

    res.json({
      success: true,
      message: 'Account upgraded to Premium successfully',
      data: { accountPlan: user.accountPlan }
    });
  } catch (error) {
    console.error('Upgrade premium error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/user/downgrade-basic - Downgrade to basic
userRouter.put('/downgrade-basic', userAuth, async (req, res) => {
  try {
    const user = await userModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.accountPlan === 'basic') {
      return res.status(400).json({ success: false, message: 'Already on basic plan' });
    }

    user.accountPlan = 'basic';
    await user.save();

    res.json({
      success: true,
      message: 'Account downgraded to Basic',
      data: { accountPlan: user.accountPlan }
    });
  } catch (error) {
    console.error('Downgrade basic error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/user/notifications - Update notification settings
userRouter.put('/notifications', userAuth, async (req, res) => {
  try {
    const { emailUpdates, cvAnalysisAlerts, skillsReminders } = req.body;

    const user = await userModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Add notification preferences to user model if not exists
    if (!user.notificationSettings) {
      user.notificationSettings = {};
    }

    user.notificationSettings.emailUpdates = emailUpdates;
    user.notificationSettings.cvAnalysisAlerts = cvAnalysisAlerts;
    user.notificationSettings.skillsReminders = skillsReminders;

    await user.save();

    res.json({
      success: true,
      message: 'Notification settings updated successfully',
      data: user.notificationSettings
    });
  } catch (error) {
    console.error('Update notifications error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/user/save-analysis/:id - Save/unsave a CV analysis
userRouter.put('/save-analysis/:id', userAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { isSaved } = req.body;

    const analysis = await CVAnalysis.findOne({
      _id: id,
      userId: req.user.id
    });

    if (!analysis) {
      return res.status(404).json({ success: false, message: 'Analysis not found' });
    }

    analysis.isSaved = isSaved;
    await analysis.save();

    res.json({
      success: true,
      message: isSaved ? 'Analysis saved successfully' : 'Analysis unsaved successfully',
      data: { isSaved: analysis.isSaved }
    });
  } catch (error) {
    console.error('Save analysis error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/user/account - Delete user account
userRouter.delete('/account', userAuth, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required' });
    }

    const user = await userModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: 'Invalid password' });
    }

    // Delete all related data
    await CVAnalysis.deleteMany({ userId: req.user.id });
    await TechnologyRating.deleteMany({ userId: req.user.id });
    await skillsAssessmentModel.deleteMany({ userId: req.user.id });
    
    // Delete user account
    await userModel.findByIdAndDelete(req.user.id);

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default userRouter;