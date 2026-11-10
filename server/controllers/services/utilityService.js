// Utility functions for interview processing

export const validateAndSanitizeInput = (input) => {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .substring(0, 10000);
};

export const validateLanguage = (language) => {
  return language ? language.trim() : null;
};

export const normalizeQuestionType = (type) => {
  if (!type || typeof type !== 'string') return 'technical';
  
  const typeMapping = {
    'behavioral': 'behavioral',
    'behaviour': 'behavioral',
    'behavioural': 'behavioral',
    'technical': 'technical', 
    'tech': 'technical',
    'coding': 'coding',
    'code': 'coding',
    'programming': 'coding',
    'problem-solving': 'coding',
    'algorithm': 'coding',
    'system_design': 'technical',
    'system-design': 'technical',
    'design': 'technical'
  };

  const normalized = type.toLowerCase().replace(/[^a-z-]/g, '');
  return typeMapping[normalized] || 'technical';
};

// Scores come only from answers the AI (or the tests) scored. Answers with feedback.source === 'fallback' were scored
// by the basic estimate because the AI was unavailable: they still count as answered, but not towards any score
// (the lecturer dashboard leaves them out the same way). excludedFallbackAnswers says how many were left out,
// scoreIsPartial is true when some were, and score is null when no answer had a real score.
export const calculateFinalResults = (responses, totalDuration) => {
  const answeredResponses = responses.filter(r => !r.skipped && r.feedback);
  const scoredResponses = answeredResponses.filter(r => r.feedback?.source !== 'fallback');
  const excludedFallbackAnswers = answeredResponses.length - scoredResponses.length;
  const skippedCount = responses.filter(r => r.skipped).length;

  const byType = (list, type) => list.filter(r => r.questionType === type);
  const breakdown = {
    totalQuestions: responses.length,
    answeredQuestions: answeredResponses.length,
    skippedQuestions: skippedCount,
    behavioralQuestions: byType(answeredResponses, 'behavioral').length,
    technicalQuestions: byType(answeredResponses, 'technical').length,
    codingQuestions: byType(answeredResponses, 'coding').length,
    averageResponseTime: answeredResponses.length > 0
      ? Math.round(answeredResponses.reduce((sum, r) => sum + (r.responseTime || 0), 0) / answeredResponses.length)
      : 0
  };
  const counts = { excludedFallbackAnswers, scoredAnswers: scoredResponses.length, scoreIsPartial: excludedFallbackAnswers > 0 && scoredResponses.length > 0 };

  if (answeredResponses.length === 0) {
    return {
      score: 0,
      duration: totalDuration,
      categoryPercentages: { behavioral: 0, technical: 0, coding: 0, communication: 0, technicalAccuracy: 0, problemSolving: 0 },
      breakdown,
      ...counts
    };
  }

  if (scoredResponses.length === 0) {
    return {
      score: null,
      duration: totalDuration,
      categoryPercentages: { behavioral: null, technical: null, coding: null, communication: null, technicalAccuracy: null, problemSolving: null },
      breakdown,
      ...counts
    };
  }

  const scores = scoredResponses.map(r => r.feedback?.score || 0);
  const overallScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

  const avgScore = (arr) => arr.length > 0
    ? Math.round(arr.reduce((sum, r) => sum + (r.feedback?.score || 0), 0) / arr.length)
    : Math.round(overallScore);

  const categoryScores = {
    behavioral: avgScore(byType(scoredResponses, 'behavioral')),
    technical: avgScore(byType(scoredResponses, 'technical')),
    coding: avgScore(byType(scoredResponses, 'coding'))
  };

  const communicationScore = Math.round(
    scoredResponses.reduce((sum, r) => sum + (r.feedback?.communicationClarity || 5), 0) / scoredResponses.length
  );

  const technicalAccuracyScore = Math.round(
    scoredResponses.reduce((sum, r) => sum + (r.feedback?.technicalAccuracy || 5), 0) / scoredResponses.length
  );

  const problemSolvingScore = Math.round((categoryScores.coding + categoryScores.technical) / 2);

  return {
    score: Math.round(overallScore),
    duration: totalDuration,
    categoryPercentages: {
      behavioral: categoryScores.behavioral,
      technical: categoryScores.technical,
      coding: categoryScores.coding,
      communication: (communicationScore / 10) * 100,
      technicalAccuracy: (technicalAccuracyScore / 10) * 100,
      problemSolving: problemSolvingScore
    },
    breakdown,
    ...counts
  };
};

