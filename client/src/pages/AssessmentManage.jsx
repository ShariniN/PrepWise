import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import NavBar from '../components/NavBar';
import SessionsPanel from '../components/assessment/SessionsPanel';
import StatusActions from '../components/assessment/StatusActions';
import { listAssessments } from '../api/assessments';
import { errorMessage } from '../api/client';
import { fmtDateTime, fmtDuration, STATUS_STYLES } from '../utils/assessment';

const AssessmentManage = () => {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await listAssessments();
      setItems(d.assessments || []); setError('');
    } catch (e) { setError(errorMessage(e, 'Could not load assessments')); setItems([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const replace = (a) => setItems((list) => list.map((x) => (x.id === a.id ? { ...x, ...a } : x)));

  return (
    <div className="min-h-screen bg-gray-100">
      <NavBar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <section className="bg-white rounded-2xl shadow p-6 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[14rem]">
            <h1 className="text-2xl font-bold text-gray-800">Assessments</h1>
            <p className="text-sm text-gray-500 mt-1">Timed assessments for your courses. Integrity monitoring uses browser signals only.</p>
          </div>
          <Link to="/integrity" className="text-sm text-indigo-700 underline">Review queue</Link>
          <Link to="/assessments/manage/new" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">New assessment</Link>
        </section>

        {items === null && <p className="text-gray-500" role="status">Loading...</p>}
        {error && <p role="alert" className="bg-white rounded-2xl shadow p-4 text-sm text-red-700">{error}</p>}
        {items && !error && items.length === 0 && <p className="bg-white rounded-2xl shadow p-6 text-gray-500">No assessments yet.</p>}

        {items && items.length > 0 && (
          <ul className="bg-white rounded-2xl shadow divide-y">
            {items.map((a) => (
              <li key={a.id}>
                <div className="flex flex-wrap items-center gap-2 p-3">
                  <Link to={`/assessments/manage/${a.id}`} className="font-medium text-indigo-700 hover:underline flex-1 min-w-[12rem]">{a.title}</Link>
                  <span className={`text-xs rounded-full px-2 py-0.5 ${STATUS_STYLES[a.effectiveStatus] || ''}`}>{a.effectiveStatus}</span>
                  <span className="text-xs text-gray-500">{fmtDuration(a.durationMinutes)}</span>
                  <span className="text-xs text-gray-500">{(a.questionIds || []).length} questions</span>
                  <span className="text-xs text-gray-500">Level {a.integrityLevel}</span>
                  <span className="basis-full text-xs text-gray-500">{fmtDateTime(a.opensAt)} to {fmtDateTime(a.closesAt)}</span>
                  <div className="basis-full flex flex-wrap gap-2">
                    <StatusActions assessment={a} onChanged={replace} />
                    <button type="button" className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
                      onClick={() => setOpenId(openId === a.id ? '' : a.id)} aria-expanded={openId === a.id}>
                      {openId === a.id ? 'Hide sessions' : 'Sessions'}
                    </button>
                    <Link to={`/integrity?assessmentId=${a.id}`} className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300">Cases</Link>
                    <Link to={`/assessments/manage/${a.id}`} className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300">Edit</Link>
                  </div>
                </div>
                {openId === a.id && <div className="bg-gray-50 border-t"><SessionsPanel assessmentId={a.id} /></div>}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
};

export default AssessmentManage;
