import React, { useState } from 'react';
import { toast } from 'react-toastify';
import api, { errorMessage } from '../api/client';

const inputCls = 'w-full bg-gray-100 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400';
const btnCls = 'px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60';

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
    <li className="border border-gray-200 rounded-lg p-3">
      <button type="button" onClick={toggle} aria-expanded={open} className="w-full flex items-center justify-between text-left">
        <span className="font-medium text-gray-800">{cohort.name}</span>
        <span className="text-xs text-gray-500">{cohort.studentCount ?? 0} students</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <form onSubmit={enrol}>
            <label htmlFor={`enrol-${cohort.id}`} className="block text-sm font-medium text-gray-700 mb-1">
              Enrol students by email (one per line, or comma separated)
            </label>
            <textarea id={`enrol-${cohort.id}`} rows={3} className={inputCls} value={emails} onChange={(e) => setEmails(e.target.value)} />
            <button type="submit" disabled={busy} className={`${btnCls} mt-2`}>{busy ? 'Enrolling...' : 'Enrol'}</button>
          </form>

          {results && (
            <div className="text-sm">
              <p className="font-medium text-gray-700 mb-1">Last enrolment result</p>
              <ul className="divide-y border rounded-md">
                {results.map((r) => (
                  <li key={r.email} className="flex justify-between px-2 py-1">
                    <span className="truncate">{r.email}</span>
                    <span className={r.status === 'enrolled' ? 'text-green-700' : 'text-amber-700'}>{r.status.replace(/_/g, ' ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-sm">
            <p className="font-medium text-gray-700 mb-1">Roster</p>
            {rosterError ? (
              <p role="alert" className="text-red-600">{rosterError}</p>
            ) : roster === null ? (
              <p className="text-gray-500">Loading...</p>
            ) : roster.length === 0 ? (
              <p className="text-gray-500">No students enrolled yet.</p>
            ) : (
              <ul className="divide-y border rounded-md max-h-48 overflow-y-auto">
                {roster.map((s) => (
                  <li key={s.id} className="flex justify-between px-2 py-1">
                    <span className="truncate">{s.name} <span className="text-gray-500">({s.email})</span></span>
                    <span className="text-gray-500">{s.status}</span>
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
    <article className="bg-white rounded-xl shadow p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-gray-800">{course.code} <span className="font-normal">{course.title}</span></h3>
        {course.studentCount !== undefined && <span className="text-sm text-gray-500">{course.studentCount} students</span>}
      </header>
      {course.description && <p className="text-sm text-gray-600 mt-1">{course.description}</p>}

      <h4 className="text-sm font-semibold text-gray-700 mt-4 mb-2">Cohorts</h4>
      {course.cohorts?.length ? (
        <ul className="space-y-2">
          {course.cohorts.map((c) => (
            canManage
              ? <CohortRow key={c.id} courseId={course.id} cohort={c} onChanged={onChanged} />
              : <li key={c.id} className="border border-gray-200 rounded-lg p-3 text-sm">{c.name}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">No cohorts yet.</p>
      )}

      {canManage && (
        <form onSubmit={addCohort} className="mt-3 flex gap-2 items-end">
          <div className="flex-1">
            <label htmlFor={`cohort-${course.id}`} className="block text-sm font-medium text-gray-700 mb-1">New cohort name</label>
            <input id={`cohort-${course.id}`} className={inputCls} value={cohortName} onChange={(e) => setCohortName(e.target.value)} placeholder="Group 1" />
          </div>
          <button type="submit" disabled={busy} className={btnCls}>Add cohort</button>
        </form>
      )}

      {isAdmin && (
        <form onSubmit={assign} className="mt-3 flex gap-2 items-end">
          <div className="flex-1">
            <label htmlFor={`lect-${course.id}`} className="block text-sm font-medium text-gray-700 mb-1">Give a lecturer access (email)</label>
            <input id={`lect-${course.id}`} type="email" className={inputCls} value={lecturerEmail} onChange={(e) => setLecturerEmail(e.target.value)} />
          </div>
          <button type="submit" className={btnCls}>Assign</button>
        </form>
      )}
    </article>
  );
};

export default CourseCard;
