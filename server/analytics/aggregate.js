// Pure aggregation functions over plain arrays. No database, no clock (callers pass `now`), so they are
// easy to test with fakes. Every function returns plain JSON-safe objects.
//
// Score eligibility: only submitted attempts with a numeric score whose scoreSource is not 'ai' (unconfirmed
// AI suggestion) or 'fallback' count. Tests-marked and human-confirmed scores count. `excluded` is always returned.

export const MIN_N = 5; // below this many students we return a notice, never percentages
export const DAY_MS = 24 * 60 * 60 * 1000;

const sid = (v) => String(v);
const time = (d) => new Date(d).getTime();
const round = (n, p = 1) => (n == null || Number.isNaN(n) ? null : Math.round(n * 10 ** p) / 10 ** p);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export const insufficient = (n, extra = {}) => ({
  insufficientData: true, n, minimum: MIN_N,
  notice: `Only ${n} student(s) have data here. At least ${MIN_N} are needed before percentages are shown.`,
  ...extra,
});

const isUnconfirmedAi = (a) => a.runKind === 'submit' && a.needsReview && a.review?.aiSuggestion && !a.review?.final;
export const isScored = (a) => a.runKind === 'submit' && typeof a.score === 'number';
export const isExcluded = (a) =>
  (isScored(a) && (a.scoreSource === 'ai' || a.scoreSource === 'fallback')) || isUnconfirmedAi(a);

// Splits attempts into those usable for analytics and a count of those left out.
export const partitionAttempts = (attempts) => {
  const eligible = [];
  let excluded = 0;
  for (const a of attempts) {
    if (isExcluded(a)) excluded += 1;
    else if (isScored(a)) eligible.push(a);
  }
  return { eligible, excluded };
};

const byTime = (a, b) => time(a.createdAt) - time(b.createdAt) || cmp(sid(a._id ?? ''), sid(b._id ?? ''));

// Best eligible score per student per question: Map(userId -> Map(questionId -> best))
export const bestScores = (eligible) => {
  const out = new Map();
  for (const a of eligible) {
    const u = sid(a.userId);
    if (!out.has(u)) out.set(u, new Map());
    const m = out.get(u);
    const q = sid(a.questionId);
    m.set(q, Math.max(m.get(q) ?? -1, a.score));
  }
  return out;
};

// ---------------------------------------------------------------- failure patterns
export const failurePatterns = ({ questions, tests, attempts, scopeStudentIds }) => {
  const ids = new Set(scopeStudentIds.map(sid));
  const items = [];
  let excluded = 0;
  for (const q of [...questions].sort((a, b) => cmp(a.title, b.title) || cmp(sid(a._id), sid(b._id)))) {
    if (!['coding', 'debug'].includes(q.type)) continue;
    const all = attempts.filter((a) => a.runKind === 'submit' && sid(a.questionId) === sid(q._id) && ids.has(sid(a.userId)));
    const subs = all.filter((a) => !isExcluded(a));
    excluded += all.length - subs.length;
    if (!subs.length) continue;
    const latest = new Map();
    for (const a of [...subs].sort(byTime)) latest.set(sid(a.userId), a);
    const n = latest.size;
    if (n < MIN_N) { items.push(insufficient(n, { questionId: sid(q._id), title: q.title })); continue; }
    const qTests = tests[sid(q._id)] || [];
    const last = [...latest.values()];
    const failing = last.filter((a) => a.verdict !== 'accepted').length;
    const perTest = qTests.map((t, i) => {
      const failed = last.filter((a) => {
        const r = (a.perTest || [])[i];
        return r && !r.passed;
      }).length;
      return {
        index: i + 1, testId: sid(t._id), visible: !!t.visible, failCount: failed, failPercent: round((failed / n) * 100),
        input: t.input ?? null, expectedOutput: t.expectedOutput ?? null,
      };
    }).sort((a, b) => b.failCount - a.failCount || a.index - b.index);
    const verdicts = {};
    for (const a of last) verdicts[a.verdict] = (verdicts[a.verdict] || 0) + 1;
    items.push({
      questionId: sid(q._id), title: q.title, n, failingStudents: failing, failingPercent: round((failing / n) * 100),
      verdicts, tests: perTest,
    });
  }
  items.sort((a, b) => (a.insufficientData ? 1 : 0) - (b.insufficientData ? 1 : 0)
    || (b.failingPercent ?? 0) - (a.failingPercent ?? 0) || cmp(a.title, b.title));
  return { questions: items, excluded };
};

