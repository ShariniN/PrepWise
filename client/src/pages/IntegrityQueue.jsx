import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import NavBar from '../components/NavBar';
import ReasonChips from '../components/integrity/ReasonChips';
import { listCases } from '../api/integrity';
import { listAssessments } from '../api/assessments';
import { errorMessage } from '../api/client';
import { fmtDateTime, CASE_STATUS_LABELS, CASE_STATUS_STYLES, FLAGS_NOTE, OUTCOMES } from '../utils/assessment';

const STATUSES = ['open', 'escalated', 'dismissed', 'resolved'];

const IntegrityQueue = () => {
  const [params, setParams] = useSearchParams();
  const statusParam = params.get('status') ?? 'open,escalated';
  const assessmentId = params.get('assessmentId') || '';
  const [cases, setCases] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const statuses = statusParam ? statusParam.split(',').filter(Boolean) : [];

  useEffect(() => {
    listAssessments().then((d) => setAssessments(d.assessments || [])).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const q = {};
    if (statusParam) q.status = statusParam;
    if (assessmentId) q.assessmentId = assessmentId;
    (async () => {
      try {
        const d = await listCases(q);
        if (!cancelled) { setCases(d.cases || []); setError(''); }
      } catch (e) { if (!cancelled) { setError(errorMessage(e, 'Could not load cases')); setCases([]); } }
    })();
    return () => { cancelled = true; };
  }, [statusParam, assessmentId, tick]);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v === '' || v == null ? next.delete(k) : next.set(k, v)));
    setCases(null);
    setParams(next, { replace: true });
  };
  const toggle = (s) => {
    const cur = new Set(statuses);
    if (cur.has(s)) cur.delete(s); else cur.add(s);
    update({ status: [...cur].join(',') || STATUSES.join(',') });
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <NavBar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <section className="bg-white rounded-2xl shadow p-6 space-y-3">
          <h1 className="text-2xl font-bold text-gray-800">Integrity review</h1>
          <p className="text-sm text-gray-600">{FLAGS_NOTE}</p>
          <div className="flex flex-wrap items-end gap-4">
            <fieldset className="flex flex-wrap gap-3">
              <legend className="text-xs text-gray-600 mb-1">Status</legend>
              {STATUSES.map((s) => (
                <label key={s} className="text-sm flex items-center gap-1">
                  <input type="checkbox" checked={statuses.includes(s)} onChange={() => toggle(s)} /> {CASE_STATUS_LABELS[s]}
                </label>
              ))}
            </fieldset>
            <label className="text-xs text-gray-600 flex flex-col gap-1">Assessment
              <select value={assessmentId} onChange={(e) => update({ assessmentId: e.target.value })} className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
                <option value="">All assessments</option>
                {assessments.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow">
          {cases === null && <p className="p-6 text-gray-500" role="status">Loading cases...</p>}
          {error && <p role="alert" className="p-4 text-sm text-red-700">{error} <button type="button" className="underline ml-2" onClick={() => setTick((n) => n + 1)}>Retry</button></p>}
          {cases && !error && cases.length === 0 && <p className="p-6 text-gray-500">No cases match. A case exists only when a session has something a reviewer may want to read.</p>}
          {cases && cases.length > 0 && (
            <ul className="divide-y">
              {cases.map((c) => (
                <li key={c.id}>
                  <Link to={`/integrity/${c.id}`} className="block p-4 hover:bg-gray-50 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-800">{c.studentName}</span>
                      <span className="text-xs text-gray-500">{c.studentEmail}</span>
                      <span className="flex-1" />
                      {c.hasStudentResponse && <span className="text-xs bg-indigo-50 text-indigo-700 rounded-full px-2 py-0.5">Student responded</span>}
                      <span className={`text-xs rounded-full px-2 py-0.5 ${CASE_STATUS_STYLES[c.status] || ''}`}>{CASE_STATUS_LABELS[c.status] || c.status}</span>
                      {c.outcome && <span className="text-xs text-gray-600">{OUTCOMES[c.outcome] || c.outcome}</span>}
                    </div>
                    <div className="text-sm text-gray-600">{c.assessmentTitle} &middot; updated {fmtDateTime(c.updatedAt)}</div>
                    <ReasonChips codes={c.reasonCodes} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
};

export default IntegrityQueue;
