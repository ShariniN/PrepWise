import pdfParse from "pdf-parse";
import crypto from 'crypto';
import CVAnalysis from "../models/CvAnalysis.js";
import userModel from '../models/User.js';
import { GEMINI_MODEL, CV_MODELS, AI_MODELS } from '../config/ai.js';
import { generateWithFallback } from '../services/geminiClient.js';
import { scoreResume } from '../services/cvScoring.js';


// Utility functions
function convertMarkdownToHTML(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

function stripHTMLToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function validateResumeContent(resumeText) {
  const text = resumeText.toLowerCase();
  const minLength = 100;
  
  if (resumeText.length < minLength) {
    throw new Error("Resume content too short. Please ensure the PDF contains readable text.");
  }

  const hasBasicSections = [
    'education', 'experience', 'skills', 'projects', 'contact'
  ].some(section => text.includes(section));

  if (!hasBasicSections) {
    console.warn("Resume may be missing standard sections");
  }

  return true;
}

function validateJobDescription(jobDesc) {
  const text = jobDesc.toLowerCase();
  const minLength = 50;
  
  if (jobDesc.length < minLength) {
    throw new Error("Job description too short. Please provide a detailed job posting.");
  }

  const internshipIndicators = [
    'intern', 'internship', 'student', 'entry level', 'junior', 'trainee'
  ];
  
  const softwareIndicators = [
    'software', 'developer', 'engineer', 'programming', 'coding', 'development',
    'python', 'java', 'javascript', 'react', 'node', 'web', 'mobile', 'app'
  ];

  const hasInternshipWords = internshipIndicators.some(word => text.includes(word));
  const hasSoftwareWords = softwareIndicators.some(word => text.includes(word));

  return {
    isInternship: hasInternshipWords,
    isSoftware: hasSoftwareWords,
    isRelevant: hasInternshipWords && hasSoftwareWords
  };
}

// Create hash for resume
function createResumeHash(resumeText) {
  return crypto.createHash('sha256').update(resumeText.trim()).digest('hex');
}


// Extract technologies using the AI chain with a structured JSON response.
// Returns { technologies, unavailable }: unavailable is true when the AI failed or its answer could not be read.
// `generate` can be injected (tests); it defaults to the shared model chain.
export const extractTechnologiesFromResume = async (resumeText, { generate = (p) => generateWithFallback(p, { models: AI_MODELS }) } = {}) => {
  try {
    const prompt = `Analyze this resume and extract ONLY technical skills relevant to Computer Science/Software Engineering.

Focus on:
- Programming languages (Python, Java, JavaScript, C++, etc.)
- Web frameworks (React, Angular, Vue, Django, Spring, etc.)
- Development tools (Git, Docker, Jenkins, etc.)
- Databases (MySQL, MongoDB, PostgreSQL, etc.)
- CS concepts (Data Structures, Algorithms, OOP, etc.)

Resume text:
${resumeText.substring(0, 3000)}

Return ONLY a valid JSON array with this exact format:
[
  {"name": "Python", "category": "Programming Languages", "confidenceLevel": 8},
  {"name": "React", "category": "Web Frameworks", "confidenceLevel": 6}
]

Categories must be one of: "Programming Languages", "Web Frameworks", "Development Tools", "Databases", "CS Concepts", "Other Technical"
Confidence level must be 1-10.
Only include technical skills relevant to software development.
Return ONLY the JSON array, no other text.`;

    const { text: content } = await generate(prompt);
    
    console.log("Technology extraction response:", content.substring(0, 200) + "...");
    
    // Enhanced JSON parsing
    let jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      // Try to find JSON between code blocks
      jsonMatch = content.match(/```(?:json)?\s*(\[[\s\S]*\])\s*```/);
      if (jsonMatch) {
        jsonMatch[0] = jsonMatch[1];
      }
    }
    
    if (jsonMatch) {
      try {
        const technologies = JSON.parse(jsonMatch[0]);
        const validTechnologies = technologies.filter(tech => 
          tech.name && 
          tech.category && 
          tech.confidenceLevel >= 1 && 
          tech.confidenceLevel <= 10
        );
        console.log(`✅ Successfully extracted ${validTechnologies.length} technologies`);
        return { technologies: validTechnologies, unavailable: false };
      } catch (parseError) {
        console.error("JSON parsing error for technologies:", parseError.message);
      }
    }

    console.warn("Could not parse technologies, returning fallback");
    return { technologies: getFallbackTechnologies(), unavailable: true };
  } catch (error) {
    console.error("Technology extraction error:", error.message);
    // Flagged, so the Skills page can say extraction failed instead of "no technologies on your CV".
    return { technologies: getFallbackTechnologies(), unavailable: true };
  }
};

