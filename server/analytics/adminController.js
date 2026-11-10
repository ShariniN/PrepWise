// University admin view: adoption and renewal evidence. Counts only, unless includeStudents=1 (which is audited).
import peopleRepo from '../repositories/peopleRepo.js';
import { institutionOf } from '../middleware/tenancy.js';
import { audit } from '../services/audit.js';
import { usageRepo, currentMonth, DEFAULT_MONTHLY_CAP } from '../services/aiUsage.js';
import analyticsRepo from './repo.js';
import { fail } from './access.js';
import * as agg from './aggregate.js';

const days = (n) => new Date(Date.now() - n * agg.DAY_MS);

const gather = async (req) => {
  const institutionId = institutionOf(req);
  const institution = await peopleRepo.getInstitution(institutionId);
  const users = await peopleRepo.findUsers(institutionId, { role: 'student', status: 'active' }, 50000);
  const ids = users.map((u) => String(u._id));
  const month = currentMonth();
  const [active7, active30, calls] = await Promise.all([
    analyticsRepo.activeUserIds(institutionId, ids, days(7)),
    analyticsRepo.activeUserIds(institutionId, ids, days(30)),
    usageRepo.getCalls(institutionId, month),
  ]);
  return { institutionId, institution, users, ids, month, active7, active30, calls };
};

const aiBlock = (g) => {
  const cap = g.institution?.monthlyAiCallCap ?? DEFAULT_MONTHLY_CAP;
  return { month: g.month, calls: g.calls, cap, percentOfCap: cap ? Math.round((g.calls / cap) * 1000) / 10 : null };
};

export const overview = async (req, res) => {
  const g = await gather(req);
  if (!g.institution) return fail(res, 404, 'Institution not found');
  const limit = g.institution.contractedStudentLimit ?? 0;
  const attempts = await analyticsRepo.attemptsForStudents(g.institutionId, g.ids, { kinds: ['submit'] });
  const { excluded } = agg.partitionAttempts(attempts);
  res.json({
    success: true,
    adoption: {
      activeStudents7d: g.active7.length, activeStudents30d: g.active30.length, registeredActiveStudents: g.ids.length,
      contractedStudentLimit: limit,
      percentOfLimitActive30d: limit ? Math.round((g.active30.length / limit) * 1000) / 10 : null,
      contractEnd: g.institution.contractEnd || null,
    },
    improvement: {
      ...agg.improvement({ studentIds: g.ids, attempts }),
      excludedAttempts: excluded,
      definition: 'Mean first vs mean latest eligible practice submission score per student per question, for questions attempted at least twice, across the whole university. Fewer than 5 students showing improvement returns a notice.',
    },
    aiUsage: aiBlock(g),
  });
};

export const evidence = async (req, res) => {
  const includeStudents = req.query.includeStudents === '1';
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  const g = await gather(req);
  if (!g.institution) return fail(res, 404, 'Institution not found');
  const [attempts, interviews, cv] = await Promise.all([
    analyticsRepo.attemptsForStudents(g.institutionId, g.ids, { kinds: ['submit'] }),
    analyticsRepo.interviewsForStudents(g.institutionId, g.ids),
    analyticsRepo.cvCounts(g.institutionId, g.ids),
  ]);
  const subs30 = attempts.filter((a) => new Date(a.createdAt) >= days(30)).length;
  const completed = interviews.filter((i) => i.status === 'completed').length;
  const summary = {
    institution: g.institution.name, generatedAt: new Date().toISOString(), month: g.month,
    registeredActiveStudents: g.ids.length, contractedStudentLimit: g.institution.contractedStudentLimit ?? 0,
    activeStudents7d: g.active7.length, activeStudents30d: g.active30.length,
    practiceSubmissionsTotal: attempts.length, practiceSubmissionsLast30d: subs30,
    mockInterviewsCompleted: completed, cvAnalysesTotal: cv.reduce((n, r) => n + r.count, 0),
    aiCallsThisMonth: g.calls, aiMonthlyCap: g.institution.monthlyAiCallCap ?? DEFAULT_MONTHLY_CAP,
  };
  let students = null;
  if (includeStudents) {
    const active = new Set(g.active30);
    students = g.users.map((u) => {
      const id = String(u._id);
      return {
        name: u.name, email: u.email, active30d: active.has(id),
        practiceSubmissions: attempts.filter((a) => String(a.userId) === id).length,
        mockInterviewsCompleted: interviews.filter((i) => String(i.userId) === id && i.status === 'completed').length,
      };
    }).sort((a, b) => (a.name || '').localeCompare(b.name || '') || (a.email || '').localeCompare(b.email || ''));
    await audit({ actor: req.user.id, action: 'analytics.export.evidence_students', institutionId: g.institutionId, meta: { rows: students.length, format } });
  }
  if (format === 'csv') {
    let text = agg.toCsv(['metric', 'value'], Object.entries(summary));
    if (students) text += `\r\n${agg.toCsv(['student', 'email', 'active_30d', 'practice_submissions', 'mock_interviews_completed'], students.map((s) => [s.name, s.email, s.active30d, s.practiceSubmissions, s.mockInterviewsCompleted]))}`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="evidence-summary.csv"');
    return res.send(text);
  }
  res.json({ success: true, summary, ...(students ? { students } : {}), includesStudents: includeStudents });
};