// CV analysis helpers
export const extractTechnologies = (resumeText) => {
  const techKeywords = [
    'JavaScript', 'Python', 'Java', 'C++', 'C#', 'React', 'Node.js', 'Express',
    'MongoDB', 'MySQL', 'PostgreSQL', 'HTML', 'CSS', 'Git', 'Docker', 'AWS',
    'Vue.js', 'Angular', 'TypeScript', 'PHP', 'Ruby', 'Django', 'Flask',
    'Spring', 'Bootstrap', 'jQuery', 'REST', 'API', 'GraphQL', 'Redis'
  ];
  
  return techKeywords.filter(tech => 
    new RegExp(`\\b${tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(resumeText)
  );
};

export const extractRequirements = (jobDescription) => {
  const requirements = [];
  const lines = jobDescription.split('\n');
  
  lines.forEach(line => {
    if (/^[-•*]\s*|requirements?:|skills?:/i.test(line)) {
      const cleaned = line.replace(/^[-•*]\s*|requirements?:|skills?:/i, '').trim();
      if (cleaned.length > 5 && cleaned.length < 100) {
        requirements.push(cleaned);
      }
    }
  });
  
  return requirements.slice(0, 8);
};

export const extractProjects = (resumeText) => {
  const projects = [];
  const lines = resumeText.split('\n');
  
  lines.forEach(line => {
    if (/project|built|developed|created|implemented/i.test(line) && 
        !/(education|experience|skills)/i.test(line) &&
        line.length > 20) {
      projects.push(line.trim());
    }
  });
  
  return projects.slice(0, 5);
};

// Fallback questions
export const getFallbackQuestions = () => [
  {
    questionId: "q1",
    type: "behavioral",
    question: "Tell me about a programming project you worked on recently. What challenges did you face?",
    category: "project_experience",
    difficulty: "easy",
    expectedDuration: 180,
    followUpQuestions: [],
    starterCode: null,
    language: null
  },
  {
    questionId: "q2", 
    type: "behavioral",
    question: "Describe a time when you had to learn a new technology for a project.",
    category: "learning_ability",
    difficulty: "easy",
    expectedDuration: 180,
    followUpQuestions: [],
    starterCode: null,
    language: null
  },
  {
    questionId: "q3",
    type: "behavioral",
    question: "Tell me about a time when you worked with others on a coding project.",
    category: "teamwork",
    difficulty: "easy", 
    expectedDuration: 180,
    followUpQuestions: [],
    starterCode: null,
    language: null
  },
  {
    questionId: "q4",
    type: "technical",
    question: "What is the difference between frontend and backend in web development?",
    category: "web_basics",
    difficulty: "easy",
    expectedDuration: 150,
    followUpQuestions: [],
    starterCode: null,
    language: null
  },
  {
    questionId: "q5",
    type: "technical", 
    question: "Explain what Git is and why it's useful for programmers.",
    category: "tools_basics",
    difficulty: "easy",
    expectedDuration: 150,
    followUpQuestions: [],
    starterCode: null,
    language: null
  },
  {
    questionId: "q6",
    type: "technical",
    question: "What is a function in programming? Why are functions useful?",
    category: "programming_basics",
    difficulty: "easy",
    expectedDuration: 150,
    followUpQuestions: [],
    starterCode: null,
    language: null
  },
  {
    questionId: "q7",
    type: "technical",
    question: "What is debugging? Describe a simple debugging process.",
    category: "debugging_basics",
    difficulty: "easy",
    expectedDuration: 150,
    followUpQuestions: [],
    starterCode: null,
    language: null
  },
  {
    questionId: "q8",
    type: "coding",
    question: "Write a function that finds the largest number in an array.",
    category: "basic_arrays",
    difficulty: "easy",
    expectedDuration: 300,
    followUpQuestions: [],
    starterCode: {
      javascript: `function findLargest(numbers) {
    // Find and return the largest number
    return 0;
}

console.log(findLargest([3, 7, 2, 9, 1])); // Should return 9`
    },
    language: "javascript"
  },
  {
    questionId: "q9",
    type: "coding",
    question: "Create a function that counts how many times a character appears in a string.",
    category: "string_basics",
    difficulty: "easy",
    expectedDuration: 300,
    followUpQuestions: [],
    starterCode: {
      javascript: `function countCharacter(text, char) {
    // Count how many times 'char' appears in 'text'
    return 0;
}

console.log(countCharacter("hello world", "l")); // Should return 3`
    },
    language: "javascript"
  },
  {
    questionId: "q10",
    type: "coding",
    question: "Write a function that checks if a number is even or odd.",
    category: "basic_logic",
    difficulty: "easy",
    expectedDuration: 300,
    followUpQuestions: [],
    starterCode: {
      javascript: `function checkEvenOdd(number) {
    // Return "even" or "odd"
    return "";
}

console.log(checkEvenOdd(4)); // Should return "even"`
    },
    language: "javascript"
  }
];

export default {
  validateAndSanitizeInput,
  validateLanguage,
  normalizeQuestionType,
  calculateFinalResults,
  extractTechnologies,
  extractRequirements,
  extractProjects,
  getFallbackQuestions
};
