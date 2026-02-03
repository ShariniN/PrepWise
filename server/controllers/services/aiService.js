import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const questionCache = new Map();
const CACHE_TTL = 3600000; 

let requestCount = 0;
let lastResetTime = Date.now();
const MAX_REQUESTS_PER_MINUTE = 10; 

setInterval(() => {
  requestCount = 0;
  lastResetTime = Date.now();
  console.log('🔄 Rate limit counter reset');
}, 60000);


const checkRateLimit = async () => {
  if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
    const waitTime = 60000 - (Date.now() - lastResetTime);
    if (waitTime > 0) {
      console.log(`⏳ Rate limit reached, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      requestCount = 0;
      lastResetTime = Date.now();
    }
  }
  requestCount++;
};

const getModel = (config = {}) => {
  return genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash-lite",
    generationConfig: { 
      temperature: 0.2,
      maxOutputTokens: 4000,
      topP: 0.7,
      topK: 30,
      candidateCount: 1,
      ...config
    }
  });
};

const getCacheKey = (resumeText, jobDescription) => {
  const key = `${resumeText.substring(0, 200)}_${jobDescription.substring(0, 200)}`;
  return key.replace(/\s+/g, '').toLowerCase();
};


export const parseAIResponse = (rawText) => {
  console.log('🔧 Parsing AI response...');
  console.log('📏 Raw text length:', rawText.length);
  
  let cleanedText = rawText
    .trim()
    .replace(/```json\s*/gi, '')
    .replace(/```javascript\s*/gi, '')
    .replace(/```\s*/g, '')
    .replace(/^```/gm, '')
    .replace(/```$/gm, '')
    .replace(/^\s*[\r\n]/gm, '');

  console.log('🧹 After basic cleanup, length:', cleanedText.length);

  const arrayStart = cleanedText.indexOf('[');
  const arrayEnd = cleanedText.lastIndexOf(']');
  
  console.log('🔍 Array bounds:', { arrayStart, arrayEnd });
  
  if (arrayStart === -1 || arrayEnd === -1) {
    console.error('❌ No JSON array found in response');
    console.error('Response preview:', cleanedText.substring(0, 500));
    throw new Error('No JSON array found in response');
  }

  let jsonText = cleanedText.substring(arrayStart, arrayEnd + 1)
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']')
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/"\s*:\s*"/g, '": "')
    .replace(/",\s*"/g, '", "');

  console.log('📦 JSON text extracted, length:', jsonText.length);

  try {
    const parsed = JSON.parse(jsonText);
    console.log('✅ JSON parsed successfully, items:', parsed.length);
    return parsed;
  } catch (parseError) {
    console.error('❌ Initial JSON parse failed:', parseError.message);
    console.log('🔧 Attempting to fix JSON...');
    
    let fixedJson = jsonText
      .replace(/"([^"]*)"([^"]*)"([^"]*)":/g, '"$1\\"$2\\"$3":');
    
    if (!fixedJson.trim().endsWith(']')) {
      const lastCommaIndex = fixedJson.lastIndexOf(',');
      if (lastCommaIndex > -1) {
        fixedJson = fixedJson.substring(0, lastCommaIndex) + ']';
      }
    }
    
    try {
      const parsed = JSON.parse(fixedJson);
      console.log('✅ Fixed JSON parsed successfully, items:', parsed.length);
      return parsed;
    } catch (fixError) {
      console.error('❌ Failed to fix JSON:', fixError.message);
      console.error('Problematic JSON (first 500 chars):', jsonText.substring(0, 500));
      throw new Error('Could not parse AI response as JSON: ' + fixError.message);
    }
  }
};

