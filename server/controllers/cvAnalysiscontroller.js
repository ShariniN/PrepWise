import pdfParse from "pdf-parse";
import crypto from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import CVAnalysis from "../models/CVAnalysisModel.js";
import userModel from '../models/userModel.js';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash"});

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

// CS Technical Skills for matching
const CS_TECHNICAL_SKILLS = {
  programming_languages: {
    weight: 0.3,
    keywords: ['python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'go', 'rust', 'swift', 'kotlin', 'scala', 'ruby', 'php', 'c', 'r', 'matlab']
  },
  web_technologies: {
    weight: 0.25,
    keywords: ['react', 'angular', 'vue', 'nodejs', 'express', 'django', 'flask', 'spring', 'html', 'css', 'bootstrap', 'tailwind', 'next.js', 'nuxt.js']
  },
  cs_fundamentals: {
    weight: 0.2,
    keywords: ['data structures', 'algorithms', 'algorithm', 'binary tree', 'graph', 'hash table', 'linked list', 'array', 'sorting', 'searching', 'recursion', 'dynamic programming', 'big o', 'complexity analysis']
  },
  dev_tools: {
    weight: 0.15,
    keywords: ['git', 'github', 'gitlab', 'docker', 'kubernetes', 'ci/cd', 'jenkins', 'testing', 'unit testing', 'integration testing', 'agile', 'scrum', 'api', 'rest', 'graphql']
  },
  databases: {
    weight: 0.1,
    keywords: ['mysql', 'postgresql', 'mongodb', 'redis', 'sqlite', 'firebase', 'sql', 'nosql', 'database design', 'orm']
  }
};

const NON_CS_INDICATORS = [
  'medical', 'doctor', 'physician', 'nurse', 'healthcare', 'hospital',
  'law', 'lawyer', 'attorney', 'legal', 'court', 'litigation',
  'teacher', 'educator', 'instructor', 'professor', 'school',
  'retail', 'sales associate', 'cashier', 'store manager',
  'chef', 'cook', 'kitchen', 'restaurant', 'food service',
  'accountant', 'bookkeeper', 'financial analyst', 'audit'
];

// Calculate technical match score
const calculateTechnicalMatch = (resumeText, jobDesc) => {
  const resumeLower = resumeText.toLowerCase();
  const jobDescLower = jobDesc.toLowerCase();
  
  let totalScore = 0;
  let maxPossibleScore = 0;
  
  for (const [category, config] of Object.entries(CS_TECHNICAL_SKILLS)) {
    const requiredSkills = config.keywords.filter(skill => 
      jobDescLower.includes(skill.toLowerCase())
    );
    
    if (requiredSkills.length === 0) continue;
    
    const candidateSkills = config.keywords.filter(skill => 
      resumeLower.includes(skill.toLowerCase())
    );
    
    const matchingSkills = requiredSkills.filter(skill => 
      candidateSkills.includes(skill)
    );
    
    const categoryScore = (matchingSkills.length / requiredSkills.length) * config.weight;
    totalScore += categoryScore;
    maxPossibleScore += config.weight;
  }
  
  return maxPossibleScore > 0 ? (totalScore / maxPossibleScore) : 0;
};

// Enhanced score parsing function
function parseScoreFromResponse(responseText) {
  console.log("Raw Gemini response:", responseText);
  
  // Try to extract just the number from the response
  const patterns = [
    /^(\d*\.?\d+)$/,                    // Just a number: "0.56"
    /score[:\s]*(\d*\.?\d+)/i,          // "Score: 0.56"
    /(\d*\.?\d+)[^\d]*$/,               // Number at the end: "0.56 (good match)"
    /^[^\d]*(\d*\.?\d+)/,               // Number at the start: "Result: 0.56"
    /(\d*\.?\d+)/                       // First number found anywhere
  ];

  for (const pattern of patterns) {
    const match = responseText.trim().match(pattern);
    if (match) {
      const score = parseFloat(match[1]);
      console.log(`Extracted score using pattern ${pattern}: ${score}`);
      if (!isNaN(score) && score >= 0 && score <= 1) {
        return score;
      }
    }
  }

  console.warn("Could not extract valid score from response:", responseText);
  return null;
}

// Get similarity score using Gemini API with enhanced parsing
const getSimilarityScore = async (resumeText, jobDesc) => {
  try {
    // Pre-screening for non-CS roles
    const jobDescLower = jobDesc.toLowerCase();
    
    const hasNonCSIndicators = NON_CS_INDICATORS.some(indicator => 
      jobDescLower.includes(indicator.toLowerCase())
    );

    const hasCSIndicators = Object.values(CS_TECHNICAL_SKILLS)
      .flatMap(category => category.keywords)
      .some(keyword => jobDescLower.includes(keyword.toLowerCase()));

    if (hasNonCSIndicators && !hasCSIndicators) {
      console.log("Non-CS role detected, returning 0 similarity");
      return 0;
    }

    // Get technical match score as baseline
    const technicalMatchScore = calculateTechnicalMatch(resumeText, jobDesc);
    
    const maxLength = 4000;
    const truncatedResume = resumeText.length > maxLength
      ? resumeText.substring(0, maxLength) + "..."
      : resumeText;
    const truncatedJobDesc = jobDesc.length > maxLength
      ? jobDesc.substring(0, maxLength) + "..."
      : jobDesc;

    const prompt = `You are an expert technical recruiter specializing in Computer Science and Software Engineering internships.

CRITICAL: First verify this is a CS/Software Engineering internship role.

CS/SOFTWARE ENGINEERING ROLES include:
- Software Engineer/Developer Intern (Frontend, Backend, Full-Stack)
- Computer Science Intern, Programming Intern
- Web Developer Intern, Mobile Developer Intern
- Data Engineer/Scientist Intern, ML/AI Engineer Intern
- DevOps Engineer Intern, QA/Test Engineer Intern

NON-CS ROLES (return 0.0):
- Medical, Legal, Education, Retail, Food Service, Marketing, Sales, HR

If NOT a CS/Software Engineering role, return exactly: 0.0

For CS/SOFTWARE ENGINEERING roles, evaluate match quality:

EVALUATION CRITERIA:
1. Programming Languages Match (30%)
2. CS Fundamentals (25%) 
3. Relevant Projects (20%)
4. Development Tools/Practices (15%)
5. Educational Foundation (10%)

SCORING GUIDE:
- 0.0-0.2: Minimal CS background
- 0.2-0.4: Some CS knowledge, missing key requirements
- 0.4-0.6: Decent foundation, moderate gaps
- 0.6-0.8: Strong candidate, minor improvements needed
- 0.8-1.0: Excellent match, highly qualified

Resume:
${truncatedResume}

Job Description:
${truncatedJobDesc}

Technical baseline score: ${technicalMatchScore.toFixed(2)}

RESPONSE FORMAT REQUIREMENT:
Return ONLY a single decimal number between 0.0 and 1.0, nothing else.
Example: 0.67
Do NOT include explanations, text, or additional formatting.`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const scoreText = response.text().trim();
    
    // Use enhanced parsing function
    const aiScore = parseScoreFromResponse(scoreText);

    if (aiScore === null) {
      console.warn("Invalid AI score, using technical match score. Response was:", scoreText);
      return Math.max(0, Math.min(1, technicalMatchScore));
    }

    console.log(`✅ Successfully parsed AI score: ${aiScore}`);

    // Blend AI score with technical match for consistency
    const finalScore = (aiScore * 0.7) + (technicalMatchScore * 0.3);
    return Math.max(0, Math.min(1, finalScore));

  } catch (err) {
    console.error("Error in getSimilarityScore:", err.message);
    return calculateTechnicalMatch(resumeText, jobDesc);
  }
};

// Extract technologies using Gemini API with structured JSON response
const extractTechnologiesFromResume = async (resumeText) => {
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

    const result = await model.generateContent(prompt);
    const response = result.response;
    const content = response.text().trim();
    
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
        return validTechnologies;
      } catch (parseError) {
        console.error("JSON parsing error for technologies:", parseError.message);
      }
    }
    
    console.warn("Could not parse technologies, returning fallback");
    return getFallbackTechnologies();
  } catch (error) {
    console.error("Technology extraction error:", error);
    return getFallbackTechnologies();
  }
};

