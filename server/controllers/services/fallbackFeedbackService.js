// Fallback feedback generation when AI service fails

export const generateFallbackFeedback = (questionType, responseText, code, language, executionResults) => {
  const hasCode = code && code.trim().length > 0;
  const responseLength = responseText?.length || 0;
  
  let score = 35;
  let strengths = [];
  let improvements = [];
  let responseType = 'partially-relevant';
  
  if (questionType === 'coding') {
    ({ score, strengths, improvements, responseType } = analyzeCodingResponse(hasCode, code, responseText, executionResults));
  } else if (questionType === 'technical') {
    ({ score, strengths, improvements, responseType } = analyzeTechnicalResponse(responseText, responseLength));
  } else {
    ({ score, strengths, improvements, responseType } = analyzeBehavioralResponse(responseText, responseLength));
  }

  return {
    score,
    questionRelevance: Math.max(1, Math.floor(score / 15)),
    responseType,
    correctness: Math.max(1, Math.floor(score / 15)),
    syntax: hasCode ? Math.max(1, Math.floor(score / 12)) : Math.floor(score / 15),
    languageBestPractices: Math.max(1, Math.floor(score / 15)),
    efficiency: Math.max(1, Math.floor(score / 20)),
    structureAndReadability: Math.max(1, Math.floor(score / 15)),
    edgeCaseHandling: Math.max(1, Math.floor(score / 25)),
    strengths,
    improvements,
    detailedAnalysis: generateDetailedAnalysis(questionType, score, responseLength, hasCode),
    overallAssessment: generateOverallAssessment(score),
    communicationClarity: Math.max(1, Math.floor(score / 15)),
    technicalAccuracy: Math.max(1, Math.floor(score / 15))
  };
};

const analyzeCodingResponse = (hasCode, code, responseText, executionResults) => {
  if (!hasCode || code.trim().length < 10) {
    return {
      score: 5,
      strengths: ['Submitted response'],
      improvements: ['Must provide actual code', 'Implement the required function', 'Show problem-solving approach'],
      responseType: 'completely-off-topic'
    };
  }

  const codeAnalysis = analyzeCodeQuality(code);
  const executionAnalysis = analyzeExecutionResults(executionResults);
  const score = calculateCodingScore(codeAnalysis, executionAnalysis, responseText);
  
  return {
    score,
    strengths: generateCodingStrengths(codeAnalysis, executionAnalysis),
    improvements: generateCodingImprovements(codeAnalysis, executionAnalysis),
    responseType: mapScoreToResponseType(score)
  };
};

const analyzeTechnicalResponse = (responseText, responseLength) => {
  if (responseLength < 50) {
    return {
      score: 10,
      strengths: ['Provided brief response'],
      improvements: ['Provide detailed technical explanation', 'Include specific examples', 'Demonstrate deeper understanding'],
      responseType: 'completely-off-topic'
    };
  }

  const hasTechnicalTerms = /\b(algorithm|database|API|framework|library|function|variable|array|object|server|client|HTTP|JSON|SQL)\b/i.test(responseText);
  const hasExamples = /\b(example|instance|such as|like|for example)\b/i.test(responseText);
  const hasExplanation = /\b(because|therefore|thus|since|reason|due to)\b/i.test(responseText);
  
  let score = 20;
  if (responseLength >= 150) score = 50;
  if (hasTechnicalTerms) score += 15;
  if (hasExamples) score += 10;
  if (hasExplanation) score += 10;

  return {
    score: Math.min(100, score),
    strengths: hasTechnicalTerms ? ['Used relevant technical terminology', 'Attempted to explain concepts'] : ['Provided some explanation'],
    improvements: ['Provide more detailed explanations', 'Include practical examples', 'Use technical terminology correctly'],
    responseType: mapScoreToResponseType(score)
  };
};

const analyzeBehavioralResponse = (responseText, responseLength) => {
  if (responseLength < 100) {
    return {
      score: 15,
      strengths: ['Provided response'],
      improvements: ['Use STAR method (Situation, Task, Action, Result)', 'Provide specific examples', 'Explain learning outcomes'],
      responseType: 'mostly-irrelevant'
    };
  }

  const hasSituation = /\b(project|work|team|experience|situation|when|during)\b/i.test(responseText);
  const hasAction = /\b(I did|I implemented|I decided|I approached|I solved|I learned)\b/i.test(responseText);
  const hasResult = /\b(result|outcome|success|completed|achieved|learned)\b/i.test(responseText);
  
  const starCount = [hasSituation, hasAction, hasResult].filter(Boolean).length;
  const score = starCount >= 2 ? 60 : 35;

  return {
    score,
    strengths: starCount >= 2 ? ['Used structured approach', 'Provided specific example'] : ['Provided personal example'],
    improvements: ['Structure response using STAR method', 'Be more specific about actions', 'Explain what you learned'],
    responseType: mapScoreToResponseType(score)
  };
};

