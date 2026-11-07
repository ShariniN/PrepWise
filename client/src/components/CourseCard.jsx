import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { ChevronDown } from 'lucide-react';
import api, { errorMessage } from '../api/client';
import { Badge, Button, Card, Field, Input, Textarea } from './ui';

const parseEmails = (text) =>
  [...new Set(text.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@')))];

const CohortRow = ({ courseId, cohort, onChanged }) => {
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [roster, setRoster] = useState(null);
  const [rosterError, setRosterError] = useState('');

  const base = `/api/courses/${courseId}/cohorts/${cohort.id}`;

  const loadRoster = async () => {
    setRosterError('');
    try {
      const { data } = await api.get(`${base}/students`);
      setRoster(data.students || []);
    } catch (error) {
      setRosterError(errorMessage(error, 'Could not load roster'));
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && roster === null) loadRoster();
  };

  const enrol = async (e) => {
    e.preventDefault();
    const list = parseEmails(emails);
    if (!list.length) return toast.error('Paste at least one email address');
    if (list.length > 500) return toast.error('Maximum 500 emails at a time');
    setBusy(true);
    try {
      const { data } = await api.post(`${base}/enrol`, { emails: list });
      setResults(data.results || []);
      toast.success(`${data.enrolled ?? 0} student(s) enrolled`);
      setEmails('');
      loadRoster();
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error, 'Enrolment failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-2xl border border-line bg-paper p-4">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="font-semibold text-ink">{cohort.name}</span>
        <span className="flex items-center gap-2 text-xs text-ink-2">
          {cohort.studentCount ?? 0} students
          <ChevronDown size={16} aria-hidden="true" className={`transition ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          <form onSubmit={enrol} className="space-y-3">
            <Field label="Enrol students by email (one per line, or comma separated)">
              {(p) => <Textarea {...p} rows={3} value={emails} onChange={(e) => setEmails(e.target.value)} />}
            </Field>
            <Button type="submit" size="sm" loading={busy}>{busy ? 'Enrolling...' : 'Enrol'}</Button>
          </form>

          {results && (
            <div className="text-sm">
              <p className="mb-1.5 font-semibold text-ink">Last enrolment result</p>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                {results.map((r) => (
                  <li key={r.email} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate">{r.email}</span>
                    <Badge tone={r.status === 'enrolled' ? 'success' : 'warning'}>{r.status.replace(/_/g, ' ')}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-sm">
            <p className="mb-1.5 font-semibold text-ink">Roster</p>
            {rosterError ? (
              <p role="alert" className="text-danger-600">{rosterError}</p>
            ) : roster === null ? (
              <p className="text-ink-2">Loading...</p>
            ) : roster.length === 0 ? (
              <p className="text-ink-2">No students enrolled yet.</p>
            ) : (
              <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-2xl border border-line bg-surface">
                {roster.map((s) => (
                  <li key={s.id} className="flex justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate">{s.name} <span className="text-ink-2">({s.email})</span></span>
                    <span className="shrink-0 text-ink-2">{s.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  );
};

const CourseCard = ({ course, canManage, isAdmin, onChanged }) => {
  const [cohortName, setCohortName] = useState('');
  const [lecturerEmail, setLecturerEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const addCohort = async (e) => {
    e.preventDefault();
    if (!cohortName.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/courses/${course.id}/cohorts`, { name: cohortName.trim() });
      toast.success('Cohort created');
      setCohortName('');
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error, 'Could not create cohort'));
    } finally {
      setBusy(false);
    }
  };

  const assign = async (e) => {
    e.preventDefault();
    if (!lecturerEmail.trim()) return;
    try {
      const { data } = await api.post(`/api/courses/${course.id}/lecturers`, { email: lecturerEmail.trim() });
      toast.success(data.assigned ? 'Lecturer assigned' : 'Lecturer already has access');
      setLecturerEmail('');
    } catch (error) {
      toast.error(errorMessage(error, 'Could not assign lecturer'));
    }
  };

  return (
    <Card as="article">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-xl font-semibold text-ink">{course.code} <span className="font-normal text-ink-2">{course.title}</span></h3>
        {course.studentCount !== undefined && <Badge tone="neutral">{course.studentCount} students</Badge>}
      </header>
      {course.description && <p className="mt-1 text-sm text-ink-2">{course.description}</p>}

      <h4 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-ink-2">Cohorts</h4>
      {course.cohorts?.length ? (
        <ul className="space-y-2">
          {course.cohorts.map((c) => (
            canManage
              ? <CohortRow key={c.id} courseId={course.id} cohort={c} onChanged={onChanged} />
              : <li key={c.id} className="rounded-2xl border border-line bg-paper p-3 text-sm">{c.name}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-2">No cohorts yet.</p>
      )}

      {canManage && (
        <form onSubmit={addCohort} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field label="New cohort name">
            {(p) => <Input {...p} value={cohortName} onChange={(e) => setCohortName(e.target.value)} placeholder="Group 1" />}
          </Field>
          <Button type="submit" variant="secondary" loading={busy}>Add cohort</Button>
        </form>
      )}

      {isAdmin && (
        <form onSubmit={assign} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field label="Give a lecturer access (email)">
            {(p) => <Input {...p} type="email" value={lecturerEmail} onChange={(e) => setLecturerEmail(e.target.value)} />}
          </Field>
          <Button type="submit" variant="secondary">Assign</Button>
        </form>
      )}
    </Card>
  );
};

export default CourseCard;
