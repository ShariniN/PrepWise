import crypto from 'crypto';
import CVAnalysis from '../../models/CvAnalysis.js';
import userModel from '../../models/User.js';
import { pdfText } from '../../services/pdfText.js';
import {
  analyzeCv, createResumeHash, validateResumeContent, savedAnalysisView, storeAnalysis,
} from './cvAnalysis.service.js';
import { targetRoleOf } from '../institution/institution.service.js';

const isObjectId = (id) => /^[0-9a-fA-F]{24}$/.test(id);

// POST /api/analyze/analyze-resume: the uploaded PDF (field "resume") or, with useProfileCV=true, the profile CV,
// against the student's target role and any job descriptions sent as a JSON string array.
// The scores are computed here and stored here (storeAnalysis); /save only marks a stored analysis as saved.
export const analyzeResume = async (req, res) => {
  try {
    const { jobDescriptions: jobDescriptionsString } = req.body;
    const useProfileCV = req.body.useProfileCV === 'true';

    let jobDescriptions;
    try {
      jobDescriptions = JSON.parse(jobDescriptionsString || '[]');
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid job descriptions format',
        error: parseError.message
      });
    }

    if (!Array.isArray(jobDescriptions)) {
      return res.status(400).json({
        success: false,
        message: 'Job descriptions must be a list of text'
      });
    }
    jobDescriptions = jobDescriptions.filter((jd) => typeof jd === 'string' && jd.trim());

    // Only students reach this (see the route). They are always scored against their target role, so pasted job
    // descriptions are optional.
    const targetRole = await targetRoleOf(req.user);
    if (!targetRole) {
      return res.status(409).json({
        success: false,
        code: 'TARGET_ROLE_REQUIRED',
        message: 'Choose the role you are preparing for before analysing your CV.'
      });
    }

    let resumeText = '';
    let resumeFileName = '';
    let resumeHash = '';

    if (useProfileCV) {
      const user = await userModel.findById(req.user.id);
      if (!user || !user.currentCV || !user.currentCV.text) {
        return res.status(400).json({
          success: false,
          message: 'No CV found in your profile. Please upload a CV first.'
        });
      }

      resumeText = user.currentCV.text;
      resumeFileName = user.currentCV.fileName || 'Profile CV';
      resumeHash = user.currentCV.hash || createResumeHash(resumeText);
    } else {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Resume file is required when not using profile CV'
        });
      }

      try {
        resumeText = (await pdfText(req.file.buffer)).trim();
        if (!resumeText || resumeText.length < 100) {
          return res.status(400).json({
            success: false,
            message: 'Could not extract readable text from PDF. Please ensure the file contains selectable text.'
          });
        }
      } catch (pdfError) {
        console.error('PDF parsing error:', pdfError);
        return res.status(400).json({
          success: false,
          message: 'Failed to parse PDF file. Please ensure it is a valid PDF with readable text.'
        });
      }

      resumeFileName = req.file.originalname;
      resumeHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex').substring(0, 16);
    }

    validateResumeContent(resumeText);

    const { analysis: analysisResults, extractedTechnologies, technologiesUnavailable } = await analyzeCv(resumeText, jobDescriptions, { targetRole });

    const stored = await storeAnalysis({
      user: req.user,
      resumeHash,
      resumeText,
      jobDescriptions,
      results: analysisResults,
      extractedTechnologies,
      usedProfileCV: useProfileCV,
      targetRoleId: targetRole ? targetRole._id : null
    });

    // The model that produced the score, as the scorer reported it. Nothing else names a provider.
    const scoredBy = analysisResults.find((r) => r.scoreBreakdown?.aiAvailable && r.scoreBreakdown.model)?.scoreBreakdown.model;

    res.json({
      success: true,
      message: 'CV analysis complete.',
      analysisId: stored._id,
      resumeHash,
      resumeText: useProfileCV ? 'Profile CV content' : `Uploaded: ${resumeFileName}`,
      extractedTechnologies,
      technologiesUnavailable,
      analysis: analysisResults,
      metadata: {
        useProfileCV,
        resumeFileName,
        analysisDate: new Date().toISOString(),
        jobDescriptionCount: analysisResults.length,
        technologiesFound: extractedTechnologies.length,
        technologiesUnavailable,
        ...(scoredBy ? { model: scoredBy } : {})
      }
    });
  } catch (error) {
    console.error('Analyze resume error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze resume',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// GET /api/analyze/saved and GET /api/user/saved-analyses
export const getSavedAnalysis = async (req, res) => {
  try {
    const analyses = await CVAnalysis.findSavedByUser(req.user.id, 50)
      .populate('userId', 'name email')
      .lean();

    if (analyses.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No saved analyses found',
        data: []
      });
    }

    const transformedAnalyses = analyses.map(savedAnalysisView);
    res.status(200).json({
      success: true,
      message: `Found ${analyses.length} saved analyses`,
      data: transformedAnalyses,
      count: transformedAnalyses.length
    });
  } catch (error) {
    console.error('Error fetching saved analyses:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch saved analyses',
      error: error.message
    });
  }
};

// POST /api/analyze/save { resumeHash | id, shouldSave? }: marks the user's own stored analysis as saved or unsaved.
// Scores and results are never taken from the request: analyze-resume stored what the server computed.
export const saveAnalysis = async (req, res) => {
  try {
    const { resumeHash, id } = req.body || {};
    const shouldSave = req.body?.shouldSave !== false;

    let analysis = null;
    if (id) {
      if (isObjectId(String(id))) analysis = await CVAnalysis.findOne({ _id: id, userId: req.user.id });
    } else if (resumeHash) {
      analysis = await CVAnalysis.findOne({ userId: req.user.id, resumeHash });
    } else {
      return res.status(400).json({ success: false, message: 'Say which analysis to save with resumeHash or id.' });
    }
    if (!analysis) {
      return res.status(404).json({ success: false, message: 'Analyse your CV first.' });
    }

    analysis.isSaved = shouldSave;
    analysis.updatedAt = new Date();
    await analysis.save();

    res.json({
      success: true,
      message: shouldSave ? 'CV analysis saved successfully.' : 'CV analysis unsaved successfully.',
      saved: shouldSave,
      data: {
        id: analysis._id,
        isSaved: analysis.isSaved,
        resumeHash: analysis.resumeHash
      }
    });
  } catch (error) {
    console.error('Error saving analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save analysis',
      error: error.message
    });
  }
};

// DELETE /api/analyze/delete/:id and DELETE /api/user/analysis/:id (own analyses only)
export const deleteAnalysis = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid analysis ID format.',
        received: id
      });
    }

    const analysis = await CVAnalysis.findOneAndDelete({ _id: id, userId: req.user.id });
    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: 'Analysis not found or you do not have permission to delete it'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Analysis deleted successfully',
      deletedId: id,
      deletedAnalysis: {
        id: analysis._id,
        resumeText: analysis.resumeText,
        analysisCount: analysis.results?.length || 0,
        wasSaved: analysis.isSaved,
        technologiesCount: (analysis.extractedTechnologies || []).length,
        deletedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error deleting analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete analysis',
      error: error.message
    });
  }
};
