// Benchmark Gemini models for CV scoring. Usage (from server/): node tools/cv-model-bench.mjs [model ...]
// Six fake CVs of known quality are scored against one job description, twice per model.
// A good model ranks them in the expected order, gives similar scores on repeat runs, and responds reliably.
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildPrompt, parseScore } from '../services/cvScoring.js';

const JD = `Software Engineering Intern (Backend/Full-stack). Required: JavaScript or TypeScript, Node.js and Express,
React, REST APIs, SQL or MongoDB, Git, unit testing, data structures and algorithms. You will build and test API
features in an agile team and review code with Git pull requests.`;

// Expected rank 1 (best) to 6 (worst). C and F are deliberately close.
const CVS = [
  { id: 'A excellent', rank: 1, text: `Nimali Fernando, nimali.f@mail.com, github.com/nimalif. BSc Computer Science, University of Colombo (2023-2027), GPA 3.7.
Experience: Software Engineering Intern, BrightLabs (Jun-Sep 2025): built 6 REST endpoints in Node.js/Express for an order service, wrote 60 Jest unit tests (coverage 48% to 81%), reviewed pull requests weekly in two-week sprints.
Projects: Library Loans API (Node.js, Express, PostgreSQL, JWT; 40 tests; deployed with Docker). Campus Events (React + TypeScript, 2,000 monthly users, cut load time 35% with code splitting).
Skills: JavaScript, TypeScript, Node.js, Express, React, SQL, MongoDB, Git, Jest, data structures and algorithms (220 problems solved).` },
  { id: 'B good', rank: 2, text: `Kasun Silva, kasun@mail.com. BSc Software Engineering (year 3). Projects: Todo REST API with Node.js and Express and MongoDB, with some unit tests.
Personal blog front end in React. Group project: a timetable app, I did the backend routes. Skills: JavaScript, Node.js, Express, React, MongoDB, Git, basic SQL.
Coursework: Data Structures, Algorithms, Databases.` },
  { id: 'C mixed', rank: 3, text: `Ishara Perera, ishara@mail.com. Computing degree, second year. Coursework: Programming in Java, Data Structures, Web Development.
Project: made a website for a friend's shop (HTML, CSS, a little JavaScript). Familiar with Git. Interested in backend development and learning Node.js.` },
  { id: 'F other stack', rank: 3.5, text: `Ravi Kumar, ravi@mail.com. BSc Computer Science (year 3). Projects: Hotel booking system in Java with Spring Boot and MySQL, 30 JUnit tests;
Android expense tracker in Kotlin (500 downloads). Skills: Java, Spring Boot, Kotlin, MySQL, Git, JUnit, data structures and algorithms.` },
  { id: 'D keyword stuffed', rank: 5, text: `john. john@mail. skills python javascript react node.js express rest api git sql data structures algorithms testing agile.
experiance: i did some stuff with computers. helped people. educaton: studying. projects: website (not finished).
i am hard worker and fast learner and team player and passionate` },
  { id: 'E unrelated', rank: 6, text: `Jane Perera, jane@mail.com. Education: BSc Business Management (in progress). Experience: cashier at a grocery store for two years,
trained new staff. Skills: customer service, communication, teamwork, Microsoft Word and Excel. Hobbies: cricket, reading.` },
];

const models = process.argv.slice(2).length ? process.argv.slice(2)
  : ['gemini-2.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.8-flash'];
const RUNS = Number(process.env.RUNS || 2);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Spearman rank correlation between expected and observed order (1 = perfect).
const spearman = (expected, observed) => {
  const rank = (xs) => { const s = [...xs].map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = []; s.forEach(([, i], k) => { r[i] = k + 1; }); return r; };
  const a = rank(expected), b = rank(observed.map((x) => -x));
  const n = a.length; const d2 = a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
};

const results = [];
for (const name of models) {
  const model = genAI.getGenerativeModel({ model: name, generationConfig: { temperature: 0 } });
  const scores = CVS.map(() => []);
  let failures = 0; let msTotal = 0; let calls = 0; let firstError = '';
  for (let run = 0; run < RUNS; run++) {
    for (const [i, cv] of CVS.entries()) {
      const t0 = Date.now();
      try {
        const res = await model.generateContent(buildPrompt(cv.text, JD));
        const s = parseScore(res.response.text().trim());
        if (s === null) { failures++; firstError ||= `unparseable: ${res.response.text().slice(0, 60)}`; } else scores[i].push(s);
      } catch (e) { failures++; firstError ||= String(e.message).slice(0, 120); }
      msTotal += Date.now() - t0; calls++;
      await sleep(400);
    }
  }
  const mean = scores.map((xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN));
  const spread = scores.map((xs) => (xs.length > 1 ? Math.max(...xs) - Math.min(...xs) : 0));
  const ok = mean.every((m) => !Number.isNaN(m));
  results.push({
    model: name,
    available: ok,
    rankCorrelation: ok ? Number(spearman(CVS.map((c) => c.rank), mean).toFixed(2)) : null,
    maxRepeatSpread: ok ? Number(Math.max(...spread).toFixed(2)) : null,
    failures, avgSeconds: Number((msTotal / calls / 1000).toFixed(1)),
    scores: Object.fromEntries(CVS.map((c, i) => [c.id, Number.isNaN(mean[i]) ? null : Number(mean[i].toFixed(2))])),
    error: firstError || undefined,
  });
  console.log(JSON.stringify(results.at(-1)));
}