// Fallback technologies
function getFallbackTechnologies() {
  // The AI could not read the CV: return nothing rather than invented technologies.
  return [];
}

// Get structured recommendations using Gemini API with enhanced JSON parsing
const getStructuredRecommendations = async (resumeText, jobDesc) => {
  try {
    const maxLength = 4500;
    const truncatedResume = resumeText.length > maxLength
      ? resumeText.substring(0, maxLength) + "..."
      : resumeText;
    const truncatedJobDesc = jobDesc.length > maxLength
      ? jobDesc.substring(0, maxLength) + "..."
      : jobDesc;

    const prompt = `You are a senior technical recruiter specializing in Computer Science internships.

VERIFICATION: Confirm this is a CS/Software Engineering internship.

If this is NOT a CS/Software Engineering internship, respond exactly: NON_CS_ROLE

For CS/SOFTWARE ENGINEERING internships, provide analysis in this exact JSON format (no additional text):

{
  "strengths": [
    "Specific CS/programming strengths from their background",
    "Technical projects or coursework demonstrating coding ability", 
    "Programming languages matching job requirements",
    "Relevant CS education or technical experience"
  ],
  "contentWeaknesses": [
    "Missing specific programming languages from job posting",
    "Lack of CS fundamentals (data structures, algorithms)",
    "Missing technical projects with quantified impact",
    "Insufficient software development methodology knowledge"
  ],
  "structureWeaknesses": [
    "Technical skills section not optimized for CS recruiting",
    "Missing GitHub portfolio and technical project links", 
    "Resume not formatted for technical ATS systems",
    "Project descriptions lack technical depth"
  ],
  "contentRecommendations": [
    "Learn specific technologies from job posting",
    "Build 2-3 substantial coding projects with GitHub repos",
    "Add CS coursework: Data Structures, Algorithms, Software Engineering",
    "Include quantified technical achievements with metrics"
  ],
  "structureRecommendations": [
    "Create technical resume sections with clear categorization",
    "Add essential links: GitHub profile, LinkedIn, portfolio",
    "Format for technical recruiting: ATS-friendly, CS keywords",
    "Structure project descriptions with tech stack and outcomes"
  ]
}

Resume:
${truncatedResume}

Job Description:
${truncatedJobDesc}

Return ONLY the JSON object, no other text or formatting.`;

    const { text: responseText } = await generateWithFallback(prompt, { models: CV_MODELS, temperature: 0.2 });

    console.log("Recommendations response preview:", responseText.substring(0, 100) + "...");

    if (responseText === "NON_CS_ROLE" || responseText.includes("NON_CS_ROLE")) {
      return {
        isNonTechRole: true,
        message: "This position is not a Computer Science or Software Engineering internship. Please provide a CS/Software Engineering job description for accurate analysis."
      };
    }

    try {
      // Enhanced JSON parsing
      let cleanText = responseText.replace(/```json\s*|```\s*/g, '').trim();
      
      // Try to find JSON object
      let jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanText = jsonMatch[0];
      }
      
      const structuredData = JSON.parse(cleanText);
      
      // Validate structure
      const requiredFields = ['strengths', 'contentWeaknesses', 'structureWeaknesses', 'contentRecommendations', 'structureRecommendations'];
      const isValid = requiredFields.every(field => Array.isArray(structuredData[field]));
      
      if (!isValid) {
        console.warn("Invalid structure in recommendations response, using defaults");
        return getDefaultCSRecommendations();
      }
      
      console.log("✅ Successfully parsed structured recommendations");
      
      return {
        isNonTechRole: false,
        strengths: structuredData.strengths,
        contentWeaknesses: structuredData.contentWeaknesses,
        structureWeaknesses: structuredData.structureWeaknesses,
        contentRecommendations: structuredData.contentRecommendations,
        structureRecommendations: structuredData.structureRecommendations
      };
    } catch (parseError) {
      console.error("JSON parsing failed for recommendations:", parseError.message);
      console.log("Raw response was:", responseText);
      return getDefaultCSRecommendations();
    }

  } catch (err) {
    console.error("Structured recommendations error:", err.message);
    return getDefaultCSRecommendations();
  }
};