// ---------------------------------------------------------------- topic heat map
// Rows are students, columns are topics. Cell = mean (over questions in the topic) of the student's best score, null if none.
// Order is deterministic: rows by overall mean desc (nulls last) then name then id; columns by column mean desc then topic name.
export const topicHeatmap = ({ students, questions, attempts }) => {
  const { eligible, excluded } = partitionAttempts(attempts);
  const best = bestScores(eligible);
  const topicOf = new Map();
  for (const q of questions) topicOf.set(sid(q._id), q.topic && q.topic.length ? q.topic : ['untagged']);
  const topics = new Set();
  const cells = new Map(); // `${u}|${topic}` -> [scores]
  for (const s of students) {
    const mine = best.get(sid(s._id));
    if (!mine) continue;
    for (const [qid, score] of mine) {
      for (const t of topicOf.get(qid) || []) {
        topics.add(t);
        const k = `${sid(s._id)}|${t}`;
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(score);
      }
    }
  }
  const colStats = [...topics].map((t) => {
    const vals = students.map((s) => mean(cells.get(`${sid(s._id)}|${t}`) || [])).filter((v) => v != null);
    return {
      topic: t, mean: round(mean(vals)), studentsWithData: vals.length, studentsTotal: students.length,
      belowFiftyPercent: vals.length ? round((vals.filter((v) => v < 50).length / vals.length) * 100) : null, _m: mean(vals),
    };
  }).sort((a, b) => (b._m ?? -1) - (a._m ?? -1) || cmp(a.topic, b.topic));
  const columns = colStats.map(({ _m, ...c }) => c);
  const rows = students.map((s) => {
    const values = columns.map((c) => {
      const v = mean(cells.get(`${sid(s._id)}|${c.topic}`) || []);
      return v == null ? null : round(v);
    });
    const present = values.filter((v) => v != null);
    return { studentId: sid(s._id), name: s.name, values, mean: round(mean(present)), _m: mean(present) };
  }).sort((a, b) => (b._m ?? -1) - (a._m ?? -1) || cmp(a.name || '', b.name || '') || cmp(a.studentId, b.studentId))
    .map(({ _m, ...r }) => r);
  return { topics: columns.map((c) => c.topic), columns, rows, excluded };
};

// ---------------------------------------------------------------- students needing help
export const HELP_DEFAULTS = { inactiveDays: 14, declineWindow: 3, declineMin: 10, compileErrors: 3, compileWindow: 5 };

