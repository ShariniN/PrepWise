// Fake adaptive mock interviews and CV analyses for the local demo, so the lecturer dashboard has something to show
// without calling any AI. Pure and deterministic: the same seed and `now` always give the same documents.
// Everything is marked as demo data (model 'seed-demo', feedback text starts with "Demo data").
import { nextLevel, adaptiveScore, startLevelFor, SLOT_TYPES, LEVELS } from '../modules/interviews/interviews.adaptive.js';

const DAY = 24 * 60 * 60 * 1000;

// Small seeded PRNG (mulberry32).
export const prng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const between = (r, lo, hi) => lo + r() * (hi - lo);
const int = (r, lo, hi) => Math.floor(between(r, lo, hi + 1));
const round1 = (n) => Math.round(n * 10) / 10;

export const DEMO_GROUPS = ['Group 1', 'Group 2'];
export const groupFor = (index) => DEMO_GROUPS[index % 2];

// Questions for the two spoken slots, by level. The coding slot has one question per level, with visible tests only
// (the hidden tests of a real interview live in the Practice set).
const QUESTIONS = {
  behavioral: {
    easy: ['Tell me about a project you are proud of and your part in it.', 'Why did you choose this role?'],
    medium: ['Tell me about a time you had to learn something quickly.', 'Describe a disagreement in a team project and how you handled it.'],
    hard: ['Describe a time you missed a deadline. What did you change afterwards?', 'Tell me about a decision you made with incomplete information and what happened.'],
  },
  technical: {
    easy: ['Explain what an index is in a database and when it helps.', 'What is the difference between a list and a set?'],
    medium: ['What is the difference between a process and a thread?', 'How would you design a REST API for a library system?'],
    hard: ['What happens when you type a URL into a browser?', 'How would you find out why a page became slow after a release?'],
  },
};

const CODING = {
  easy: { title: 'Palindrome check', statement: 'Write a function that checks whether a string is a palindrome.', tests: [['racecar', 'true'], ['hello', 'false']], hidden: 3 },
  medium: { title: 'First non-repeating character', statement: 'Write a function that returns the first non-repeating character in a string.', tests: [['swiss', 'w'], ['aabb', '']], hidden: 4 },
  hard: { title: 'Merge two sorted arrays', statement: 'Write a function that merges two sorted arrays into one sorted array without sorting the result again.', tests: [['1 3 5|2 4 6', '1 2 3 4 5 6'], ['|1', '1']], hidden: 5 },
};

const STRENGTHS = ['Clear structure (situation, action, result)', 'Good use of a concrete example', 'Correct core idea', 'Explained trade-offs', 'Calm and concise delivery'];
const IMPROVEMENTS = ['Quantify the outcome', 'Mention edge cases', 'Explain the reasoning before the answer', 'Keep the answer shorter', 'Name the specific technology used'];

export const readinessFor = (score) => (score >= 75 ? 'Ready for Intern Position' : score >= 60 ? 'Nearly Ready' : score >= 45 ? 'Needs Development' : 'Not Ready Yet');

// Which of the `count` students get data, how strong they are and whether they have gone quiet.
// Student 0 (the fixed student@ login) always has data. Students >= withData have none.
// Every student gets a target role (spread over the five defaults). A few students with data score 15+ points lower
// in their latest interview (`drop`).
export const demoPlan = ({ count = 40, withData = 25, seed = 2026 } = {}) => {
  const r = prng(seed);
  return Array.from({ length: count }, (_, i) => {
    const hasData = i < withData;
    const rawAbility = Math.round(between(r, 38, 92));
    // A few students with data stopped using PrepWise over a month ago; some without data never started.
    const inactive = hasData ? i % 7 === 5 : i % 3 === 0;
    const drop = hasData && !inactive && i % 7 === 3;
    const ability = drop ? Math.max(rawAbility, 65) : rawAbility;
    return { index: i, group: groupFor(i), roleIndex: i % 5, hasData, ability, inactive, drop, interviews: hasData ? 2 + (i % 2) : 0, cameraOffRate: i % 4 === 1 ? 1 : 0.15 };
  });
};