// Default recommendations fallback
// When the AI is unavailable we return no advice at all, flagged as unavailable.
// (This used to return canned advice that looked like a real analysis, e.g. "missing Python" for a Python CV.)
const getDefaultCSRecommendations = () => ({
  isNonTechRole: false,
  recommendationsUnavailable: true,
  strengths: [],
  contentWeaknesses: [],
  structureWeaknesses: [],
  contentRecommendations: [],
  structureRecommendations: []
});

const generateScore = (prompt) => generateWithFallback(prompt, { models: CV_MODELS, temperature: 0 });

// Main analysis: score (services/cvScoring.js) and written feedback run in parallel.
const analyzeResumeMatch = async (resumeText, jobDesc) => {
  const [score, structuredAnalysis] = await Promise.all([
    scoreResume({ resumeText, jobDesc, generate: generateScore }),
    getStructuredRecommendations(resumeText, jobDesc).catch((err) => {
      console.error("Structured analysis failed:", err.message);
      return getDefaultCSRecommendations();
    })
  ]);

  const scoreBreakdown = {
    aiAvailable: score.aiAvailable,
    aiScore: score.aiScore,
    aiWeight: 0.7,
    keywordScore: score.keywordScore,
    keywordWeight: 0.3,
    requiredSkills: score.requiredSkills,
    matchedSkills: score.matchedSkills,
    missingSkills: score.missingSkills,
    aiError: score.aiError,
    model: score.model
  };

  if (structuredAnalysis.isNonTechRole) {
    return {
      matchPercentage: 0,
      isNonTechRole: true,
      message: structuredAnalysis.message,
      scoreBreakdown,
      timestamp: new Date().toISOString()
    };
  }

  if (!score.aiAvailable) {
    console.error("CV match AI unavailable:", score.aiError);
    return {
      matchPercentage: 0,
      isNonTechRole: false,
      ...getDefaultCSRecommendations(),
      scoreBreakdown,
      error: "AI analysis is unavailable right now, so no match score was calculated. " +
        `Keyword check only: ${score.matchedSkills.length} of ${score.requiredSkills.length} skills from the job description appear in the CV.`,
      message: "AI analysis is unavailable right now, so no match score was calculated.",
      timestamp: new Date().toISOString()
    };
  }

  return {
    similarityScore: score.matchPercentage / 100,
    matchPercentage: score.matchPercentage,
    isNonTechRole: false,
    strengths: structuredAnalysis.strengths || [],
    contentWeaknesses: structuredAnalysis.contentWeaknesses || [],
    structureWeaknesses: structuredAnalysis.structureWeaknesses || [],
    contentRecommendations: structuredAnalysis.contentRecommendations || [],
    structureRecommendations: structuredAnalysis.structureRecommendations || [],
    recommendationsUnavailable: !!structuredAnalysis.recommendationsUnavailable,
    scoreBreakdown,
    timestamp: new Date().toISOString()
  };
};

