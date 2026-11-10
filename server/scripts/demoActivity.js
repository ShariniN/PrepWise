// Fake mock interviews and CV analyses for the local demo, so the lecturer dashboard has something to show
// without calling any AI. Pure and deterministic: the same seed and `now` always give the same documents.
// Everything is marked as demo data (model 'seed-demo', feedback text starts with "Demo data").
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

const JOBS = [
  { title: 'Junior Backend Developer', company: 'Northwind Labs', skills: ['node.js', 'express', 'mongodb', 'rest', 'git', 'docker'] },
  { title: 'Graduate Software Engineer', company: 'Bluebridge Systems', skills: ['java', 'spring', 'sql', 'unit testing', 'git', 'agile'] },
  { title: 'Frontend Developer Intern', company: 'Pixel & Co', skills: ['javascript', 'react', 'html', 'css', 'typescript', 'git'] },
  { title: 'Data Engineering Intern', company: 'Riverstone Analytics', skills: ['python', 'sql', 'postgresql', 'docker', 'linux', 'algorithms'] },
];

const QUESTIONS = {
  behavioral: [
    'Tell me about a time you had to learn something quickly.',
    'Describe a disagreement in a team project and how you handled it.',
    'Tell me about a project you are proud of and your part in it.',
    'Describe a time you missed a deadline. What did you change afterwards?',
  ],
  technical: [
    'What is the difference between a process and a thread?',
    'How would you design a REST API for a library system?',
    'Explain what an index is in a database and when it helps.',
    'What happens when you type a URL into a browser?',
  ],
  coding: [
    'Write a function that returns the first non-repeating character in a string.',
    'Write a function that checks whether a string is a palindrome.',
    'Write a function that merges two sorted arrays.',
  ],
};

const STRENGTHS = ['Clear structure (situation, action, result)', 'Good use of a concrete example', 'Correct core idea', 'Explained trade-offs', 'Calm and concise delivery'];
const IMPROVEMENTS = ['Quantify the outcome', 'Mention edge cases', 'Explain the reasoning before the answer', 'Keep the answer shorter', 'Name the specific technology used'];

export const readinessFor = (score) => (score >= 75 ? 'Ready for Intern Position' : score >= 60 ? 'Nearly Ready' : score >= 45 ? 'Needs Development' : 'Not Ready Yet');

