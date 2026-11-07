import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import NavBar from '../components/NavBar';
import AiDraftDialog from '../components/authoring/AiDraftDialog';
import { listBank, duplicateQuestion } from '../api/questions';
import { errorMessage } from '../api/client';
import { QUESTION_TYPES, STATUSES } from '../utils/practice';

const STATUS_CLS = {
  draft: 'bg-gray-200 text-gray-700',
  in_review: 'bg-blue-100 text-blue-800',
  published: 'bg-green-100 text-green-800',
  retired: 'bg-red-100 text-red-700',
};

const Row = ({ q, onDuplicate, busy }) => (
  <li className="flex flex-wrap items-center gap-2 p-3">
    <Link to={`/questions/${q.id}`} className="font-medium text-indigo-700 hover:underline flex-1 min-w-[12rem]">{q.title || '(untitled)'}</Link>
    <span className="text-xs bg-indigo-50 text-indigo-700 rounded-full px-2 py-0.5">{q.type}</span>
    <span className="text-xs text-gray-600">{q.difficulty}</span>
    <span className={`text-xs rounded-full px-2 py-0.5 ${STATUS_CLS[q.status] || ''}`}>{q.status?.replace('_', ' ')}</span>
    {q.source === 'ai_drafted' && <span className="text-xs bg-purple-100 text-purple-700 rounded-full px-2 py-0.5">AI drafted</span>}
    {(q.topic || []).map((t) => <span key={t} className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{t}</span>)}
    {q.editable
      ? <Link to={`/questions/${q.id}`} className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300">Edit</Link>
      : <button type="button" disabled={busy} onClick={() => onDuplicate(q)} className="text-xs px-2 py-1 rounded bg-indigo-600 text-white disabled:opacity-50">Duplicate to edit</button>}
  </li>
);

const QuestionBank = () => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ status: '', type: '', mine: false });
  const [questions, setQuestions] = useState(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const params = {};
    if (filters.status) params.status = filters.status;
    if (filters.type) params.type = filters.type;
    if (filters.mine) params.mine = 1;
    (async () => {
      try {
        const data = await listBank(params);
        if (!cancelled) { setQuestions(data.questions || []); setError(''); }
      } catch (e) {
        if (!cancelled) { setError(errorMessage(e, 'Could not load questions')); setQuestions([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [filters, tick]);

  const set = (patch) => { setQuestions(null); setFilters((f) => ({ ...f, ...patch })); };

  const duplicate = async (q) => {
    setBusy(true);
    try {
      const data = await duplicateQuestion(q.id);
      toast.success('Copied to your drafts');
      navigate(`/questions/${data.question.id}`);
    } catch (e) { toast.error(errorMessage(e, 'Could not duplicate')); } finally { setBusy(false); }
  };

  const onAiCreated = (list) => {
    setAi(false);
    if (list.length === 1) navigate(`/questions/${list[0].id}`);
    else { toast.success(`${list.length} drafts created`); set({}); setTick((n) => n + 1); }
  };

  const own = (questions || []).filter((q) => !q.isSeed);
  const seeds = (questions || []).filter((q) => q.isSeed);
  const sel = 'border border-gray-300 rounded px-2 py-1.5 text-sm bg-white';

  return (
    <div className="min-h-screen bg-gray-100">
      <NavBar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <section className="bg-white rounded-2xl shadow p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-bold text-gray-800">Question bank</h1>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAi(true)} className="px-3 py-2 text-sm rounded-lg bg-purple-600 text-white">Draft with AI</button>
              <Link to="/questions/new" className="px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white">New question</Link>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-xs text-gray-600 flex flex-col gap-1">Status
              <select className={sel} value={filters.status} onChange={(e) => set({ status: e.target.value })}>
                <option value="">All</option>
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-600 flex flex-col gap-1">Type
              <select className={sel} value={filters.type} onChange={(e) => set({ type: e.target.value })}>
                <option value="">All</option>
                {QUESTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="text-sm text-gray-700 flex items-center gap-2 pb-1.5">
              <input type="checkbox" checked={filters.mine} onChange={(e) => set({ mine: e.target.checked })} /> Mine only
            </label>
          </div>
        </section>

        {questions === null && <p className="text-gray-500" role="status">Loading questions...</p>}
        {error && (
          <div role="alert" className="bg-white rounded-2xl shadow p-4 text-red-700 text-sm">
            {error} <button type="button" className="underline ml-2" onClick={() => { setQuestions(null); setTick((n) => n + 1); }}>Retry</button>
          </div>
        )}
        {questions && !error && (
          <>
            <section className="bg-white rounded-2xl shadow">
              <h2 className="px-4 pt-4 font-semibold text-gray-700">Your institution</h2>
              {own.length === 0 ? <p className="p-4 text-sm text-gray-500">No questions yet. Create one, draft with AI, or duplicate a seed question below.</p>
                : <ul className="divide-y">{own.map((q) => <Row key={q.id} q={q} onDuplicate={duplicate} busy={busy} />)}</ul>}
            </section>
            <section className="bg-white rounded-2xl shadow">
              <h2 className="px-4 pt-4 font-semibold text-gray-700">Global seed bank <span className="text-xs font-normal text-gray-500">(read only)</span></h2>
              {seeds.length === 0 ? <p className="p-4 text-sm text-gray-500">No seed questions match.</p>
                : <ul className="divide-y">{seeds.map((q) => <Row key={q.id} q={q} onDuplicate={duplicate} busy={busy} />)}</ul>}
            </section>
          </>
        )}
      </main>
      {ai && <AiDraftDialog onClose={() => setAi(false)} onCreated={onAiCreated} />}
    </div>
  );
};

export default QuestionBank;