// One result per job description. recommendationsUnavailable is kept so the client can say
// "AI advice is unavailable right now" instead of showing empty advice tabs.
export const buildJobResult = (analysisResult, jobDescForDisplay, extractedTechnologies) => ({
  matchPercentage: analysisResult.matchPercentage,
  jobDescription: jobDescForDisplay,
  hasError: !!analysisResult.error,
  isNonTechRole: analysisResult.isNonTechRole || false,
  rawSimilarity: analysisResult.similarityScore,
  timestamp: analysisResult.timestamp,
  strengths: analysisResult.strengths || [],
  contentWeaknesses: analysisResult.contentWeaknesses || [],
  structureWeaknesses: analysisResult.structureWeaknesses || [],
  contentRecommendations: analysisResult.contentRecommendations || [],
  structureRecommendations: analysisResult.structureRecommendations || [],
  recommendationsUnavailable: !!analysisResult.recommendationsUnavailable,
  message: analysisResult.message || null,
  scoreBreakdown: analysisResult.scoreBreakdown || null,
  extractedTechnologies
});

// Enhanced CV analysis function
async function performCVAnalysis(cvText, jobDescriptions) {
  const analysis = [];
  
  // Technologies for the skills self-assessment; unavailable = the AI could not extract them right now
  const { technologies: extractedTechnologies, unavailable: technologiesUnavailable } = await extractTechnologiesFromResume(cvText);
  
  for (let i = 0; i < jobDescriptions.length; i++) {
    const rawJobDesc = jobDescriptions[i];
    
    try {
      const validation = validateJobDescription(rawJobDesc);
      
      const jobDescForDisplay = convertMarkdownToHTML(rawJobDesc);
      const jobDescForAnalysis = stripHTMLToText(rawJobDesc);

      // Use real Gemini API analysis
      const analysisResult = await analyzeResumeMatch(cvText, jobDescForAnalysis);
      
      analysis.push(buildJobResult(analysisResult, jobDescForDisplay, extractedTechnologies));
      
    } catch (error) {
      console.error(`Analysis error for JD ${i + 1}:`, error.message);
      analysis.push({
        matchPercentage: 0,
        isNonTechRole: true,
        hasError: true,
        message: "Analysis failed: " + error.message,
        jobDescription: convertMarkdownToHTML(rawJobDesc),
        extractedTechnologies: []
      });
    }
  }

  return { analysis, extractedTechnologies, technologiesUnavailable };
}

// Main controller function - analyzeResume
export const analyzeResume = async (req, res) => {
  try {
    console.log('=== ANALYZE RESUME WITH ENHANCED GEMINI API ===');
    console.log('User ID:', req.user?.id);
    console.log('Use Profile CV:', req.body.useProfileCV);

    const { jobDescriptions: jobDescriptionsString } = req.body;
    const useProfileCV = req.body.useProfileCV === 'true';

    // Parse job descriptions
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
      console.log('📄 Using profile CV');
      
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
      console.log('📁 Using uploaded file');
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Resume file is required when not using profile CV'
        });
      }

      try {
        // Parse PDF file
        const pdfData = await pdfParse(req.file.buffer);
        resumeText = pdfData.text.trim();
        
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
      resumeHash = crypto.createHash('sha256')
        .update(req.file.buffer)
        .digest('hex')
        .substring(0, 16);
    }

    // Validate resume content
    validateResumeContent(resumeText);

    console.log('🔍 Starting enhanced Gemini API analysis...');
    
    // Perform actual analysis using Gemini API
    const { analysis: analysisResults, extractedTechnologies, technologiesUnavailable } = await performCVAnalysis(resumeText, jobDescriptions);

    console.log('✅ Enhanced Gemini analysis completed');
    console.log('Results summary:', analysisResults.map((r, i) => `Job ${i + 1}: ${r.matchPercentage}%`));
    console.log('Technologies extracted:', extractedTechnologies.length);

    // Return real analysis results
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
    console.error('❌ Analyze resume error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze resume',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getSavedAnalysis = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('🔍 Fetching saved analyses for user:', userId);

    const analyses = await CVAnalysis.findSavedByUser(userId, 50)
      .populate('userId', 'name email')
      .lean();

    console.log(`📊 Found ${analyses.length} saved analyses`);

    if (analyses.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No saved analyses found',
        data: []
      });
    }

    const transformedAnalyses = analyses.map(analysis => {
      console.log(`📊 Processing analysis ID: ${analysis._id}, Results: ${analysis.results?.length || 0}`);

      const results = analysis.results || [];
      const softwareRoles = results.filter(r => !r.isNonTechRole);

      const avgMatch = softwareRoles.length > 0 
        ? Math.round(softwareRoles.reduce((sum, r) => sum + (r.matchPercentage || 0), 0) / softwareRoles.length)
        : 0;

      const bestMatch = softwareRoles.length > 0 
        ? softwareRoles.reduce((best, current) => 
            (current.matchPercentage || 0) > (best.matchPercentage || 0) ? current : best
          ) 
        : { matchPercentage: 0, jobTitle: 'Position', company: 'Company' };

      return {
        _id: analysis._id,
        userId: analysis.userId,
        resumeHash: analysis.resumeHash,
        jobDescriptions: analysis.jobDescriptions || [],
        results: results,
        isSaved: analysis.isSaved,
        createdAt: analysis.createdAt,
        updatedAt: analysis.updatedAt,
        
        jobTitle: bestMatch.jobTitle || 'Software Engineering Position',
        company: bestMatch.company || 'Company',
        matchPercentage: avgMatch,
        totalJobs: results.length,
        softwareJobs: softwareRoles.length,
        
        strengths: bestMatch.strengths || [],
        contentRecommendations: bestMatch.contentRecommendations || [],
        structureRecommendations: bestMatch.structureRecommendations || [],
        recommendations: [
          ...(bestMatch.contentRecommendations || []),
          ...(bestMatch.structureRecommendations || [])
        ],
        
        isRecent: analysis.isRecent,
        averageMatch: avgMatch,
        bestMatch: bestMatch
      };
    });

    console.log(`📊 Transformed ${transformedAnalyses.length} analyses successfully`);

    res.status(200).json({
      success: true,
      message: `Found ${analyses.length} saved analyses`,
      data: transformedAnalyses,
      count: transformedAnalyses.length
    });

  } catch (error) {
    console.error('❌ Error fetching saved analyses:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch saved analyses',
      error: error.message
    });
  }
};

