// CV analysis: technology extraction, the match score (cvAnalysis.scoring.js) and the written advice.
// Every AI call goes through generateWithFallback with the model lists in config/ai.js.
import crypto from 'crypto';
import { CV_MODELS, AI_MODELS } from '../../config/ai.js';
import { generateWithFallback } from '../../services/geminiClient.js';
import { scoreResume } from './cvAnalysis.scoring.js';
import { roleAsJobDescription } from '../../services/targetRoles.js';

export const convertMarkdownToHTML = (text) => text
  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  .replace(/\n\n/g, '<br/><br/>')
  .replace(/\n/g, '<br/>');

export const stripHTMLToText = (html) => html
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .trim();

// Throws (the caller answers 500) when the CV text is too short to analyse.
export const validateResumeContent = (resumeText) => {
  if (resumeText.length < 100) {
    throw new Error('Resume content too short. Please ensure the PDF contains readable text.');
  }
};

// Throws (that job description gets an error result) when it is too short to analyse.
const validateJobDescription = (jobDesc) => {
  if (jobDesc.length < 50) {
    throw new Error('Job description too short. Please provide a detailed job posting.');
  }
};

export const createResumeHash = (resumeText) => crypto.createHash('sha256').update(resumeText.trim()).digest('hex');

// Extract technologies using the AI chain with a structured JSON response.
// Returns { technologies, unavailable }: unavailable is true when the AI failed or its answer could not be read,
// so the Skills page can say extraction failed instead of "no technologies on your CV". Nothing is invented then.
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

    let jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      jsonMatch = content.match(/```(?:json)?\s*(\[[\s\S]*\])\s*```/);
      if (jsonMatch) jsonMatch[0] = jsonMatch[1];
    }

    if (jsonMatch) {
      try {
        const technologies = JSON.parse(jsonMatch[0]);
        const validTechnologies = technologies.filter((tech) =>
          tech.name && tech.category && tech.confidenceLevel >= 1 && tech.confidenceLevel <= 10);
        return { technologies: validTechnologies, unavailable: false };
      } catch (parseError) {
        console.error('JSON parsing error for technologies:', parseError.message);
      }
    }

    console.warn('Could not parse technologies from the AI answer');
    return { technologies: [], unavailable: true };
  } catch (error) {
    console.error('Technology extraction error:', error.message);
    return { technologies: [], unavailable: true };
  }
};

// When the AI is unavailable we return no advice at all, flagged as unavailable
// (never canned advice that looks like a real analysis).
const noRecommendations = () => ({
  isNonTechRole: false,
  recommendationsUnavailable: true,
  strengths: [],
  contentWeaknesses: [],
  structureWeaknesses: [],
  contentRecommendations: [],
  structureRecommendations: []
});

const RECOMMENDATION_FIELDS = ['strengths', 'contentWeaknesses', 'structureWeaknesses', 'contentRecommendations', 'structureRecommendations'];

const truncate = (text, max) => (text.length > max ? text.substring(0, max) + '...' : text);