const deliveryFor = (r, ability, cameraUsed) => ({
  cameraUsed,
  faceVisiblePct: cameraUsed ? round1(clamp(between(r, 72, 100), 0, 100)) : null,
  eyeContactPct: cameraUsed ? round1(clamp(ability * 0.6 + between(r, 5, 35), 0, 100)) : null,
  lookAwayCount: cameraUsed ? int(r, 0, Math.max(1, Math.round((100 - ability) / 12))) : null,
  headMovement: cameraUsed ? pick(r, ability > 70 ? ['low', 'low', 'medium'] : ['low', 'medium', 'medium', 'high']) : null,
  wordsPerMinute: Math.round(between(r, 95, 165)),
  fillerWordCount: int(r, 0, Math.max(1, Math.round((100 - ability) / 7))),
  durationSec: Math.round(between(r, 45, 170)),
});

const answerText = (type, score) => {
  if (type === 'coding') return '';
  return score >= 65
    ? 'Demo answer: I described the situation, what I did step by step and the measurable result.'
    : 'Demo answer: I gave a general description without a specific example or outcome.';
};

const CODE = 'def solve(text):\n    # demo data: placeholder solution\n    return text\n';
const CATEGORY = { behavioral: 'Behavioural', technical: 'Technical', coding: 'Coding' };

// The readiness answer a first-time student would give, from how strong they are.
const readinessAnswerFor = (ability) => (ability >= 75 ? 'ready' : ability >= 55 ? 'some_practice' : 'just_starting');

const questionAt = (r, slot, level, n) => {
  const type = SLOT_TYPES[slot];
  const base = { questionId: `demo-q${n}-s${slot}`, slot, level, difficulty: level, type, category: CATEGORY[type], expectedDuration: 120, followUpQuestions: [] };
  if (type !== 'coding') return { ...base, question: pick(r, QUESTIONS[type][level]), starterCode: null, language: null };
  const c = CODING[level];
  return {
    ...base, question: c.title, statement: c.statement, expectedDuration: 600, language: 'python', languages: ['python', 'javascript'],
    starterCode: 'def solve(text):\n    pass\n', timeLimitMs: 2000, memoryLimitKb: 262144, hiddenTestCount: c.hidden,
    visibleTests: c.tests.map(([input, expectedOutput], k) => ({ id: `demo-t${k + 1}`, input, expectedOutput, comparison: 'trim' })),
  };
};

