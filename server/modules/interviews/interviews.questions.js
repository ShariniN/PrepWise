// Utility functions for interview processing
import { LEVELS, SLOT_TYPES } from './interviews.adaptive.js';

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

// Generic questions for when the AI cannot write the tailored pool. Two per type and level, because slots 0 and 4
// are both behavioural and slots 1 and 3 are both technical. Slot n uses the first or second question of its type.
const EXPECTED_DURATION = { behavioral: 180, technical: 150, coding: 600 };
const FALLBACK = {
  behavioral: {
    easy: [
      ['Tell me about a programming project you worked on recently. What was your part in it?', 'project_experience'],
      ['Describe a time you had to learn a new tool or technology quickly. How did you go about it?', 'learning_ability'],
    ],
    medium: [
      ['Tell me about a time you disagreed with a teammate about how to build something. What happened?', 'teamwork'],
      ['Describe a project that did not go to plan. What did you change, and what did you learn?', 'resilience'],
    ],
    hard: [
      ['Tell me about a time you had to make a technical decision with incomplete information. How did you decide, and how did it turn out?', 'judgement'],
      ['Describe a time you took the lead on fixing a problem nobody owned. How did you get others on board?', 'leadership'],
    ],
  },
  technical: {
    easy: [
      ['What is the difference between the frontend and the backend of a web application?', 'web_basics'],
      ['Explain what Git is and why teams use it.', 'tools_basics'],
    ],
    medium: [
      ['What happens, step by step, when you type a web address into a browser and press Enter?', 'web_fundamentals'],
      ['How would you find and fix a bug that only happens for some users and not on your machine?', 'debugging'],
    ],
    hard: [
      ['How would you design a URL shortener that handles millions of links? Talk through storage, lookups and scaling.', 'system_design'],
      ['A page that lists orders has become slow as the data grew. How would you find the cause and make it fast again?', 'performance'],
    ],
  },
};
const FALLBACK_CODING = {
  easy: 'Write a program that reads a list of whole numbers from standard input (separated by spaces) and prints the largest one.',
  medium: 'Write a program that reads a line of text from standard input and prints each word with how many times it appears, most frequent first.',
  hard: 'Write a program that reads a list of meeting times as start-end pairs from standard input and prints the merged, non-overlapping ranges.',
};

// { easy, medium, hard } for one of the slots 0, 1, 3, 4.
export const fallbackSlot = (slot) => {
  const type = SLOT_TYPES[slot];
  const nth = SLOT_TYPES.slice(0, slot).filter((t) => t === type).length;
  return Object.fromEntries(LEVELS.map((level) => {
    const [question, category] = FALLBACK[type][level][nth];
    return [level, { questionId: `s${slot}-${level}`, type, question, category, expectedDuration: EXPECTED_DURATION[type] }];
  }));
};

// Used only when the practice set has no coding question at any level. It has no tests, so the code is run once.
export const fallbackCodingQuestion = (level) => ({
  questionId: `s2-${level}`, type: 'coding', question: FALLBACK_CODING[level], category: 'coding',
  expectedDuration: EXPECTED_DURATION.coding, languages: ['javascript', 'python', 'java'], language: 'python', starterCode: null,
});

export const expectedDurationFor = (type) => EXPECTED_DURATION[type] || 150;
