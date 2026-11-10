import crypto from 'crypto';
import CVAnalysis from '../../models/CvAnalysis.js';
import userModel from '../../models/User.js';
import { GEMINI_MODEL } from '../../config/ai.js';
import { pdfText } from '../../services/pdfText.js';
import {
  analyzeCv, createResumeHash, validateResumeContent, savedAnalysisView, savedResultsView,
} from './cvAnalysis.service.js';

const isObjectId = (id) => /^[0-9a-fA-F]{24}$/.test(id);

// POST /api/analyze/analyze-resume: the uploaded PDF (field "resume") or, with useProfileCV=true, the profile CV,
// against the job descriptions sent as a JSON string array. Nothing is stored here (see saveAnalysis).
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

    if (!Array.isArray(jobDescriptions) || jobDescriptions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one job description is required'
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
      resumeHash = user.currentCV.hash || `profile_cv_${user._id}_${Date.now()}`;
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

    const { analysis: analysisResults, extractedTechnologies, technologiesUnavailable } = await analyzeCv(resumeText, jobDescriptions);

    res.json({
      success: true,
      message: 'Resume analysis completed successfully using enhanced Gemini API',
      resumeHash,
      resumeText: useProfileCV ? 'Profile CV content' : `Uploaded: ${resumeFileName}`,
      extractedTechnologies,
      technologiesUnavailable,
      analysis: analysisResults,
      metadata: {
        useProfileCV,
        resumeFileName,
        analysisDate: new Date().toISOString(),
        jobDescriptionCount: jobDescriptions.length,
        technologiesFound: extractedTechnologies.length,
        technologiesUnavailable,
        apiUsed: 'Gemini 2.5 Flash Enhanced',
        realAnalysis: true,
        enhancedParsing: true
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

// POST /api/analyze/save: with only resumeHash it toggles the saved flag, otherwise it stores (or updates,
// same user + hash) a full analysis. analysisMetadata and extractedTechnologies are not in the schema, so they
// only show up in this response when an existing document is updated.
export const saveAnalysis = async (req, res) => {
  try {
    let { resumeText, resumeHash, jobDescriptions, results, shouldSave = true, extractedTechnologies } = req.body;

    if (resumeHash && !resumeText && !jobDescriptions && !results) {
      const analysis = await CVAnalysis.findOne({ userId: req.user.id, resumeHash });
      if (!analysis) {
        return res.status(404).json({
          success: false,
          message: 'CV analysis not found. Please analyze your resume first.',
          resumeHash
        });
      }

      analysis.isSaved = shouldSave;
      analysis.updatedAt = new Date();
      await analysis.save();

      return res.json({
        success: true,
        message: shouldSave ? 'CV analysis saved successfully.' : 'CV analysis unsaved successfully.',
        saved: shouldSave,
        data: {
          id: analysis._id,
          isSaved: analysis.isSaved
        }
      });
    }

    if (!resumeText || !jobDescriptions || !results) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields for saving analysis',
        required: ['resumeText', 'jobDescriptions', 'results'],
        received: {
          resumeText: !!resumeText,
          jobDescriptions: !!jobDescriptions,
          results: !!results,
          resumeHash: !!resumeHash
        }
      });
    }

    if (!resumeHash) resumeHash = createResumeHash(resumeText);

    let analysis = await CVAnalysis.findOne({ userId: req.user.id, resumeHash });

    if (analysis) {
      analysis.jobDescriptions = jobDescriptions;
      analysis.results = results;
      analysis.resumeText = resumeText.substring(0, 15000);
      analysis.isSaved = shouldSave;
      analysis.updatedAt = new Date();
      if (extractedTechnologies && Array.isArray(extractedTechnologies)) {
        analysis.extractedTechnologies = extractedTechnologies;
      }
      if (!analysis.analysisMetadata) analysis.analysisMetadata = {};
      analysis.analysisMetadata.geminiModel = GEMINI_MODEL;
      analysis.analysisMetadata.processingDate = new Date().toISOString();
      analysis.analysisMetadata.enhancedParsing = true;
      await analysis.save();
    } else {
      analysis = new CVAnalysis({
        userId: req.user.id,
        institutionId: req.user.institutionId,
        resumeText: resumeText.substring(0, 15000),
        resumeHash,
        jobDescriptions,
        results,
        extractedTechnologies: extractedTechnologies || [],
        isSaved: shouldSave,
        usedProfileCV: false,
        analysisMetadata: {
          geminiModel: GEMINI_MODEL,
          processingDate: new Date().toISOString(),
          enhancedParsing: true
        }
      });
      await analysis.save();
    }

    const validatedResults = savedResultsView(analysis.results);
    // Unlike the saved-analyses list, this average leaves out results with a 0% match.
    const softwareRoles = validatedResults.filter((r) => !r.isNonTechRole && r.matchPercentage > 0);
    const avgMatchScore = softwareRoles.length > 0
      ? Math.round(softwareRoles.reduce((sum, r) => sum + r.matchPercentage, 0) / softwareRoles.length)
      : 0;
    const technologies = analysis.extractedTechnologies || [];

    res.json({
      success: true,
      message: shouldSave ? 'CV analysis saved successfully.' : 'CV analysis updated successfully.',
      saved: shouldSave,
      data: {
        id: analysis._id,
        isSaved: analysis.isSaved,
        resumeHash: analysis.resumeHash
      },
      analysis: {
        id: analysis._id,
        resumeText: analysis.resumeText ? 'CV content saved' : 'No content',
        isSaved: analysis.isSaved,
        analysisCount: validatedResults.length,
        updatedAt: analysis.updatedAt,
        extractedTechnologies: technologies,
        technologiesCount: technologies.length,
        analysisVersion: analysis.analysisMetadata?.geminiModel || 'legacy'
      },
      stats: {
        totalAnalyses: validatedResults.length,
        softwareRoles: validatedResults.filter((r) => !r.isNonTechRole).length,
        nonTechRoles: validatedResults.filter((r) => r.isNonTechRole).length,
        avgMatchScore,
        technologiesExtracted: technologies.length
      }
    });
  } catch (error) {
    console.error('Error saving analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save analysis',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
        deletedAt: new Date().toISOString(),
        analysisVersion: analysis.analysisMetadata?.geminiModel || 'legacy'
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