// Generate personalized interview questions WITH CACHING
export const generateInterviewQuestions = async (resumeText, jobDescription) => {
  console.log('🤖 Starting question generation with AI');
  
  // Check cache first
  const cacheKey = getCacheKey(resumeText, jobDescription);
  const cached = questionCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('✅ Returning cached questions');
    return cached.questions;
  }
  
  // Check rate limit
  await checkRateLimit();
  
  const model = getModel();
  
  const prompt = `You are creating personalized interview questions for a software engineering intern position.

CANDIDATE'S CV (first 2000 chars):
${resumeText.substring(0, 2000)}

JOB REQUIREMENTS (first 1000 chars):
${jobDescription.substring(0, 1000)}

REQUIREMENTS:
- Generate exactly 10 questions
- 3 behavioral, 4 technical, 3 coding questions
- Reference specific CV content where possible
- Use only supported languages: javascript, python, java, cpp, c
- Keep questions concise and clear

CRITICAL: Return ONLY a valid JSON array with this EXACT structure (do NOT add any text before or after):

[
  {
    "questionId": "q1",
    "type": "behavioral",
    "question": "Tell me about a challenging project you worked on. What was the situation and how did you handle it?",
    "category": "project_experience",
    "difficulty": "easy",
    "expectedDuration": 180,
    "followUpQuestions": [],
    "starterCode": null,
    "language": null
  },
  {
    "questionId": "q2",
    "type": "technical",
    "question": "Explain the difference between frontend and backend development.",
    "category": "web_basics",
    "difficulty": "easy",
    "expectedDuration": 150,
    "followUpQuestions": [],
    "starterCode": null,
    "language": null
  },
  {
    "questionId": "q3",
    "type": "coding",
    "question": "Write a function that finds the largest number in an array.",
    "category": "arrays",
    "difficulty": "easy",
    "expectedDuration": 300,
    "followUpQuestions": [],
    "starterCode": null,
    "language": "javascript"
  }
]

Generate all 10 questions following this exact format.`;

  console.log('📤 Sending request to Gemini API');
  
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawText = response.text();
    
    console.log('📥 Raw response length:', rawText.length);
    console.log('🔍 First 200 chars:', rawText.substring(0, 200));
    
    const parsedQuestions = parseAIResponse(rawText);
    console.log('✅ Parsed questions count:', parsedQuestions.length);
    
    // Cache the result
    questionCache.set(cacheKey, {
      questions: parsedQuestions,
      timestamp: Date.now()
    });
    console.log('💾 Questions cached');
    
    return parsedQuestions;
  } catch (error) {
    if (error.message.includes('429') || error.message.includes('quota')) {
      console.error('⚠️ API Quota exceeded - will use fallback questions');
      throw error;
    }
    throw error;
  }
};

export const generateAIFeedback = async (question, questionType, responseText, code, language, executionResults) => {
  await checkRateLimit(); 
  const model = getModel({ temperature: 0.1, maxOutputTokens: 1500, topP: 0.6 });

  const truncate = (text, max) => text?.length > max ? text.substring(0, max) + "..." : text;

  const prompt = `You are evaluating an INTERN candidate's interview response. Provide CONSISTENT scoring where the numerical score EXACTLY matches the response type.

QUESTION: "${truncate(question, 800)}"
QUESTION TYPE: ${questionType}
CANDIDATE RESPONSE: "${truncate(responseText, 1500)}"
${code ? `CODE SUBMITTED: "${truncate(code, 1500)}"` : ''}
${language ? `PROGRAMMING LANGUAGE: ${language}` : ''}
${executionResults ? `CODE EXECUTION RESULT: "${executionResults.output || 'No output'}"${executionResults.error ? ' | ERROR: ' + executionResults.error : ''}` : ''}

STRICT SCORING GUIDELINES (MUST BE CONSISTENT):
- 85-100 points = "perfectly-relevant" (Exceptional intern performance)
- 65-84 points = "mostly-relevant" (Good intern performance) 
- 45-64 points = "partially-relevant" (Acceptable intern performance)
- 25-44 points = "mostly-irrelevant" (Below expectations)
- 0-24 points = "completely-off-topic" (Inadequate response)

Return ONLY this JSON format:
{
  "score": 67,
  "responseType": "mostly-relevant",
  "strengths": ["Specific strength observed"],
  "improvements": ["Specific improvement needed"],
  "detailedAnalysis": "Response shows [specific analysis].",
  "overallAssessment": "Assessment that matches the score level",
  "questionRelevance": 7,
  "correctness": 7,
  "communicationClarity": 7,
  "technicalAccuracy": 6
}`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const rawText = response.text();

  let cleanText = rawText.trim().replace(/```json\s*|```\s*/g, '');
  const jsonStart = cleanText.indexOf('{');
  const jsonEnd = cleanText.lastIndexOf('}');
  
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('No valid JSON found in response');
  }

  const aiAnalysis = JSON.parse(cleanText.substring(jsonStart, jsonEnd + 1));
  
  const score = Math.max(0, Math.min(100, aiAnalysis.score || 50));
  const baseRating = Math.max(1, Math.min(10, Math.floor(score / 10)));

  return {
    score,
    questionRelevance: Math.max(1, Math.min(10, aiAnalysis.questionRelevance || baseRating)),
    responseType: mapScoreToResponseType(score),
    correctness: Math.max(1, Math.min(10, aiAnalysis.correctness || baseRating)),
    syntax: questionType === 'coding' ? baseRating : Math.floor(score / 15),
    languageBestPractices: baseRating,
    efficiency: questionType === 'coding' ? Math.floor(score / 12) : Math.floor(score / 15),
    structureAndReadability: Math.max(1, Math.min(10, aiAnalysis.communicationClarity || baseRating)),
    edgeCaseHandling: questionType === 'coding' ? Math.floor(score / 15) : Math.floor(score / 20),
    strengths: Array.isArray(aiAnalysis.strengths) ? aiAnalysis.strengths.slice(0, 4) : [],
    improvements: Array.isArray(aiAnalysis.improvements) ? aiAnalysis.improvements.slice(0, 5) : [],
    detailedAnalysis: aiAnalysis.detailedAnalysis || '',
    overallAssessment: aiAnalysis.overallAssessment || '',
    communicationClarity: Math.max(1, Math.min(10, aiAnalysis.communicationClarity || baseRating)),
    technicalAccuracy: Math.max(1, Math.min(10, aiAnalysis.technicalAccuracy || baseRating))
  };
};

