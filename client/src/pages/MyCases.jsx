import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import NavBar from '../components/NavBar';
import { listMyCases, respondToCase } from '../api/integrity';
import { errorMessage } from '../api/client';
import { fmtDateTime } from '../utils/assessment';

const CaseCard = ({ c, onSaved }) => {
  const [text, setText] = useState(c.studentResponse?.text || '');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim()) { toast.error('Write a response first'); return; }
    setBusy(true);
    try { const d = await respondToCase(c.id, text.trim()); onSaved(d.case); toast.success('Your response was sent'); }
    catch (err) { toast.error(errorMessage(err, 'Could not send your response')); } finally { setBusy(false); }
  };
  return (
    <article className="bg-white rounded-2xl shadow p-6 space-y-3">
      <h2 className="text-lg font-semibold text-gray-800">{c.assessmentTitle}</h2>
      <p className="text-xs text-gray-500">Raised {fmtDateTime(c.escalatedAt)}</p>
      <div>
        <p className="text-sm text-gray-700">Your lecturer would like to hear from you about:</p>
        <ul className="list-disc pl-5 mt-1 text-sm text-gray-800 space-y-0.5">
          {(c.reasons || []).map((r, i) => <li key={i}>{r.text}</li>)}
        </ul>
      </div>
      <form onSubmit={submit} className="space-y-2">
        <label htmlFor={`resp-${c.id}`} className="text-sm font-medium text-gray-700">Your response</label>
        <textarea id={`resp-${c.id}`} value={text} onChange={(e) => setText(e.target.value)} rows={6} maxLength={4000}
          className="w-full border border-gray-300 rounded p-2 text-sm" placeholder="Anything you would like your lecturer to know, for example what happened and why." />
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {busy ? 'Sending...' : c.studentResponse?.text ? 'Update response' : 'Send response'}
          </button>
          <span className="text-xs text-gray-500">{text.length}/4000</span>
          {c.studentResponse?.at && <span className="text-xs text-gray-500">Last sent {fmtDateTime(c.studentResponse.at)}</span>}
        </div>
      </form>
    </article>
  );
};

const MyCases = () => {
  const [cases, setCases] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listMyCases()
      .then((d) => { if (!cancelled) setCases(d.cases || []); })
      .catch((e) => { if (!cancelled) { setError(errorMessage(e, 'Could not load')); setCases([]); } });
    return () => { cancelled = true; };
  }, []);

  const replace = (nc) => setCases((list) => list.map((x) => (x.id === nc.id ? { ...x, ...nc } : x)));

  return (
    <div className="min-h-screen bg-gray-100">
      <NavBar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <section className="bg-white rounded-2xl shadow p-6 space-y-2">
          <h1 className="text-2xl font-bold text-gray-800">My cases</h1>
          <p className="text-sm text-gray-600">
            Sometimes a lecturer asks a student about how an assessment went. Nothing has been decided. A person reads what you write before anything else happens,
            and technical problems such as a lost connection are never held against you.
          </p>
        </section>
        {cases === null && <p className="text-gray-500" role="status">Loading...</p>}
        {error && <p role="alert" className="bg-white rounded-2xl shadow p-4 text-sm text-red-700">{error}</p>}
        {cases && !error && cases.length === 0 && <p className="bg-white rounded-2xl shadow p-6 text-gray-600">You have nothing waiting for a response.</p>}
        {(cases || []).map((c) => <CaseCard key={c.id} c={c} onSaved={replace} />)}
      </main>
    </div>
  );
};

export default MyCases;
