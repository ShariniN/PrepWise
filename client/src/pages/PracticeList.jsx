import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import NavBar from '../components/NavBar';
import { listQuestions } from '../api/practice';
import { errorMessage } from '../api/client';
import { QUESTION_TYPES as TYPES, DIFFICULTIES as DIFFS } from '../utils/practice';

const DIFF_CLS = { easy: 'bg-green-100 text-green-800', medium: 'bg-yellow-100 text-yellow-800', hard: 'bg-red-100 text-red-800' };

const PracticeList = () => {
  const [filters, setFilters] = useState({ topic: '', difficulty: '', type: '', unseen: false });
  const [topic, setTopic] = useState('');
  const [questions, setQuestions] = useState(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, topic: topic.trim() })), 300);
    return () => clearTimeout(t);
  }, [topic]);

  useEffect(() => {
    let cancelled = false;
    const params = {};
    if (filters.topic) params.topic = filters.topic;
    if (filters.difficulty) params.difficulty = filters.difficulty;
    if (filters.type) params.type = filters.type;
    if (filters.unseen) params.unseen = 1;
    (async () => {
      try {
        const data = await listQuestions(params);
        let list = data.questions || [];
        if (!filters.unseen) {
          // The API has no solved flag; questions missing from the "unseen" list were solved.
          try {
            const unseen = await listQuestions({ ...params, unseen: 1 });
            const open = new Set((unseen.questions || []).map((q) => q.id));
            list = list.map((q) => ({ ...q, solved: !open.has(q.id) }));
          } catch { /* badges are optional */ }
        }
        if (!cancelled) { setQuestions(list); setError(''); }
      } catch (e) {
        if (!cancelled) { setError(errorMessage(e, 'Could not load questions')); setQuestions([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [filters, tick]);

  const reload = () => { setQuestions(null); setTick((n) => n + 1); };
  const set = (patch) => { setQuestions(null); setFilters((f) => ({ ...f, ...patch })); };

  const sel = 'border border-gray-300 rounded px-2 py-1.5 text-sm bg-white';

  return (
    <div className="min-h-screen bg-gray-100">
      <NavBar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <section className="bg-white rounded-2xl shadow p-6">
          <h1 className="text-2xl font-bold text-gray-800">Practice</h1>
          <p className="text-sm text-gray-500 mt-1">Pick a question, write your answer and get instant feedback.</p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-xs text-gray-600 flex flex-col gap-1">Topic
              <input className={sel} value={topic} onChange={(e) => { setQuestions(null); setTopic(e.target.value); }} placeholder="e.g. arrays" />
            </label>
            <label className="text-xs text-gray-600 flex flex-col gap-1">Difficulty
              <select className={sel} value={filters.difficulty} onChange={(e) => set({ difficulty: e.target.value })}>
                <option value="">All</option>
                {DIFFS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-600 flex flex-col gap-1">Type
              <select className={sel} value={filters.type} onChange={(e) => set({ type: e.target.value })}>
                <option value="">All</option>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="text-sm text-gray-700 flex items-center gap-2 pb-1.5">
              <input type="checkbox" checked={filters.unseen} onChange={(e) => set({ unseen: e.target.checked })} />
              Unseen only
            </label>
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow p-4">
          {questions === null && <p className="p-4 text-gray-500" role="status">Loading questions...</p>}
          {error && (
            <div role="alert" className="p-4 text-red-700 text-sm">
              {error} <button type="button" className="underline ml-2" onClick={reload}>Retry</button>
            </div>
          )}
          {questions && !error && questions.length === 0 && (
            <p className="p-4 text-gray-500">No questions match these filters.</p>
          )}
          {questions && questions.length > 0 && (
            <ul className="divide-y">
              {questions.map((q) => (
                <li key={q.id}>
                  <Link to={`/practice/${q.id}`} className="flex flex-wrap items-center gap-2 p-3 hover:bg-gray-50 rounded">
                    <span className="font-medium text-gray-800 flex-1 min-w-[12rem]">{q.title}</span>
                    {q.solved && <span className="text-xs bg-green-600 text-white rounded-full px-2 py-0.5">Solved</span>}
                    <span className="text-xs bg-indigo-50 text-indigo-700 rounded-full px-2 py-0.5">{q.type}</span>
                    <span className={`text-xs rounded-full px-2 py-0.5 ${DIFF_CLS[q.difficulty] || 'bg-gray-100 text-gray-700'}`}>{q.difficulty}</span>
                    {(q.topic || []).map((t) => <span key={t} className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{t}</span>)}
                    {q.estimatedMinutes ? <span className="text-xs text-gray-500">{q.estimatedMinutes} min</span> : null}
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

export default PracticeList;