export const studentsNeedingHelp = ({ students, questions, attempts, now = new Date(), opts = {} }) => {
  const o = { ...HELP_DEFAULTS, ...opts };
  const topicOf = new Map(questions.map((q) => [sid(q._id), q.topic && q.topic.length ? q.topic : ['untagged']]));
  const { excluded } = partitionAttempts(attempts);
  const out = [];
  for (const s of students) {
    const mine = attempts.filter((a) => sid(a.userId) === sid(s._id)).sort(byTime);
    const subs = mine.filter((a) => a.runKind === 'submit');
    const reasons = [];
    if (!subs.length) {
      reasons.push({
        code: 'never_submitted', hadRuns: mine.length > 0,
        message: mine.length ? 'Has run code but never submitted' : 'Has never submitted a solution',
      });
    } else {
      const lastAt = subs[subs.length - 1].createdAt;
      const days = Math.floor((time(now) - time(lastAt)) / DAY_MS);
      if (days >= o.inactiveDays) {
        reasons.push({ code: 'no_recent_attempts', message: `No submissions in ${days} days`, days, threshold: o.inactiveDays, lastSubmissionAt: new Date(lastAt).toISOString() });
      }
    }
    // Declining on a topic: the last N scored submissions on the topic strictly fall, by at least declineMin overall.
    const byTopic = new Map();
    for (const a of subs.filter((x) => isScored(x) && !isExcluded(x))) {
      for (const t of topicOf.get(sid(a.questionId)) || []) {
        if (!byTopic.has(t)) byTopic.set(t, []);
        byTopic.get(t).push(a.score);
      }
    }
    for (const t of [...byTopic.keys()].sort()) {
      const last = byTopic.get(t).slice(-o.declineWindow);
      if (last.length === o.declineWindow && last.every((v, i) => i === 0 || v < last[i - 1]) && last[0] - last[last.length - 1] >= o.declineMin) {
        reasons.push({ code: 'declining_topic', message: `Declining over last ${o.declineWindow} attempt sets on topic ${t}`, topic: t, scores: last });
      }
    }
    const recent = subs.slice(-o.compileWindow);
    const ce = recent.filter((a) => a.verdict === 'compile_error').length;
    if (ce >= o.compileErrors) {
      reasons.push({ code: 'repeated_compile_errors', message: `${ce} compile errors in the last ${recent.length} submissions`, count: ce, window: recent.length });
    }
    if (reasons.length) out.push({ studentId: sid(s._id), name: s.name, email: s.email, reasons });
  }
  // alphabetical, deliberately not ranked
  out.sort((a, b) => cmp((a.name || '').toLowerCase(), (b.name || '').toLowerCase()) || cmp(a.studentId, b.studentId));
  return { students: out, thresholds: o, excluded };
};

// ---------------------------------------------------------------- question quality
// Discrimination index D = pass rate of the top quartile minus pass rate of the bottom quartile, where students are
// ranked by their mean best score on the OTHER questions (so the question does not rank its own takers).
// A student "passes" a question when any eligible submission is accepted. Quartile size = max(1, floor(m/4)).
export const discrimination = ({ ability, passed }) => {
  // ability: Map(userId -> number), passed: Set(userId); both limited to students who attempted the question
  const ranked = [...ability.entries()].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]));
  const m = ranked.length;
  if (m < MIN_N) return { index: null, topQuartilePassRate: null, bottomQuartilePassRate: null, ranked: m };
  const k = Math.max(1, Math.floor(m / 4));
  const rate = (slice) => slice.filter(([u]) => passed.has(u)).length / slice.length;
  const top = rate(ranked.slice(0, k));
  const bottom = rate(ranked.slice(m - k));
  return { index: round(top - bottom, 2), topQuartilePassRate: round(top, 2), bottomQuartilePassRate: round(bottom, 2), ranked: m };
};