export const saveAnalysis = async (req, res) => {
  try {
    console.log('🔍 Saving/Updating CV analysis...');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    let { resumeText, resumeHash, jobDescriptions, results, shouldSave = true, extractedTechnologies } = req.body;
    
    // Handle case where we're just toggling save status with resumeHash only
    if (resumeHash && !resumeText && !jobDescriptions && !results) {
      console.log('🔄 Toggling save status for existing analysis with hash:', resumeHash);
      
      let analysis = await CVAnalysis.findOne({
        userId: req.user.id,
        resumeHash: resumeHash
      });

      if (!analysis) {
        return res.status(404).json({ 
          success: false,
          message: "CV analysis not found. Please analyze your resume first.",
          resumeHash: resumeHash
        });
      }

      analysis.isSaved = shouldSave;
      analysis.updatedAt = new Date();
      await analysis.save();
      
      console.log(`✅ ${shouldSave ? 'Saved' : 'Unsaved'} existing analysis ${analysis._id}`);

      return res.json({
        success: true,
        message: shouldSave 
          ? "CV analysis saved successfully." 
          : "CV analysis unsaved successfully.",
        saved: shouldSave,
        data: {
          id: analysis._id,
          isSaved: analysis.isSaved
        }
      });
    }

    // Handle full analysis save (new analysis or update with data)
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
    
    // Generate resume hash if not provided
    if (!resumeHash) {
      resumeHash = createResumeHash(resumeText);
    }

    console.log('🔍 Looking for existing analysis with hash:', resumeHash);

    let analysis = await CVAnalysis.findOne({
      userId: req.user.id,
      resumeHash: resumeHash
    });

    if (analysis) {
      console.log('📝 Updating existing analysis:', analysis._id);
      
      // Update existing analysis
      analysis.jobDescriptions = jobDescriptions;
      analysis.results = results;
      analysis.resumeText = resumeText.substring(0, 15000);
      analysis.isSaved = shouldSave;
      analysis.updatedAt = new Date();
      
      if (extractedTechnologies && Array.isArray(extractedTechnologies)) {
        analysis.extractedTechnologies = extractedTechnologies;
      }
      
      // Update metadata
      if (!analysis.analysisMetadata) {
        analysis.analysisMetadata = {};
      }
      analysis.analysisMetadata.geminiModel = GEMINI_MODEL;
      analysis.analysisMetadata.processingDate = new Date().toISOString();
      analysis.analysisMetadata.enhancedParsing = true;
      
      await analysis.save();
      console.log('✅ Updated existing analysis successfully');
      
    } else {
      console.log('🆕 Creating new analysis');
      
      // Create new analysis
      analysis = new CVAnalysis({
        userId: req.user.id,
        institutionId: req.user.institutionId,
        resumeText: resumeText.substring(0, 15000),
        resumeHash,
        jobDescriptions,
        results,
        extractedTechnologies: extractedTechnologies || [],
        isSaved: shouldSave,
        usedProfileCV: false, // Default to false unless specified
        analysisMetadata: {
          geminiModel: GEMINI_MODEL,
          processingDate: new Date().toISOString(),
          enhancedParsing: true
        }
      });
      
      await analysis.save();
      console.log('✅ New analysis created and saved successfully');
    }

    // Validate and format results
    const validatedResults = (analysis.results || []).map((result, index) => {
      return {
        matchPercentage: typeof result.matchPercentage === 'number' ? Math.max(0, Math.min(100, result.matchPercentage)) : 0,
        scoreBreakdown: result.scoreBreakdown || null,
        isNonTechRole: typeof result.isNonTechRole === 'boolean' ? result.isNonTechRole : false,
        strengths: Array.isArray(result.strengths) ? result.strengths : [],
        contentWeaknesses: Array.isArray(result.contentWeaknesses) ? result.contentWeaknesses : [],
        structureWeaknesses: Array.isArray(result.structureWeaknesses) ? result.structureWeaknesses : [],
        contentRecommendations: Array.isArray(result.contentRecommendations) ? result.contentRecommendations : [],
        structureRecommendations: Array.isArray(result.structureRecommendations) ? result.structureRecommendations : [],
        message: typeof result.message === 'string' ? result.message : null,
        hasError: typeof result.hasError === 'boolean' ? result.hasError : false,
        timestamp: result.timestamp || new Date().toISOString(),
        analysisQuality: result.analysisQuality || null
      };
    });

    const softwareRoles = validatedResults.filter(r => !r.isNonTechRole && r.matchPercentage > 0);
    const avgMatchScore = softwareRoles.length > 0 
      ? Math.round(softwareRoles.reduce((sum, r) => sum + r.matchPercentage, 0) / softwareRoles.length)
      : 0;

    res.json({
      success: true,
      message: shouldSave 
        ? "CV analysis saved successfully." 
        : "CV analysis updated successfully.",
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
        extractedTechnologies: analysis.extractedTechnologies || [],
        technologiesCount: (analysis.extractedTechnologies || []).length,
        analysisVersion: analysis.analysisMetadata?.geminiModel || "legacy"
      },
      stats: {
        totalAnalyses: validatedResults.length,
        softwareRoles: validatedResults.filter(r => !r.isNonTechRole).length,
        nonTechRoles: validatedResults.filter(r => r.isNonTechRole).length,
        avgMatchScore: avgMatchScore,
        technologiesExtracted: (analysis.extractedTechnologies || []).length
      }
    });

  } catch (error) {
    console.error('❌ Error saving analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save analysis',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const deleteAnalysis = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    console.log(`🗑️ Deleting analysis: ${id} for user: ${userId}`);

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid analysis ID format.",
        received: id
      });
    }

    const analysis = await CVAnalysis.findOneAndDelete({
      _id: id,
      userId: userId
    });

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: 'Analysis not found or you do not have permission to delete it'
      });
    }

    console.log(`✅ Successfully deleted analysis: ${id}`);

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
        analysisVersion: analysis.analysisMetadata?.geminiModel || "legacy"
      }
    });

  } catch (error) {
    console.error('❌ Error deleting analysis:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to delete analysis',
      error: error.message
    });
  }
};
