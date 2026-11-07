import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import NavBar from '../components/NavBar';
import { listAssessments } from '../api/assessments';
import { errorMessage } from '../api/client';
import { fmtDateTime, fmtDuration, STATUS_STYLES } from '../utils/assessment';

const GROUPS = [
  { key: 'open', title: 'Open now' },
  { key: 'scheduled', title: 'Upcoming' },
  { key: 'closed', title: 'Closed' },
];

const Row = ({ a }) => {
  const active = (a.sessions || []).find((s) => s.status === 'active');
  return (
    <li>
      <Link to={`/assessments/${a.id}`} className="flex flex-wrap items-center gap-2 p-3 hover:bg-gray-50 rounded">
        <span className="font-medium text-gray-800 flex-1 min-w-[12rem]">{a.title}</span>
        {active && <span className="text-xs bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">In progress</span>}
        <span className={`text-xs rounded-full px-2 py-0.5 ${STATUS_STYLES[a.status] || ''}`}>{a.status}</span>
        <span className="text-xs text-gray-500">{fmtDuration(a.durationMinutes)}</span>
        <span className="basis-full text-xs text-gray-500">
          {fmtDateTime(a.opensAt)} to {fmtDateTime(a.closesAt)} &middot; {a.questionCount} question{a.questionCount === 1 ? '' : 's'}
        </span>
      </Link>
    </li>
  );
};

const AssessmentList = () => {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await listAssessments();
        if (!cancelled) { setItems(d.assessments || []); setError(''); }
      } catch (e) {
        if (!cancelled) { setError(errorMessage(e, 'Could not load assessments')); setItems([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [tick]);

  return (
    <div className="min-h-screen bg-gray-100">
      <NavBar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <section className="bg-white rounded-2xl shadow p-6">
          <h1 className="text-2xl font-bold text-gray-800">Assessments</h1>
          <p className="text-sm text-gray-500 mt-1">Timed assessments set by your lecturers. The timer starts when you press Start and the server keeps the clock.</p>
        </section>
        {items === null && <p className="text-gray-500" role="status">Loading assessments...</p>}
        {error && (
          <div role="alert" className="bg-white rounded-2xl shadow p-4 text-red-700 text-sm">
            {error} <button type="button" className="underline ml-2" onClick={() => { setItems(null); setTick((n) => n + 1); }}>Retry</button>
          </div>
        )}
        {items && !error && items.length === 0 && (
          <p className="bg-white rounded-2xl shadow p-6 text-gray-500">No assessments have been set for you yet.</p>
        )}
        {items && GROUPS.map((g) => {
          const list = items.filter((a) => a.status === g.key);
          if (!list.length) return null;
          return (
            <section key={g.key} className="bg-white rounded-2xl shadow p-4">
              <h2 className="px-3 pt-1 pb-2 text-sm font-semibold text-gray-700">{g.title}</h2>
              <ul className="divide-y">{list.map((a) => <Row key={a.id} a={a} />)}</ul>
            </section>
          );
        })}
      </main>
    </div>
  );
};

export default AssessmentList;