// Which of the `count` students get data, how strong they are and whether they have gone quiet.
// Student 0 (the fixed student@ login) always has data. Students >= withData have none.
export const demoPlan = ({ count = 40, withData = 25, seed = 2026 } = {}) => {
  const r = prng(seed);
  return Array.from({ length: count }, (_, i) => {
    const hasData = i < withData;
    const ability = Math.round(between(r, 38, 92));
    // A few students with data stopped using PrepWise over a month ago; some without data never started.
    const inactive = hasData ? i % 7 === 5 : i % 3 === 0;
    return { index: i, group: groupFor(i), hasData, ability, inactive, interviews: hasData ? 2 + (i % 2) : 0, cameraOffRate: i % 4 === 1 ? 1 : 0.15 };
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

const CODE = 'function solve(input) {\n  // demo data: placeholder solution\n  return input;\n}\n';

// One completed mock interview. `when` is the completion date, `level` the target score for this interview.
export const buildInterview = ({ r, userId, institutionId, when, level, cameraUsed, job, n }) => {
  const types = ['behavioral', 'technical', 'behavioral', 'technical', 'coding'];
  const questions = types.map((type, k) => ({
    questionId: `demo-q${n}-${k + 1}`, type, question: pick(r, QUESTIONS[type]),
    category: type === 'behavioral' ? 'Behavioural' : type === 'coding' ? 'Coding' : 'Technical',
    difficulty: pick(r, ['easy', 'medium', 'medium', 'hard']), expectedDuration: 120,
    followUpQuestions: [], starterCode: null, language: type === 'coding' ? 'javascript' : null,
  }));
  const startedAt = new Date(when.getTime() - 25 * 60 * 1000);
  // Roughly one interview in eight has one answer scored by the basic fallback (the AI was unavailable).
  const fallbackAt = r() < 0.125 ? int(r, 0, 3) : -1;
  const responses = questions.map((q, k) => {
    const score = Math.round(clamp(level + between(r, -14, 14) - (q.type === 'coding' ? 6 : 0), 5, 98));
    const fallback = k === fallbackAt;
    const comm = Math.round(clamp(score / 10 + between(r, -1.5, 1.5), 1, 10));
    return {
      questionId: q.questionId, question: q.question, questionType: q.type,
      textResponse: answerText(q.type, score), transcription: '',
      ...(q.type === 'coding' ? { code: CODE, language: 'javascript' } : {}),
      responseTime: int(r, 40, 180), submittedAt: new Date(startedAt.getTime() + (k + 1) * 4 * 60 * 1000), skipped: false,
      ...(q.type === 'coding' ? {
        executionResults: {
          output: '', error: '', executionTime: '0.04', memory: '', success: score >= 50, statusCode: 200,
          verdict: score >= 70 ? 'accepted' : 'wrong_answer', serverVerified: true, unavailable: false,
          testsPassed: Math.round((score / 100) * 5), testsTotal: 5, executedAt: new Date(startedAt.getTime() + (k + 1) * 4 * 60 * 1000),
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
        source: fallback ? 'fallback' : (q.type === 'coding' ? 'tests' : 'ai'),
        ...(q.type === 'coding' ? { executionSource: 'server' } : {}),
      },
      deliveryMetrics: q.type === 'coding' ? { ...deliveryFor(r, level, cameraUsed), wordsPerMinute: null, fillerWordCount: null } : deliveryFor(r, level, cameraUsed),
    };
  });
  const scores = responses.map((x) => x.feedback.score);
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const byType = (t) => {
    const xs = responses.filter((x) => x.questionType === t).map((x) => x.feedback.score);
    return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : avg;
  };
  const comm = Math.round((responses.reduce((a, x) => a + x.feedback.communicationClarity, 0) / responses.length) * 10);
  return {
    userId, institutionId,
    jobDescription: `${job.title} at ${job.company}. Skills: ${job.skills.join(', ')}. (Demo job description.)`,
    resumeText: 'Demo data: no real CV.',
    questions, totalQuestions: questions.length, currentQuestionIndex: questions.length,
    status: 'completed', usedProfileCV: false, cvSource: 'manual',
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

// One CV analysis against two demo jobs. The match follows the CV scoring formula (70% AI, 30% keywords).
export const buildCvAnalysis = ({ r, userId, institutionId, email, when, level }) => {
  const jobs = [JOBS[int(r, 0, 1)], JOBS[int(r, 2, 3)]];
  const results = jobs.map((job, jobIndex) => {
    const share = clamp(level / 100 + between(r, -0.25, 0.15), 0.15, 1);
    const order = [...job.skills].map((s) => [r(), s]).sort((x, y) => x[0] - y[0]).map(([, s]) => s);
    const have = new Set(order.slice(0, Math.round(share * job.skills.length)));
    const matched = job.skills.filter((s) => have.has(s));
    const missing = job.skills.filter((s) => !matched.includes(s));
    const keywordScore = Math.round((matched.length / job.skills.length) * 1000) / 1000;
    const aiScore = Math.round(clamp(level / 100 + between(r, -0.2, 0.1), 0.05, 0.95) * 100) / 100;
    const matchPercentage = Math.round((aiScore * 0.7 + keywordScore * 0.3) * 100);
    return {
      jobIndex, jobTitle: job.title, company: job.company, matchPercentage, isNonTechRole: false,
      scoreBreakdown: { keywordScore, requiredSkills: job.skills, matchedSkills: matched, missingSkills: missing, aiAvailable: true, aiScore, aiError: null, model: 'seed-demo', matchPercentage },
      strengths: matchPercentage >= 60 ? ['Relevant project work', 'Clear skills section'] : ['Clear contact details'],
      contentWeaknesses: missing.length ? [`No evidence of ${missing.slice(0, 2).join(' or ')}`] : [],
      structureWeaknesses: matchPercentage < 55 ? ['Projects lack measurable outcomes'] : [],
      contentRecommendations: missing.length ? [`Add a project that uses ${missing[0]}`] : ['Keep the CV up to date'],
      structureRecommendations: ['Put the most relevant project first'],
      message: 'Demo data generated by seed-demo; no AI was called.',
      skillsMatched: matched, skillsMissing: missing,
    };
  });
  return {
    userId, institutionId, resumeText: '', resumeHash: `seed-demo-${email}`, usedProfileCV: false,
    jobDescriptions: jobs.map((j) => `${j.title} at ${j.company}. Skills: ${j.skills.join(', ')}. (Demo job description.)`),
    results, isSaved: true, createdAt: when, updatedAt: when,
  };
};

// All demo activity for one university. students: [{ _id, email }] in plan order.
// Returns { interviews, cvAnalyses, lastActive: [Date|null per student] }.
export const buildDemoActivity = ({ students, institutionId, now = new Date(), seed = 2026, plan = demoPlan({ count: students.length, seed }) }) => {
  const r = prng(seed + 1);
  const interviews = [];
  const cvAnalyses = [];
  const lastActive = [];
  students.forEach((s, i) => {
    const p = plan[i];
    if (!p?.hasData) {
      lastActive.push(p?.inactive ? new Date(now.getTime() - int(r, 35, 70) * DAY) : new Date(now.getTime() - int(r, 0, 10) * DAY));
      return;
    }
    // Active students' last interview is within the last 2 weeks; inactive ones stopped 35-60 days ago.
    const lastDay = p.inactive ? int(r, 35, 60) : int(r, 0, 14);
    let latest = null;
    for (let k = 0; k < p.interviews; k++) {
      const daysAgo = lastDay + (p.interviews - 1 - k) * int(r, 5, 12);
      const when = new Date(now.getTime() - daysAgo * DAY - int(r, 1, 20) * 3600 * 1000);
      const level = clamp(p.ability - 3 + k * 4, 10, 95); // a little better each time
      const cameraUsed = r() >= p.cameraOffRate;
      interviews.push(buildInterview({ r, userId: s._id, institutionId, when, level, cameraUsed, job: pick(r, JOBS), n: `${i}-${k}` }));
      if (!latest || when > latest) latest = when;
    }
    const cvWhen = new Date(now.getTime() - (lastDay + int(r, 1, 20)) * DAY);
    cvAnalyses.push(buildCvAnalysis({ r, userId: s._id, institutionId, email: s.email, when: cvWhen, level: clamp(p.ability + between(r, -15, 10), 15, 95) }));
    lastActive.push(latest > cvWhen ? latest : cvWhen);
  });
  return { interviews, cvAnalyses, lastActive };
};