// One completed adaptive mock interview: five slots, each asked at the level the real rule gives after the
// previous score. `startLevel` comes from the readiness answer (first interview) or the previous interview's
// levelReached; `when` is the completion date and `target` the typical score for this interview.
export const buildInterview = ({ r, userId, institutionId, role, when, target, cameraUsed, n, startLevel, readiness = null }) => {
  const startedAt = new Date(when.getTime() - 25 * 60 * 1000);
  // Roughly one interview in eight has one answer scored by the basic fallback (the AI was unavailable).
  const fallbackAt = r() < 0.125 ? [0, 1, 3, 4][int(r, 0, 3)] : -1;
  const questions = [];
  const responses = [];
  let level = startLevel;
  SLOT_TYPES.forEach((type, k) => {
    const q = questionAt(r, k, level, n);
    questions.push(q);
    // Harder questions are scored a little lower; coding is the hardest to get right.
    const score = Math.round(clamp(target + between(r, -14, 14) - (type === 'coding' ? 6 : 0) - (LEVELS.indexOf(level) - 1) * 4, 5, 98));
    const fallback = k === fallbackAt;
    const comm = Math.round(clamp(score / 10 + between(r, -1.5, 1.5), 1, 10));
    const submittedAt = new Date(startedAt.getTime() + (k + 1) * 4 * 60 * 1000);
    const testsTotal = type === 'coding' ? q.visibleTests.length + q.hiddenTestCount : 0;
    const response = {
      questionId: q.questionId, question: q.question, questionType: type, level,
      textResponse: answerText(type, score), transcription: '',
      ...(type === 'coding' ? { code: CODE, language: 'python' } : {}),
      responseTime: int(r, 40, 180), submittedAt, skipped: false,
      ...(type === 'coding' ? {
        executionResults: {
          output: '', error: '', executionTime: '0.04', memory: '', success: score >= 50, statusCode: 200,
          verdict: score >= 70 ? 'accepted' : 'wrong_answer', serverVerified: true, unavailable: false,
          testsPassed: Math.round((score / 100) * testsTotal), testsTotal, executedAt: submittedAt,
        },
      } : {}),
      feedback: {
        score: fallback ? 50 : score,
        questionRelevance: Math.round(clamp(score / 10 + 1, 1, 10)),
        responseType: score >= 85 ? 'perfectly-relevant' : score >= 65 ? 'mostly-relevant' : score >= 45 ? 'partially-relevant' : 'mostly-irrelevant',
        communicationClarity: comm, technicalAccuracy: Math.round(clamp(score / 10, 1, 10)), structuredResponse: Math.round(clamp(score / 10, 1, 10)),
        strengths: [pick(r, STRENGTHS)], improvements: [pick(r, IMPROVEMENTS)],
        detailedAnalysis: fallback ? 'Demo data: basic fallback score (AI unavailable).' : 'Demo data: generated by seed-demo, not by an AI model.',
        overallAssessment: `Demo data: ${score >= 65 ? 'solid answer' : 'needs more detail'}.`,
        source: fallback ? 'fallback' : (type === 'coding' ? 'tests' : 'ai'),
        ...(type === 'coding' ? { executionSource: 'server' } : {}),
      },
      deliveryMetrics: type === 'coding' ? { ...deliveryFor(r, target, cameraUsed), wordsPerMinute: null, fillerWordCount: null } : deliveryFor(r, target, cameraUsed),
    };
    responses.push(response);
    level = nextLevel(level, adaptiveScore(response));
  });
  const scores = responses.map((x) => x.feedback.score);
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const byType = (t) => {
    const xs = responses.filter((x) => x.questionType === t).map((x) => x.feedback.score);
    return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : avg;
  };
  const comm = Math.round((responses.reduce((a, x) => a + x.feedback.communicationClarity, 0) / responses.length) * 10);
  return {
    userId, institutionId, targetRoleId: role._id,
    jobDescription: `${role.title}. ${role.description} Skills: ${role.skills.join(', ')}.`,
    resumeText: 'Demo data: no real CV.',
    questions, totalQuestions: questions.length, currentQuestionIndex: questions.length,
    startLevel, levelReached: level, readiness,
    status: 'completed', usedProfileCV: true, cvSource: 'profile',
    startedAt, completedAt: when, totalDuration: 25 * 60,
    responses,
    overallFeedback: {
      score: avg, readinessLevel: readinessFor(avg),
      feedback: {
        strengths: [pick(r, STRENGTHS)], improvements: [pick(r, IMPROVEMENTS)], recommendations: ['Practise two STAR stories', 'Solve one Practice question a day'],
        generalFeedback: 'Demo data generated by seed-demo; no AI was called.',
        categoryScores: { behavioralSkills: byType('behavioral'), technicalKnowledge: byType('technical'), codingAbility: byType('coding'), communication: comm },
      },
      categoryPercentages: { behavioral: byType('behavioral'), technical: byType('technical'), coding: byType('coding'), communication: comm, technicalAccuracy: byType('technical'), problemSolving: Math.round((byType('coding') + byType('technical')) / 2) },
      breakdown: { totalQuestions: 5, behavioralQuestions: 2, technicalQuestions: 2, codingQuestions: 1, averageResponseTime: 100 },
    },
    createdAt: startedAt, updatedAt: when,
  };
};