export const questionQuality = ({ students, questions, attempts, overExposurePct = 90 }) => {
  const ids = new Set(students.map((s) => sid(s._id)));
  const scoped = attempts.filter((a) => ids.has(sid(a.userId)));
  const { eligible, excluded } = partitionAttempts(scoped);
  const best = bestScores(eligible);
  const items = [];
  for (const q of [...questions].sort((a, b) => cmp(a.title, b.title) || cmp(sid(a._id), sid(b._id)))) {
    const qid = sid(q._id);
    const touched = scoped.filter((a) => sid(a.questionId) === qid);
    if (!touched.length) continue;
    const submits = touched.filter((a) => a.runKind === 'submit');
    const takers = new Set(submits.map((a) => sid(a.userId)));
    const usage = { studentsAttempted: new Set(touched.map((a) => sid(a.userId))).size, studentsInScope: students.length };
    usage.percentOfScope = students.length ? round((usage.studentsAttempted / students.length) * 100) : 0;
    usage.overExposed = usage.percentOfScope >= overExposurePct && students.length >= MIN_N;
    if (takers.size < MIN_N) { items.push(insufficient(takers.size, { questionId: qid, title: q.title, attempts: submits.length, usage })); continue; }
    const passedSet = new Set(eligible.filter((a) => sid(a.questionId) === qid && a.verdict === 'accepted').map((a) => sid(a.userId)));
    const ability = new Map();
    for (const u of takers) {
      const others = [...(best.get(u) || new Map()).entries()].filter(([k]) => k !== qid).map(([, v]) => v);
      if (others.length) ability.set(u, mean(others));
    }
    const d = discrimination({ ability, passed: new Set([...passedSet].filter((u) => ability.has(u))) });
    // time to solve: first touch of the question (draft, run or submit) to the first accepted submit
    const times = [];
    for (const u of passedSet) {
      const mine = touched.filter((a) => sid(a.userId) === u).sort(byTime);
      const solved = mine.find((a) => a.runKind === 'submit' && a.verdict === 'accepted' && !isExcluded(a));
      if (solved) times.push((time(solved.createdAt) - time(mine[0].createdAt)) / 60000);
    }
    items.push({
      questionId: qid, title: q.title, topic: q.topic || [], difficulty: q.difficulty || null,
      attempts: submits.length, students: takers.size, passRatePercent: round((passedSet.size / takers.size) * 100),
      discriminationIndex: d.index, topQuartilePassRate: d.topQuartilePassRate, bottomQuartilePassRate: d.bottomQuartilePassRate,
      rankedStudents: d.ranked, medianMinutesToSolve: round(median(times)), solvers: times.length,
      flags: {
        maybeBadlyWorded: d.topQuartilePassRate != null && d.topQuartilePassRate < 0.5,
        lowDiscrimination: d.index != null && d.index < 0.1,
      },
      usage,
    });
  }
  return { questions: items, excluded };
};

// ---------------------------------------------------------------- activity
export const activityByDay = ({ attempts, studentIds, now = new Date(), days = 30 }) => {
  const ids = new Set(studentIds.map(sid));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const counts = new Map();
  for (let i = days - 1; i >= 0; i--) {
    counts.set(new Date(end.getTime() - i * DAY_MS).toISOString().slice(0, 10), { attempts: 0, submissions: 0, students: new Set() });
  }
  for (const a of attempts) {
    if (a.runKind === 'draft' || !ids.has(sid(a.userId))) continue;
    const d = counts.get(new Date(a.createdAt).toISOString().slice(0, 10));
    if (!d) continue;
    d.attempts += 1;
    if (a.runKind === 'submit') d.submissions += 1;
    d.students.add(sid(a.userId));
  }
  return [...counts.entries()].map(([date, v]) => ({ date, attempts: v.attempts, submissions: v.submissions, activeStudents: v.students.size }));
};

// ---------------------------------------------------------------- careers
export const CATS = ['behavioralSkills', 'technicalKnowledge', 'codingAbility', 'communication'];
// An interview is fallback-sourced when any of its scored responses came from the basic fallback scorer.
export const interviewIsFallback = (iv) => (iv.responses || []).some((r) => r.feedback?.source === 'fallback');

export const readinessRows = ({ students, cvCounts, interviews, attempts }) => {
  const { eligible } = partitionAttempts(attempts);
  const solved = new Map();
  for (const a of eligible) {
    if (a.verdict !== 'accepted') continue;
    const u = sid(a.userId);
    if (!solved.has(u)) solved.set(u, new Set());
    solved.get(u).add(sid(a.questionId));
  }
  let excludedInterviews = 0;
  const rows = students.map((s) => {
    const u = sid(s._id);
    const ivs = interviews.filter((i) => sid(i.userId) === u && i.status === 'completed');
    const good = ivs.filter((i) => !interviewIsFallback(i));
    excludedInterviews += ivs.length - good.length;
    const avg = {};
    for (const c of CATS) {
      avg[c] = round(mean(good.map((i) => i.overallFeedback?.feedback?.categoryScores?.[c]).filter((v) => typeof v === 'number')));
    }
    return {
      studentId: u, name: s.name, email: s.email,
      cvAnalyses: cvCounts.get(u) || 0, mockInterviewsCompleted: ivs.length, mockInterviewsScored: good.length,
      practiceSolved: solved.get(u)?.size || 0, interviewAverages: avg,
    };
  }).sort((a, b) => cmp((a.name || '').toLowerCase(), (b.name || '').toLowerCase()) || cmp(a.studentId, b.studentId));
  return { rows, excludedInterviews };
};