const analyzeCodeQuality = (code) => ({
  hasBasicStructure: /function|def|class|public|void/i.test(code),
  hasControlFlow: /if|else|for|while|switch/i.test(code),
  hasReturnStatement: /return/i.test(code),
  hasVariables: /let|const|var|int|string|=/.test(code),
  hasLogic: code.length > 50 && /[{}();]/g.test(code),
  syntaxErrors: checkBasicSyntax(code),
  length: code.length
});

const checkBasicSyntax = (code) => {
  const errors = [];
  const openBraces = (code.match(/{/g) || []).length;
  const closeBraces = (code.match(/}/g) || []).length;
  const openParens = (code.match(/\(/g) || []).length;
  const closeParens = (code.match(/\)/g) || []).length;
  
  if (openBraces !== closeBraces) errors.push('Unmatched braces');
  if (openParens !== closeParens) errors.push('Unmatched parentheses');
  
  return errors;
};

const analyzeExecutionResults = (executionResults) => {
  if (!executionResults) return { hasOutput: false, hasError: false, score: 0 };
  
  return {
    hasOutput: !!(executionResults.output && executionResults.output.trim()),
    hasError: !!(executionResults.error && executionResults.error.trim()),
    outputLength: executionResults.output ? executionResults.output.length : 0,
    score: executionResults.error ? 0 : (executionResults.output ? 20 : 5)
  };
};

const calculateCodingScore = (codeAnalysis, executionAnalysis, responseText) => {
  let score = 20;
  
  if (codeAnalysis.hasBasicStructure) score += 15;
  if (codeAnalysis.hasControlFlow) score += 15;
  if (codeAnalysis.hasReturnStatement) score += 10;
  if (codeAnalysis.hasVariables) score += 10;
  if (codeAnalysis.hasLogic) score += 10;
  if (codeAnalysis.syntaxErrors.length === 0) score += 15;
  if (executionAnalysis.hasOutput && !executionAnalysis.hasError) score += 20;
  if (responseText && responseText.length > 50) score += 5;
  
  return Math.min(100, score);
};

const generateCodingStrengths = (codeAnalysis, executionAnalysis) => {
  const strengths = [];
  
  if (codeAnalysis.hasBasicStructure) strengths.push('Provided proper function structure');
  if (codeAnalysis.hasControlFlow) strengths.push('Used appropriate control flow logic');
  if (codeAnalysis.hasReturnStatement) strengths.push('Included return statement');
  if (codeAnalysis.syntaxErrors.length === 0) strengths.push('Code has correct basic syntax');
  if (executionAnalysis.hasOutput && !executionAnalysis.hasError) strengths.push('Code executes successfully');
  
  return strengths.length > 0 ? strengths : ['Made an attempt to write code'];
};

const generateCodingImprovements = (codeAnalysis, executionAnalysis) => {
  const improvements = [];
  
  if (!codeAnalysis.hasBasicStructure) improvements.push('Use proper function or class structure');
  if (!codeAnalysis.hasControlFlow) improvements.push('Add logical control flow (if/else, loops)');
  if (codeAnalysis.syntaxErrors.length > 0) improvements.push('Fix syntax errors: ' + codeAnalysis.syntaxErrors.join(', '));
  if (executionAnalysis.hasError) improvements.push('Debug and fix runtime errors');
  if (!executionAnalysis.hasOutput) improvements.push('Ensure code produces expected output');
  
  improvements.push('Add comments to explain your logic');
  improvements.push('Test your solution with different inputs');
  
  return improvements;
};

const generateDetailedAnalysis = (questionType, score, responseLength, hasCode) => {
  if (score < 25) {
    if (questionType === 'coding' && !hasCode) {
      return `Failed to provide any code for this coding question. Shows lack of understanding of requirements.`;
    }
    return `Response demonstrates minimal understanding. The ${responseLength} character response lacks technical depth.`;
  } else if (score < 50) {
    return `Basic attempt but lacks technical accuracy and depth. The ${responseLength} character answer addresses some aspects but misses key concepts.`;
  } else if (score < 70) {
    return `Solid attempt with reasonable understanding. Could benefit from more specific examples and deeper technical details.`;
  }
  return `Good response showing strong technical understanding with appropriate detail.`;
};

const generateOverallAssessment = (score) => {
  if (score >= 80) return 'Excellent performance for an intern-level question - shows strong foundation';
  if (score >= 65) return 'Good performance meeting expectations for intern level with room for growth';
  if (score >= 50) return 'Acceptable performance but requires development in key areas';
  if (score >= 35) return 'Below expectations - needs focused study and practice';
  return 'Significantly below intern level - requires substantial preparation';
};

const mapScoreToResponseType = (score) => {
  if (score >= 85) return 'perfectly-relevant';
  if (score >= 65) return 'mostly-relevant';
  if (score >= 45) return 'partially-relevant';
  if (score >= 25) return 'mostly-irrelevant';
  return 'completely-off-topic';
};

export default { generateFallbackFeedback };