// Fallback technologies
function getFallbackTechnologies() {
  return [
    { name: 'JavaScript', category: 'Programming Languages', confidenceLevel: 5 },
    { name: 'Python', category: 'Programming Languages', confidenceLevel: 5 },
    { name: 'Git', category: 'Development Tools', confidenceLevel: 5 }
  ];
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

    const result = await model.generateContent(prompt);
    const response = result.response;
    const responseText = response.text().trim();

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
const getDefaultCSRecommendations = () => ({
  isNonTechRole: false,
  strengths: [
    "Shows foundational computer science education",
    "Demonstrates programming aptitude and problem-solving mindset",
    "Has academic exposure to CS concepts"
  ],
  contentWeaknesses: [
    "Missing core programming languages (Python, Java, JavaScript)",
    "Lacks demonstrated CS fundamentals (data structures, algorithms)",
    "No visible coding projects with GitHub repositories"
  ],
  structureWeaknesses: [
    "Technical skills section not organized for CS recruiting",
    "Missing essential technical links (GitHub, portfolio)",
    "Resume format not optimized for software engineering roles"
  ],
  contentRecommendations: [
    "Master fundamental programming languages",
    "Build substantial coding projects with measurable impact",
    "Study CS fundamentals and implement common algorithms"
  ],
  structureRecommendations: [
    "Use CS-focused resume template with clear technical sections",
    "Add technical links prominently (GitHub, LinkedIn, portfolio)",
    "Format for technical ATS with CS keywords and clean layout"
  ]
});

// Main analysis function using real Gemini API
const analyzeResumeMatch = async (resumeText, jobDesc) => {
  try {
    console.log("Starting CS internship analysis with Gemini API...");

    const [similarity, structuredAnalysis] = await Promise.all([
      getSimilarityScore(resumeText, jobDesc).catch((err) => {
        console.error("Similarity calculation failed:", err.message);
        return calculateTechnicalMatch(resumeText, jobDesc);
      }),
      getStructuredRecommendations(resumeText, jobDesc).catch((err) => {
        console.error("Structured analysis failed:", err.message);
        return getDefaultCSRecommendations();
      })
    ]);

    console.log("Similarity score:", similarity.toFixed(3));
    console.log("Analysis completed for CS role:", !structuredAnalysis.isNonTechRole);

    if (structuredAnalysis.isNonTechRole) {
      return {
        similarityScore: 0,
        matchPercentage: 0,
        isNonTechRole: true,
        message: structuredAnalysis.message,
        timestamp: new Date().toISOString(),
        warning: "Non-CS role detected"
      };
    }

    const matchPercentage = Math.round(similarity * 100);

    return {
      similarityScore: Number(similarity.toFixed(3)),
      matchPercentage: Math.max(0, Math.min(100, matchPercentage)),
      isNonTechRole: false,
      strengths: structuredAnalysis.strengths || [],
      contentWeaknesses: structuredAnalysis.contentWeaknesses || [],
      structureWeaknesses: structuredAnalysis.structureWeaknesses || [],
      contentRecommendations: structuredAnalysis.contentRecommendations || [],
      structureRecommendations: structuredAnalysis.structureRecommendations || [],
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error("Error in analyzeResumeMatch:", err.message);
    return {
      similarityScore: 0,
      matchPercentage: 0,
      isNonTechRole: false,
      ...getDefaultCSRecommendations(),
      timestamp: new Date().toISOString(),
      error: err.message
    };
  }
};

// Enhanced CV analysis function
async function performCVAnalysis(cvText, jobDescriptions) {
  const analysis = [];
  
  // Extract technologies using Gemini API
  const extractedTechnologies = await extractTechnologiesFromResume(cvText);
  
  for (let i = 0; i < jobDescriptions.length; i++) {
    const rawJobDesc = jobDescriptions[i];
    
    try {
      const validation = validateJobDescription(rawJobDesc);
      
      const jobDescForDisplay = convertMarkdownToHTML(rawJobDesc);
      const jobDescForAnalysis = stripHTMLToText(rawJobDesc);

      // Use real Gemini API analysis
      const analysisResult = await analyzeResumeMatch(cvText, jobDescForAnalysis);
      
      const resultData = {
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
        message: analysisResult.message || null,
        extractedTechnologies: extractedTechnologies
      };

      analysis.push(resultData);
      
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

  return { analysis, extractedTechnologies };
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
    const { analysis: analysisResults, extractedTechnologies } = await performCVAnalysis(resumeText, jobDescriptions);

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
      analysis: analysisResults,
      metadata: {
        useProfileCV,
        resumeFileName,
        analysisDate: new Date().toISOString(),
        jobDescriptionCount: jobDescriptions.length,
        technologiesFound: extractedTechnologies.length,
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

// Additional controller functions
export const analyzeWithProfileCV = async (req, res) => {
  try {
    const { jobDescriptions } = req.body;
    
    if (!jobDescriptions || !Array.isArray(jobDescriptions) || jobDescriptions.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Job descriptions are required' 
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
      return res.status(400).json({ 
        success: false, 
        message: 'No CV uploaded in profile. Please upload your CV first.' 
      });
    }
    
    const cvText = user.getCVText();
    const cvHash = user.getCVHash();
    
    if (!cvText || !cvHash) {
      return res.status(400).json({ 
        success: false, 
        message: 'CV data is corrupted. Please re-upload your CV.' 
      });
    }
    
    const jobDescString = jobDescriptions.join('|||');
    const combinedHash = crypto.createHash('sha256')
      .update(cvHash + jobDescString)
      .digest('hex');
    
    let existingAnalysis = await CVAnalysis.findUserAnalysis(req.user.id, combinedHash);
    
    if (existingAnalysis) {
      return res.json({
        success: true,
        message: 'Analysis retrieved from cache',
        data: {
          analysisId: existingAnalysis._id,
          results: existingAnalysis.results,
          cached: true,
          usedProfileCV: true
        }
      });
    }
    
    const { analysis: analysisResults } = await performCVAnalysis(cvText, jobDescriptions);
    
    const newAnalysis = new CVAnalysis({
      userId: req.user.id,
      resumeText: '',
      resumeHash: combinedHash,
      usedProfileCV: true,
      jobDescriptions,
      results: analysisResults,
      isSaved: true
    });
    
    newAnalysis.setResumeFromProfile(cvText, cvHash);
    await newAnalysis.save();
    
    res.json({
      success: true,
      message: 'CV analysis completed using profile CV',
      data: {
        analysisId: newAnalysis._id,
        results: analysisResults,
        cached: false,
        usedProfileCV: true
      }
    });
    
  } catch (error) {
    console.error('Profile CV analysis error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to analyze CV from profile' 
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
      analysis.analysisMetadata.geminiModel = "gemini-2.5-flash";
      analysis.analysisMetadata.processingDate = new Date().toISOString();
      analysis.analysisMetadata.enhancedParsing = true;
      
      await analysis.save();
      console.log('✅ Updated existing analysis successfully');
      
    } else {
      console.log('🆕 Creating new analysis');
      
      // Create new analysis
      analysis = new CVAnalysis({
        userId: req.user.id,
        resumeText: resumeText.substring(0, 15000),
        resumeHash,
        jobDescriptions,
        results,
        extractedTechnologies: extractedTechnologies || [],
        isSaved: shouldSave,
        usedProfileCV: false, // Default to false unless specified
        analysisMetadata: {
          geminiModel: "gemini-2.5-flash",
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

export const getAllAnalyses = async (req, res) => {
  try {
    console.log('🔍 Getting all analyses for user:', req.user.id);
    
    const { page = 1, limit = 10, includeUnsaved = true } = req.query;
    const skip = (page - 1) * limit;
    
    const filter = { userId: req.user.id };
    if (!includeUnsaved) {
      filter.isSaved = true;
    }

    const [analyses, total] = await Promise.all([
      CVAnalysis.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('-userId -resumeText'),
      CVAnalysis.countDocuments(filter)
    ]);

    console.log(`✅ Found ${analyses.length} analyses (${total} total)`);

    const formattedAnalyses = analyses.map(analysis => {
      const results = analysis.results || [];
      const softwareRoles = results.filter(r => !r.isNonTechRole);
      const avgMatch = softwareRoles.length > 0 
        ? Math.round(softwareRoles.reduce((sum, r) => sum + (r.matchPercentage || 0), 0) / softwareRoles.length)
        : 0;

      return {
        id: analysis._id,
        isSaved: analysis.isSaved,
        matchPercentage: avgMatch,
        totalJobs: results.length,
        softwareJobs: softwareRoles.length,
        nonTechJobs: results.filter(r => r.isNonTechRole).length,
        createdAt: analysis.createdAt,
        updatedAt: analysis.updatedAt,
        extractedTechnologies: (analysis.extractedTechnologies || []).slice(0, 10),
        technologiesCount: (analysis.extractedTechnologies || []).length,
        analysisVersion: analysis.analysisMetadata?.geminiModel || "legacy",
        hasHighMatches: softwareRoles.some(r => (r.matchPercentage || 0) >= 70),
        summary: {
          topMatch: Math.max(...softwareRoles.map(r => r.matchPercentage || 0), 0),
          avgMatch: avgMatch,
          hasErrors: results.some(r => r.hasError),
          isComprehensive: results.some(r => r.analysisQuality?.isComprehensive)
        }
      };
    });

    res.json({
      success: true,
      data: formattedAnalyses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
        hasNext: skip + analyses.length < total,
        hasPrev: page > 1
      },
      metadata: {
        savedCount: analyses.filter(a => a.isSaved).length,
        unsavedCount: analyses.filter(a => !a.isSaved).length,
        geminiAnalyses: analyses.filter(a => a.analysisMetadata?.geminiModel?.includes("gemini")).length,
        totalTechnologies: analyses.reduce((sum, a) => sum + (a.extractedTechnologies || []).length, 0),
        avgOverallMatch: formattedAnalyses.length > 0 
          ? Math.round(formattedAnalyses.reduce((sum, a) => sum + a.summary.avgMatch, 0) / formattedAnalyses.length)
          : 0
      }
    });

  } catch (error) {
    console.error('❌ Error fetching all analyses:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch CV analyses',
      error: error.message
    });
  }
};

export const getAnalysisById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid analysis ID format."
      });
    }

    const analysis = await CVAnalysis.findOne({
      _id: id,
      userId: req.user.id
    }).select('-userId');

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: 'CV analysis not found'
      });
    }

    const results = analysis.results || [];
    const softwareRoles = results.filter(r => !r.isNonTechRole);

    const responseData = {
      success: true,
      data: {
        id: analysis._id,
        resumeText: analysis.resumeText,
        resumeHash: analysis.resumeHash,
        isSaved: analysis.isSaved,
        jobDescriptions: analysis.jobDescriptions || [],
        results: results,
        extractedTechnologies: analysis.extractedTechnologies || [],
        createdAt: analysis.createdAt,
        updatedAt: analysis.updatedAt,
        analysisMetadata: analysis.analysisMetadata || {},
        summary: {
          totalJobs: results.length,
          softwareJobs: softwareRoles.length,
          nonTechJobs: results.filter(r => r.isNonTechRole).length,
          avgMatchScore: softwareRoles.length > 0 
            ? Math.round(softwareRoles.reduce((sum, r) => sum + (r.matchPercentage || 0), 0) / softwareRoles.length)
            : 0,
          topMatchScore: Math.max(...softwareRoles.map(r => r.matchPercentage || 0), 0),
          technologiesCount: (analysis.extractedTechnologies || []).length,
          hasErrors: results.some(r => r.hasError),
          isComprehensive: results.some(r => r.analysisQuality?.isComprehensive),
          analysisVersion: analysis.analysisMetadata?.geminiModel || "legacy"
        }
      }
    };

    res.json(responseData);

  } catch (error) {
    console.error('❌ Error fetching analysis by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch CV analysis',
      error: error.message
    });
  }
};

export const getTechnologyStats = async (req, res) => {
  try {
    console.log('🔍 Getting technology stats for user:', req.user.id);

    const analyses = await CVAnalysis.find({
      userId: req.user.id,
      extractedTechnologies: { $exists: true, $ne: [] }
    }).select('extractedTechnologies analysisMetadata');

    if (analyses.length === 0) {
      return res.json({
        success: true,
        data: {
          totalAnalyses: 0,
          uniqueTechnologies: 0,
          technologies: [],
          categories: [],
          recommendations: []
        }
      });
    }

    const allTechnologies = analyses.flatMap(a => a.extractedTechnologies || []);
    
    const techMap = new Map();
    allTechnologies.forEach(tech => {
      if (techMap.has(tech.name)) {
        const existing = techMap.get(tech.name);
        existing.count++;
        existing.totalConfidence += tech.confidenceLevel || 5;
        existing.avgConfidence = existing.totalConfidence / existing.count;
      } else {
        techMap.set(tech.name, {
          name: tech.name,
          category: tech.category,
          count: 1,
          totalConfidence: tech.confidenceLevel || 5,
          avgConfidence: tech.confidenceLevel || 5
        });
      }
    });

    const technologies = Array.from(techMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    const categories = technologies.reduce((acc, tech) => {
      const category = tech.category || 'Other';
      if (!acc[category]) {
        acc[category] = {
          name: category,
          count: 0,
          technologies: []
        };
      }
      acc[category].count++;
      acc[category].technologies.push(tech);
      return acc;
    }, {});

    const commonTech = ['JavaScript', 'Python', 'Java', 'React', 'Node.js', 'Git', 'SQL', 'HTML', 'CSS'];
    const userTech = new Set(technologies.map(t => t.name.toLowerCase()));
    const recommendations = commonTech
      .filter(tech => !userTech.has(tech.toLowerCase()))
      .map(tech => `Consider learning ${tech} - commonly required for software engineering roles`);

    res.json({
      success: true,
      data: {
        totalAnalyses: analyses.length,
        uniqueTechnologies: technologies.length,
        technologies: technologies,
        categories: Object.values(categories),
        topTechnologies: technologies.slice(0, 10),
        recommendations: recommendations.slice(0, 5),
        stats: {
          avgConfidenceLevel: Math.round(
            technologies.reduce((sum, t) => sum + t.avgConfidence, 0) / Math.max(technologies.length, 1)
          ),
          mostFrequentCategory: Object.values(categories)
            .sort((a, b) => b.count - a.count)[0]?.name || 'None',
          geminiAnalyses: analyses.filter(a => a.analysisMetadata?.geminiModel?.includes('gemini')).length,
          enhancedAnalyses: analyses.filter(a => a.analysisMetadata?.enhancedParsing).length
        }
      }
    });

  } catch (error) {
    console.error('❌ Error getting technology stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch technology statistics',
      error: error.message
    });
  }
};

// Additional helper method for finding user analysis
export const findUserAnalysis = async (userId, resumeHash) => {
  try {
    return await CVAnalysis.findOne({
      userId: userId,
      resumeHash: resumeHash
    });
  } catch (error) {
    console.error('Error finding user analysis:', error);
    return null;
  }
};

// Method to handle saving analysis without full data (for quick save/unsave)
export const toggleSaveStatus = async (req, res) => {
  try {
    const { resumeHash, shouldSave = true } = req.body;
    
    if (!resumeHash) {
      return res.status(400).json({
        success: false,
        message: 'Resume hash is required to toggle save status'
      });
    }

    const analysis = await CVAnalysis.findOne({
      userId: req.user.id,
      resumeHash: resumeHash
    });

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: 'Analysis not found. Please analyze your resume first.'
      });
    }

    analysis.isSaved = shouldSave;
    analysis.updatedAt = new Date();
    await analysis.save();

    res.json({
      success: true,
      message: shouldSave ? 'Analysis saved successfully' : 'Analysis unsaved successfully',
      data: {
        id: analysis._id,
        isSaved: analysis.isSaved,
        resumeHash: analysis.resumeHash
      }
    });

  } catch (error) {
    console.error('Error toggling save status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update save status',
      error: error.message
    });
  }
};

// Export utility functions for external use
export {
  calculateTechnicalMatch,
  getSimilarityScore,
  extractTechnologiesFromResume,
  getStructuredRecommendations,
  analyzeResumeMatch,
  createResumeHash,
  convertMarkdownToHTML,
  stripHTMLToText,
  validateResumeContent,
  validateJobDescription,
  parseScoreFromResponse,
  getFallbackTechnologies
};