export const coverage = (rows) => {
  const n = rows.length;
  const pct = (k) => (n ? round((rows.filter(k).length / n) * 100) : null);
  return {
    students: n,
    withCvAnalysisPercent: pct((r) => r.cvAnalyses >= 1),
    withMockInterviewPercent: pct((r) => r.mockInterviewsCompleted >= 1),
    withBothPercent: pct((r) => r.cvAnalyses >= 1 && r.mockInterviewsCompleted >= 1),
    withPracticeSolvedPercent: pct((r) => r.practiceSolved >= 1),
  };
};

export const meanAverages = (rows) => {
  const out = {};
  for (const c of CATS) out[c] = round(mean(rows.map((r) => r.interviewAverages[c]).filter((v) => v != null)));
  return out;
};

// Skills gap: latest assessment per student; per skill mean proficiency (1-10). A "gap" is a mean below `threshold`.
export const skillsGap = ({ assessments, threshold = 5, minStudents = MIN_N }) => {
  const latest = new Map();
  for (const a of [...assessments].sort(byTime)) latest.set(sid(a.userId), a);
  const students = latest.size;
  if (students < MIN_N) return insufficient(students);
  const bySkill = new Map();
  for (const a of latest.values()) {
    for (const s of a.skills || []) {
      const k = String(s.name || '').trim().toLowerCase();
      if (!k || typeof s.proficiencyLevel !== 'number') continue;
      if (!bySkill.has(k)) bySkill.set(k, { skill: s.name.trim(), category: s.category || 'General', levels: [] });
      bySkill.get(k).levels.push(s.proficiencyLevel);
    }
  }
  const skills = [...bySkill.values()].filter((s) => s.levels.length >= minStudents)
    .map((s) => ({ skill: s.skill, category: s.category, students: s.levels.length, meanProficiency: round(mean(s.levels)), belowThreshold: mean(s.levels) < threshold }))
    .sort((a, b) => a.meanProficiency - b.meanProficiency || cmp(a.skill.toLowerCase(), b.skill.toLowerCase()));
  return { students, threshold, minStudentsPerSkill: minStudents, gaps: skills.filter((s) => s.belowThreshold), skills };
};

// ---------------------------------------------------------------- admin
// First vs latest scored submission per student per question (questions with 2+ eligible submissions), averaged.
export const improvement = ({ studentIds, attempts }) => {
  const ids = new Set(studentIds.map(sid));
  const { eligible, excluded } = partitionAttempts(attempts.filter((a) => ids.has(sid(a.userId))));
  const groups = new Map();
  for (const a of [...eligible].sort(byTime)) {
    const k = `${sid(a.userId)}|${sid(a.questionId)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a.score);
  }
  const firsts = []; const lasts = []; const students = new Set();
  for (const [k, scores] of groups) {
    if (scores.length < 2) continue;
    firsts.push(scores[0]); lasts.push(scores[scores.length - 1]); students.add(k.split('|')[0]);
  }
  if (students.size < MIN_N) return insufficient(students.size, { excluded });
  return { students: students.size, pairs: firsts.length, meanFirst: round(mean(firsts)), meanLatest: round(mean(lasts)), delta: round(mean(lasts) - mean(firsts)), excluded };
};

export const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // blocks spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (header, rows) => `${[header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