// Generate overall interview feedback WITH RATE LIMITING
export const generateOverallInterviewFeedback = async (responses) => {
  const answeredResponses = responses.filter(r => !r.skipped && r.feedback);
  const skippedCount = responses.filter(r => r.skipped).length;
  
  if (answeredResponses.length === 0) {
    return createAllSkippedFeedback(responses.length);
  }

  await checkRateLimit(); // Rate limit check

  const model = getModel({ temperature: 0.3, maxOutputTokens: 800 });
  const scores = answeredResponses.map(r => r.feedback?.score || 0);
  const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

  const prompt = `You are a senior hiring manager conducting final assessment of an intern interview.

INTERVIEW SUMMARY:
- Total Questions: ${responses.length}
- Questions Answered: ${answeredResponses.length}
- Questions Skipped: ${skippedCount}
- Average Score: ${averageScore.toFixed(1)}/100

Return ONLY this JSON:
{
  "overallScore": 45,
  "readinessLevel": "Needs Development Before Ready",
  "keyStrengths": ["Specific strengths"],
  "majorImprovements": ["Critical improvements"],
  "recommendations": ["Actionable steps"],
  "generalFeedback": "Honest assessment",
  "hiringRecommendation": "Clear recommendation"
}`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const aiAnalysis = JSON.parse(response.text().trim().replace(/```json\s*|```\s*/g, ''));

  return {
    score: Math.round(aiAnalysis.overallScore || averageScore),
    feedback: {
      readinessLevel: aiAnalysis.readinessLevel || 'Under Assessment',
      strengths: aiAnalysis.keyStrengths || [],
      improvements: aiAnalysis.majorImprovements || [],
      recommendations: aiAnalysis.recommendations || [],
      generalFeedback: aiAnalysis.generalFeedback || '',
      categoryScores: calculateCategoryScores(answeredResponses)
    }
  };
};

const mapScoreToResponseType = (score) => {
  if (score >= 85) return 'perfectly-relevant';
  if (score >= 65) return 'mostly-relevant';
  if (score >= 45) return 'partially-relevant';
  if (score >= 25) return 'mostly-irrelevant';
  return 'completely-off-topic';
};

const createAllSkippedFeedback = (totalQuestions) => ({
  score: 0,
  feedback: {
    readinessLevel: 'Not Ready for Intern Role',
    strengths: ['Completed interview session'],
    improvements: ['Answer questions instead of skipping', 'Prepare thoroughly', 'Build confidence'],
    recommendations: ['Study fundamentals', 'Practice coding', 'Work on projects'],
    generalFeedback: `All ${totalQuestions} questions were skipped, indicating lack of preparation.`,
    categoryScores: { technicalKnowledge: 0, codingAbility: 0, behavioralSkills: 0, communication: 0 }
  }
});

const calculateCategoryScores = (responses) => {
  const byType = (type) => responses.filter(r => r.questionType === type);
  const avgScore = (arr) => arr.length > 0 
    ? Math.round(arr.reduce((sum, r) => sum + (r.feedback?.score || 0), 0) / arr.length) 
    : 0;

  return {
    technicalKnowledge: avgScore(byType('technical')),
    codingAbility: avgScore(byType('coding')),
    behavioralSkills: avgScore(byType('behavioral')),
    communication: Math.round(responses.reduce((sum, r) => sum + (r.feedback?.communicationClarity || 5), 0) / responses.length)
  };
};

// Export rate limit info for monitoring
export const getRateLimitInfo = () => ({
  requestCount,
  maxRequests: MAX_REQUESTS_PER_MINUTE,
  remaining: MAX_REQUESTS_PER_MINUTE - requestCount,
  resetIn: 60000 - (Date.now() - lastResetTime)
});

export default { 
  generateInterviewQuestions, 
  generateAIFeedback, 
  generateOverallInterviewFeedback,
  getRateLimitInfo
};