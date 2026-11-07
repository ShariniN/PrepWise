import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ArrowLeft } from 'lucide-react';
import AppShell from '../components/AppShell';
import { Button, Card, Skeleton, StatusPill } from '../components/ui';
import CourseCohortPicker from '../components/analytics/CourseCohortPicker';
import QuestionPicker from '../components/assessment/QuestionPicker';
import AccommodationsTable from '../components/assessment/AccommodationsTable';
import api, { errorMessage } from '../api/client';
import { getAssessment, createAssessment, updateAssessment } from '../api/assessments';

const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const toIso = (local) => (local ? new Date(local).toISOString() : '');

const EMPTY = {
  title: '', instructions: '', courseId: '', cohortId: '', questionIds: [], opensAt: '', closesAt: '',
  durationMinutes: 60, attemptsAllowed: 1, integrityLevel: 0, shuffleQuestions: true, releaseResults: false,
};

const fieldCls = 'w-full rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm text-ink transition hover:border-primary-300 focus:border-primary-600 focus:outline-none focus:ring-4 focus:ring-primary-600/15 disabled:cursor-not-allowed disabled:bg-sand disabled:opacity-70';
const Field = ({ label, children, hint }) => (
  <label className="block text-sm text-ink">
    <span className="mb-1.5 block font-medium">{label}</span>{children}
    {hint && <span className="mt-1.5 block text-xs text-ink-2">{hint}</span>}
  </label>
);
const checkCls = 'h-5 w-5 rounded border-line accent-primary-600';

const AssessmentEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const [form, setForm] = useState(EMPTY);
  const [saved, setSaved] = useState(null); // staff view from the server
  const [meta, setMeta] = useState({});
  const [students, setStudents] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const mergeMeta = useCallback((m) => setMeta((cur) => ({ ...cur, ...m })), []);

  useEffect(() => {
    if (isNew) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { assessment: a } = await getAssessment(id);
        if (cancelled) return;
        setSaved(a);
        mergeMeta(Object.fromEntries((a.questions || []).map((q) => [q.id, { title: q.title, type: q.type, variantGroup: '' }])));
        setForm({
          title: a.title, instructions: a.instructions || '', courseId: a.courseId, cohortId: a.cohortId || '',
          questionIds: a.questionIds || [], opensAt: toLocalInput(a.opensAt), closesAt: toLocalInput(a.closesAt),
          durationMinutes: a.durationMinutes, attemptsAllowed: a.attemptsAllowed, integrityLevel: a.integrityLevel,
          shuffleQuestions: a.shuffleQuestions, releaseResults: a.releaseResults,
        });
      } catch (e) { if (!cancelled) setLoadError(errorMessage(e, 'Could not load this assessment')); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id, isNew, mergeMeta]);

  // Students for the accommodations table (selected cohort, or every cohort of the course).
  useEffect(() => {
    if (isNew || !form.courseId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        let cohortIds = form.cohortId ? [form.cohortId] : [];
        if (!cohortIds.length) {
          const { data } = await api.get(`/api/courses/${form.courseId}`);
          cohortIds = (data.course?.cohorts || []).map((c) => c.id);
        }
        const lists = await Promise.all(cohortIds.map((c) => api.get(`/api/courses/${form.courseId}/cohorts/${c}/students`).then((r) => r.data.students || [])));
        const seen = new Map();
        lists.flat().forEach((s) => seen.set(s.id, s));
        if (!cancelled) setStudents([...seen.values()]);
      } catch { if (!cancelled) setStudents([]); }
    })();
    return () => { cancelled = true; };
  }, [isNew, form.courseId, form.cohortId]);

  const closed = saved?.effectiveStatus === 'closed';

  const save = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) return setError('Give the assessment a title.');
    if (!form.courseId) return setError('Choose a course.');
    if (form.questionIds.length === 0) return setError('Add at least one question.');
    if (!form.opensAt || !form.closesAt) return setError('Set when it opens and closes.');
    if (new Date(form.closesAt) <= new Date(form.opensAt)) return setError('It must close after it opens.');
    const body = {
      title: form.title.trim(), instructions: form.instructions, questionIds: form.questionIds,
      opensAt: toIso(form.opensAt), closesAt: toIso(form.closesAt), durationMinutes: Number(form.durationMinutes),
      attemptsAllowed: Number(form.attemptsAllowed), integrityLevel: Number(form.integrityLevel),
      shuffleQuestions: form.shuffleQuestions, releaseResults: form.releaseResults,
    };
    setBusy(true);
    try {
      if (isNew) {
        const d = await createAssessment({ ...body, courseId: form.courseId, ...(form.cohortId ? { cohortId: form.cohortId } : {}) });
        toast.success('Assessment created as a draft');
        navigate(`/assessments/manage/${d.assessment.id}`);
      } else {
        // Send only what changed: after a student has started, the server rejects most fields.
        const same = {
          opensAt: (v) => Date.parse(v) === Date.parse(saved.opensAt),
          closesAt: (v) => Date.parse(v) === Date.parse(saved.closesAt),
          questionIds: (v) => JSON.stringify(v) === JSON.stringify(saved.questionIds),
        };
        const diff = Object.fromEntries(Object.entries(body).filter(([k, v]) => !(same[k] ? same[k](v) : v === (saved[k] ?? ''))));
        if (Object.keys(diff).length === 0) { toast.info('Nothing to save'); return; }
        const d = await updateAssessment(id, diff);
        setSaved((s) => ({ ...s, ...d.assessment })); toast.success('Saved');
      }
    } catch (err) { setError(errorMessage(err, 'Could not save')); } finally { setBusy(false); }
  };

  if (loadError) return <AppShell width="narrow"><Card role="alert" tone="sand" className="text-danger-700">{loadError}</Card></AppShell>;
  if (loading) return <AppShell width="narrow"><Card role="status" aria-label="Loading" className="space-y-3"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-32 w-full" /></Card></AppShell>;

  return (
    <AppShell
      width="default"
      eyebrow="Lecturer"
      title={isNew ? 'New assessment' : 'Edit assessment'}
      actions={<Button as={Link} to="/assessments/manage" variant="ghost" size="sm" icon={<ArrowLeft size={16} aria-hidden="true" />}>All assessments</Button>}
    >
      <div className="space-y-5">
        <Card as="form" onSubmit={save} className="space-y-6">
          {saved && <p className="text-sm text-ink-2">Status: <StatusPill tone={{ open: 'success', scheduled: 'primary' }[saved.effectiveStatus] || 'neutral'}>{saved.effectiveStatus}</StatusPill> Once a student has started, only the title, instructions and result release can change.</p>}
          {closed && <p className="rounded-2xl bg-sun-50 p-3 text-sm text-ink">This assessment is closed and can no longer be edited.</p>}

          <Field label="Title"><input className={fieldCls} value={form.title} maxLength={200} disabled={closed} onChange={(e) => set({ title: e.target.value })} /></Field>
          <Field label="Instructions (shown before starting, Markdown allowed)">
            <textarea className={fieldCls} rows={4} value={form.instructions} disabled={closed} onChange={(e) => set({ instructions: e.target.value })} />
          </Field>

          {isNew ? (
            <CourseCohortPicker value={{ courseId: form.courseId, cohortId: form.cohortId }} onChange={(v) => set(v)} />
          ) : (
            <p className="text-sm text-ink-2">Course and cohort cannot be changed after creation.</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Opens"><input type="datetime-local" className={fieldCls} value={form.opensAt} disabled={closed} onChange={(e) => set({ opensAt: e.target.value })} /></Field>
            <Field label="Closes"><input type="datetime-local" className={fieldCls} value={form.closesAt} disabled={closed} onChange={(e) => set({ closesAt: e.target.value })} /></Field>
            <Field label="Duration (minutes)" hint="1 to 600. Capped by the closing time."><input type="number" min="1" max="600" className={fieldCls} value={form.durationMinutes} disabled={closed} onChange={(e) => set({ durationMinutes: e.target.value })} /></Field>
            <Field label="Attempts allowed" hint="1 to 5"><input type="number" min="1" max="5" className={fieldCls} value={form.attemptsAllowed} disabled={closed} onChange={(e) => set({ attemptsAllowed: e.target.value })} /></Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Integrity level" hint="Level 1 reports browser signals only (tab changes, full screen, paste, edit timing). No camera, microphone or screen capture. Students are told before they start.">
              <select className={fieldCls} value={form.integrityLevel} disabled={closed} onChange={(e) => set({ integrityLevel: Number(e.target.value) })}>
                <option value={0}>0 - none</option>
                <option value={1}>1 - browser signals</option>
              </select>
            </Field>
            <div className="space-y-3 sm:pt-7">
              <label className="flex items-center gap-3 text-sm text-ink"><input type="checkbox" className={checkCls} checked={form.shuffleQuestions} disabled={closed} onChange={(e) => set({ shuffleQuestions: e.target.checked })} /> Shuffle question order per student</label>
              <label className="flex items-center gap-3 text-sm text-ink"><input type="checkbox" className={checkCls} checked={form.releaseResults} disabled={closed} onChange={(e) => set({ releaseResults: e.target.checked })} /> Release results to students</label>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-2 font-display text-lg font-semibold text-ink">Questions</legend>
            <QuestionPicker selected={form.questionIds} meta={meta} onChange={(ids) => set({ questionIds: ids })} onMeta={mergeMeta} disabled={closed} />
          </fieldset>

          {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
          <div className="flex gap-3">
            <Button type="submit" disabled={closed} loading={busy}>
              {busy ? 'Saving...' : isNew ? 'Create draft' : 'Save changes'}
            </Button>
          </div>
        </Card>

        {saved && (
          <Card as="section" className="space-y-3">
            <h2 className="font-display text-xl font-semibold text-ink">Accommodations</h2>
            <AccommodationsTable assessment={saved} students={students} locked={closed} onChanged={(a) => setSaved((s) => ({ ...s, ...a }))} />
          </Card>
        )}
        {saved?.effectiveThresholds && (
          <Card as="section" tone="sand" className="space-y-2">
            <h2 className="font-display text-xl font-semibold text-ink">When a session is shown to reviewers</h2>
            <p className="text-sm text-ink-2">A session is listed for review when it passes one of these limits. They are reasons to look, not findings.</p>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              {Object.entries(saved.effectiveThresholds).map(([k, v]) => (<div key={k} className="rounded-2xl bg-surface px-4 py-3"><dt className="text-xs text-ink-2">{k}</dt><dd className="font-semibold text-ink">{String(v)}</dd></div>))}
            </dl>
          </Card>
        )}
      </div>
    </AppShell>
  );
};

export default AssessmentEditor;