// One CV analysis against the student's target role. The match follows the CV scoring formula (70% AI, 30% keywords).
export const buildCvAnalysis = ({ r, userId, institutionId, email, role, when, level }) => {
  const share = clamp(level / 100 + between(r, -0.25, 0.15), 0.15, 1);
  const order = [...role.skills].map((s) => [r(), s]).sort((x, y) => x[0] - y[0]).map(([, s]) => s);
  const have = new Set(order.slice(0, Math.round(share * role.skills.length)));
  const matched = role.skills.filter((s) => have.has(s));
  const missing = role.skills.filter((s) => !matched.includes(s));
  const keywordScore = Math.round((matched.length / role.skills.length) * 1000) / 1000;
  const aiScore = Math.round(clamp(level / 100 + between(r, -0.2, 0.1), 0.05, 0.95) * 100) / 100;
  const matchPercentage = Math.round((aiScore * 0.7 + keywordScore * 0.3) * 100);
  const result = {
    jobIndex: 0, kind: 'target_role', targetRoleId: role._id, jobTitle: role.title, matchPercentage, isNonTechRole: false,
    scoreBreakdown: { keywordScore, requiredSkills: role.skills, matchedSkills: matched, missingSkills: missing, aiAvailable: true, aiScore, aiError: null, model: 'seed-demo', matchPercentage },
    strengths: matchPercentage >= 60 ? ['Relevant project work', 'Clear skills section'] : ['Clear contact details'],
    contentWeaknesses: missing.length ? [`No evidence of ${missing.slice(0, 2).join(' or ')}`] : [],
    structureWeaknesses: matchPercentage < 55 ? ['Projects lack measurable outcomes'] : [],
    contentRecommendations: missing.length ? [`Add a project that uses ${missing[0]}`] : ['Keep the CV up to date'],
    structureRecommendations: ['Put the most relevant project first'],
    message: 'Demo data generated by seed-demo; no AI was called.',
    skillsMatched: matched, skillsMissing: missing,
  };
  return {
    userId, institutionId, targetRoleId: role._id, resumeText: '', resumeHash: `seed-demo-${email}`, usedProfileCV: false,
    jobDescriptions: [], results: [result], isSaved: true, createdAt: when, updatedAt: when,
  };
};

// All demo activity for one university. students: [{ _id, email }] in plan order; roles: the institution's target
// roles (with _id). Returns { interviews, cvAnalyses, lastActive: [Date per student], targetRoleIds: [per student] }.
export const buildDemoActivity = ({ students, institutionId, roles, now = new Date(), seed = 2026, plan = demoPlan({ count: students.length, seed }) }) => {
  const r = prng(seed + 1);
  const interviews = [];
  const cvAnalyses = [];
  const lastActive = [];
  const targetRoleIds = students.map((_, i) => roles[(plan[i]?.roleIndex ?? i) % roles.length]._id);
  students.forEach((s, i) => {
    const p = plan[i];
    const role = roles.find((x) => String(x._id) === String(targetRoleIds[i]));
    if (!p?.hasData) {
      lastActive.push(p?.inactive ? new Date(now.getTime() - int(r, 35, 70) * DAY) : new Date(now.getTime() - int(r, 0, 10) * DAY));
      return;
    }
    // Active students' last interview is within the last 2 weeks; inactive ones stopped 35-60 days ago.
    const lastDay = p.inactive ? int(r, 35, 60) : int(r, 0, 14);
    let latest = null;
    let previousLevelReached = null;
    for (let k = 0; k < p.interviews; k++) {
      const daysAgo = lastDay + (p.interviews - 1 - k) * int(r, 5, 12);
      const when = new Date(now.getTime() - daysAgo * DAY - int(r, 1, 20) * 3600 * 1000);
      // A little better each time, except for the students whose latest interview went badly.
      const target = clamp(p.drop && k === p.interviews - 1 ? p.ability - 32 : p.ability - 3 + k * 4, 10, 95);
      const readiness = k === 0 ? readinessAnswerFor(p.ability) : null;
      const startLevel = startLevelFor({ previousLevelReached, readiness });
      const cameraUsed = r() >= p.cameraOffRate;
      const iv = buildInterview({ r, userId: s._id, institutionId, role, when, target, cameraUsed, n: `${i}-${k}`, startLevel, readiness });
      interviews.push(iv);
      previousLevelReached = iv.levelReached;
      if (!latest || when > latest) latest = when;
    }
    const cvWhen = new Date(now.getTime() - (lastDay + int(r, 1, 20)) * DAY);
    cvAnalyses.push(buildCvAnalysis({ r, userId: s._id, institutionId, email: s.email, role, when: cvWhen, level: clamp(p.ability + between(r, -15, 10), 15, 95) }));
    lastActive.push(latest > cvWhen ? latest : cvWhen);
  });
  return { interviews, cvAnalyses, lastActive, targetRoleIds };
};
