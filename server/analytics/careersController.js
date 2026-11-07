// Career officer views: institution-wide aggregates and per-student readiness. Never code, CV text or hidden tests.
import courseRepo from '../repositories/courseRepo.js';
import { institutionOf } from '../middleware/tenancy.js';
import { audit } from '../services/audit.js';
import analyticsRepo from './repo.js';
import { fail, isId, studentsOf, intParam } from './access.js';
import * as agg from './aggregate.js';

// Builds [{ course, cohort, students }] for every cohort in the institution (optionally one course / cohort).
const loadScope = async (req, res) => {
  const institutionId = institutionOf(req);
  const { courseId, cohortId } = req.query;
  let courses = await courseRepo.listCourses(institutionId);
  if (courseId) {
    courses = isId(courseId) ? courses.filter((c) => String(c._id) === String(courseId)) : [];
    if (!courses.length) { fail(res, 404, 'Course not found'); return null; }
  }
  let cohorts = courses.length ? await courseRepo.listCohorts(institutionId, courses.map((c) => c._id)) : [];
  if (cohortId) {
    cohorts = cohorts.filter((h) => String(h._id) === String(cohortId));
    if (!cohorts.length) { fail(res, 404, 'Cohort not found'); return null; }
  }
  const { students, enrolments } = await studentsOf(institutionId, { courseIds: courses.map((c) => c._id) });
  const byId = new Map(students.map((s) => [String(s._id), s]));
  const memberships = cohorts.map((h) => ({
    course: courses.find((c) => String(c._id) === String(h.courseId)),
    cohort: h,
    students: [...new Set(enrolments.filter((e) => String(e.cohortId) === String(h._id)).map((e) => String(e.userId)))]
      .map((id) => byId.get(id)).filter(Boolean),
  }));
  const inScope = new Map();
  for (const m of memberships) for (const s of m.students) inScope.set(String(s._id), s);
  return { institutionId, courses, memberships, allStudents: [...inScope.values()] };
};

const buildReadiness = async (scope) => {
  const ids = scope.allStudents.map((s) => String(s._id));
  const [cv, interviews, attempts] = await Promise.all([
    analyticsRepo.cvCounts(scope.institutionId, ids),
    analyticsRepo.interviewsForStudents(scope.institutionId, ids),
    analyticsRepo.attemptsForStudents(scope.institutionId, ids, { kinds: ['submit'] }),
  ]);
  const cvCounts = new Map(cv.map((r) => [String(r.userId), r.count]));
  const { rows, excludedInterviews } = agg.readinessRows({ students: scope.allStudents, cvCounts, interviews, attempts });
  const { excluded } = agg.partitionAttempts(attempts);
  return { rows: new Map(rows.map((r) => [r.studentId, r])), excludedInterviews, excludedAttempts: excluded };
};

const programmes = (scope, readiness, { withStudents }) => scope.courses.map((c) => ({
  courseId: String(c._id), code: c.code, title: c.title,
  cohorts: scope.memberships.filter((m) => String(m.course._id) === String(c._id)).map((m) => {
    const rows = m.students.map((s) => readiness.rows.get(String(s._id))).filter(Boolean)
      .sort((a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase()) || a.studentId.localeCompare(b.studentId));
    const { students: studentCount, ...cov } = agg.coverage(rows);
    return {
      cohortId: String(m.cohort._id), name: m.cohort.name, studentCount, ...cov,
      ...(withStudents ? { meanInterviewAverages: agg.meanAverages(rows), students: rows } : {}),
    };
  }),
}));

export const readiness = async (req, res) => {
  const scope = await loadScope(req, res);
  if (!scope) return;
  const r = await buildReadiness(scope);
  res.json({
    success: true, programmes: programmes(scope, r, { withStudents: true }),
    excluded: { fallbackInterviews: r.excludedInterviews, unconfirmedOrFallbackAttempts: r.excludedAttempts },
    note: 'Interview averages are means of completed mock interviews whose scores were not produced by the basic fallback scorer. No code, CV text or hidden tests are included.',
  });
};

export const coverage = async (req, res) => {
  const scope = await loadScope(req, res);
  if (!scope) return;
  const r = await buildReadiness(scope);
  const all = scope.allStudents.map((s) => r.rows.get(String(s._id))).filter(Boolean);
  const prog = programmes(scope, r, { withStudents: false }).map((p) => ({
    ...p,
    cohorts: p.cohorts.map(({ withPracticeSolvedPercent, ...c }) => c), // practice coverage is shown on the readiness table only
  }));
  res.json({ success: true, institution: agg.coverage(all), programmes: prog });
};

export const readinessCsv = async (req, res) => {
  const scope = await loadScope(req, res);
  if (!scope) return;
  const r = await buildReadiness(scope);
  const header = ['programme', 'cohort', 'student', 'email', 'cv_analyses', 'mock_interviews_completed', 'practice_solved',
    'avg_behavioral', 'avg_technical', 'avg_coding', 'avg_communication'];
  const lines = [];
  for (const m of scope.memberships) {
    for (const s of m.students) {
      const row = r.rows.get(String(s._id));
      if (!row) continue;
      const a = row.interviewAverages;
      lines.push([m.course.code, m.cohort.name, row.name, row.email, row.cvAnalyses, row.mockInterviewsCompleted, row.practiceSolved,
        a.behavioralSkills, a.technicalKnowledge, a.codingAbility, a.communication]);
    }
  }
  lines.sort((x, y) => String(x[0]).localeCompare(String(y[0])) || String(x[1]).localeCompare(String(y[1])) || String(x[2]).localeCompare(String(y[2])));
  await audit({ actor: req.user.id, action: 'analytics.export.readiness', institutionId: scope.institutionId, meta: { rows: lines.length } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="readiness.csv"');
  res.send(agg.toCsv(header, lines));
};

export const skillsGap = async (req, res) => {
  const scope = await loadScope(req, res);
  if (!scope) return;
  const ids = scope.allStudents.map((s) => String(s._id));
  const assessments = await analyticsRepo.skillAssessments(scope.institutionId, ids);
  const threshold = intParam(req.query.threshold, 5, 1, 10);
  res.json({
    success: true, ...agg.skillsGap({ assessments, threshold }),
    note: 'Uses each student latest skills assessment (self-reported proficiency 1-10 from the CV skills analysis). A gap is a skill whose mean proficiency is below the threshold; skills shared by fewer than 5 students are not shown.',
  });
};