// Written advice for one job description, or { isNonTechRole: true } when it is not a CS/SE internship.
const getStructuredRecommendations = async (resumeText, jobDesc) => {
  try {
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
${truncate(resumeText, 4500)}

Job Description:
${truncate(jobDesc, 4500)}

Return ONLY the JSON object, no other text or formatting.`;

    const { text: responseText } = await generateWithFallback(prompt, { models: CV_MODELS, temperature: 0.2 });

    if (responseText.includes('NON_CS_ROLE')) {
      return {
        isNonTechRole: true,
        message: 'This position is not a Computer Science or Software Engineering internship. Please provide a CS/Software Engineering job description for accurate analysis.'
      };
    }

    try {
      let cleanText = responseText.replace(/```json\s*|```\s*/g, '').trim();
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (jsonMatch) cleanText = jsonMatch[0];
      const structuredData = JSON.parse(cleanText);

      if (!RECOMMENDATION_FIELDS.every((field) => Array.isArray(structuredData[field]))) {
        console.warn('Invalid structure in recommendations response');
        return noRecommendations();
      }
      return {
        isNonTechRole: false,
        ...Object.fromEntries(RECOMMENDATION_FIELDS.map((field) => [field, structuredData[field]]))
      };
    } catch (parseError) {
      console.error('JSON parsing failed for recommendations:', parseError.message);
      return noRecommendations();
    }
  } catch (err) {
    console.error('Structured recommendations error:', err.message);
    return noRecommendations();
  }
};

const generateScore = (prompt) => generateWithFallback(prompt, { models: CV_MODELS, temperature: 0 });

// Score and written feedback for one job description, run in parallel.
const analyzeResumeMatch = async (resumeText, jobDesc) => {
  const [score, structuredAnalysis] = await Promise.all([
    scoreResume({ resumeText, jobDesc, generate: generateScore }),
    getStructuredRecommendations(resumeText, jobDesc).catch((err) => {
      console.error('Structured analysis failed:', err.message);
      return noRecommendations();
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
    console.error('CV match AI unavailable:', score.aiError);
    return {
      matchPercentage: 0,
      isNonTechRole: false,
      ...noRecommendations(),
      scoreBreakdown,
      error: 'AI analysis is unavailable right now, so no match score was calculated. ' +
        `Keyword check only: ${score.matchedSkills.length} of ${score.requiredSkills.length} skills from the job description appear in the CV.`,
      message: 'AI analysis is unavailable right now, so no match score was calculated.',
      timestamp: new Date().toISOString()
    };
  }

  return {
    similarityScore: score.matchPercentage / 100,
    matchPercentage: score.matchPercentage,
    isNonTechRole: false,
    ...Object.fromEntries(RECOMMENDATION_FIELDS.map((field) => [field, structuredAnalysis[field] || []])),
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

// The whole analysis: technologies once (for the skills self-assessment), then every job description in turn.
// With a target role, the role is scored first (kind 'target_role', written out like a job description and never
// refused for being short); each pasted job description follows as kind 'job_description'.
export const analyzeCv = async (cvText, jobDescriptions, { targetRole = null } = {}) => {
  const analysis = [];
  const { technologies: extractedTechnologies, unavailable: technologiesUnavailable } = await extractTechnologiesFromResume(cvText);

  const jobs = jobDescriptions.map((raw) => ({ raw, kind: 'job_description' }));
  if (targetRole) jobs.unshift({ raw: roleAsJobDescription(targetRole), kind: 'target_role', targetRoleId: String(targetRole._id) });

  for (let i = 0; i < jobs.length; i++) {
    const { raw: rawJobDesc, kind, targetRoleId } = jobs[i];
    const tag = targetRoleId ? { kind, targetRoleId } : { kind };
    try {
      if (kind === 'job_description') validateJobDescription(rawJobDesc);
      const analysisResult = await analyzeResumeMatch(cvText, stripHTMLToText(rawJobDesc));
      analysis.push({ ...buildJobResult(analysisResult, convertMarkdownToHTML(rawJobDesc), extractedTechnologies), ...tag });
    } catch (error) {
      console.error(`Analysis error for JD ${i + 1}:`, error.message);
      analysis.push({
        matchPercentage: 0,
        isNonTechRole: true,
        hasError: true,
        message: 'Analysis failed: ' + error.message,
        jobDescription: convertMarkdownToHTML(rawJobDesc),
        extractedTechnologies: [],
        ...tag
      });
    }
  }

  return { analysis, extractedTechnologies, technologiesUnavailable };
};

const averageMatch = (results) => (results.length > 0
  ? Math.round(results.reduce((sum, r) => sum + (r.matchPercentage || 0), 0) / results.length)
  : 0);

// One entry of the saved-analyses list (lean documents).
export const savedAnalysisView = (analysis) => {
  const results = analysis.results || [];
  const softwareRoles = results.filter((r) => !r.isNonTechRole);
  const avgMatch = averageMatch(softwareRoles);
  const bestMatch = softwareRoles.length > 0
    ? softwareRoles.reduce((best, current) => ((current.matchPercentage || 0) > (best.matchPercentage || 0) ? current : best))
    : { matchPercentage: 0, jobTitle: 'Position', company: 'Company' };

  return {
    _id: analysis._id,
    userId: analysis.userId,
    resumeHash: analysis.resumeHash,
    jobDescriptions: analysis.jobDescriptions || [],
    results,
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
    bestMatch
  };
};

// The stored results as reported back after a save (each value checked and clamped).
export const savedResultsView = (results = []) => results.map((result) => ({
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
}));
