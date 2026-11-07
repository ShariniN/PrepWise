import React, { useCallback, useState } from 'react';
import NavBar from '../components/NavBar';
import { grading } from '../api/analytics';
import { errorMessage } from '../api/client';
import useAnalyticsData from '../hooks/useAnalyticsData';
import GradingDetail from '../components/analytics/GradingDetail';
import ConfirmDialog from '../components/analytics/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState } from '../components/analytics/EmptyState';

const GradingQueue = () => {
  const [status, setStatus] = useState('pending');
  const [selectedId, setSelectedId] = useState(null);
  const [checked, setChecked] = useState(() => new Set());
  const [dialog, setDialog] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [bulkError, setBulkError] = useState('');

  const { data, error, loading, reload } = useAnalyticsData(() => grading.queue({ status }), status);
  const items = data?.items || [];

  const toggle = (id) => setChecked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const changed = useCallback(() => reload(), [reload]);

  const runBulk = async () => {
    setBulkBusy(true); setBulkError('');
    try {
      const { results: r } = await grading.bulkConfirm(
        [...checked].map((attemptId) => ({ attemptId, decision: 'accept_ai_suggestion' })));
      setResults(r);
      setChecked(new Set());
      setDialog(false);
      reload();
    } catch (e) {
      setBulkError(errorMessage(e, 'Bulk confirm failed'));
      setDialog(false);
    } finally { setBulkBusy(false); }
  };

  const nameOf = (id) => items.find((i) => i.id === id);

  return (
    <div className="min-h-screen bg-gray-100">
      <NavBar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <header className="bg-white rounded-2xl shadow p-6">
          <h1 className="text-2xl font-bold text-gray-800">Grading queue: what needs your judgement</h1>
          <p className="text-sm text-gray-500 mt-1">
            Short and behavioural answers wait here. The AI can only suggest; a score exists only after you confirm it.
          </p>
          <div className="flex gap-2 mt-3" role="group" aria-label="Queue status">
            {['pending', 'reviewed'].map((s) => (
              <button key={s} type="button" aria-pressed={status === s} onClick={() => { setStatus(s); setSelectedId(null); setChecked(new Set()); }}
                className={`text-sm rounded-full px-3 py-1 border ${status === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300'}`}>
                {s === 'pending' ? 'To review' : 'Reviewed'}
              </button>
            ))}
          </div>
        </header>

        {bulkError && <ErrorState message={bulkError} />}
        {results && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm" role="status">
            <p className="font-semibold">Bulk result: {results.filter((r) => r.status === 'confirmed').length} confirmed, {results.filter((r) => r.status !== 'confirmed').length} skipped</p>
            <ul className="list-disc ml-5 text-gray-600">
              {results.map((r) => (
                <li key={r.attemptId}>
                  {r.status === 'confirmed' ? `Confirmed with score ${r.score}` : `Skipped: ${r.reason}`} ({r.attemptId.slice(-6)})
                </li>
              ))}
            </ul>
            <button type="button" className="underline mt-1" onClick={() => setResults(null)}>Dismiss</button>
          </div>
        )}

        <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
          <section className="bg-white rounded-2xl shadow p-4 space-y-3" aria-label="Queue">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-gray-600">{loading ? 'Loading...' : `${items.length} item${items.length === 1 ? '' : 's'} (oldest first)`}</p>
              {status === 'pending' && (
                <button type="button" disabled={!checked.size} onClick={() => setDialog(true)}
                  className="text-sm rounded-md bg-indigo-600 text-white px-3 py-1.5 disabled:opacity-40">
                  Accept {checked.size} selected suggestion{checked.size === 1 ? '' : 's'}
                </button>
              )}
            </div>
            {loading && <LoadingState />}
            {error && <ErrorState message={error} onRetry={reload} />}
            {!loading && !error && !items.length && (
              <EmptyState title={status === 'pending' ? 'Nothing waiting' : 'Nothing reviewed yet'} />
            )}
            <ul className="divide-y divide-gray-100">
              {items.map((it) => (
                <li key={it.id} className={`flex items-start gap-2 py-2 ${selectedId === it.id ? 'bg-indigo-50' : ''}`}>
                  {status === 'pending' && (
                    <input type="checkbox" className="mt-1" disabled={!it.hasAiSuggestion} checked={checked.has(it.id)}
                      onChange={() => toggle(it.id)}
                      aria-label={it.hasAiSuggestion ? `Select ${it.studentName} for bulk accept` : `${it.studentName}: no AI suggestion to accept`} />
                  )}
                  <button type="button" onClick={() => setSelectedId(it.id)} className="text-left flex-1">
                    <span className="block text-sm font-medium text-gray-800">{it.questionTitle}</span>
                    <span className="block text-xs text-gray-500">
                      {it.studentName} | {new Date(it.submittedAt).toLocaleDateString()} |{' '}
                      {it.status === 'reviewed' ? `score ${it.score} (human)` : it.hasAiSuggestion ? 'AI suggestion ready (not a grade)' : 'no suggestion yet'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {status === 'pending' && <p className="text-xs text-gray-500">Only items you tick are accepted, and only if they already have an AI suggestion. There is no accept-all.</p>}
          </section>

          <section className="bg-white rounded-2xl shadow p-4" aria-label="Detail">
            {selectedId
              ? <GradingDetail key={selectedId} id={selectedId} onChanged={changed} />
              : <EmptyState title="Select an answer">Pick an item to read the answer and grade it against the rubric.</EmptyState>}
          </section>
        </div>
      </main>

      {dialog && (
        <ConfirmDialog title={`Accept ${checked.size} AI suggestion${checked.size === 1 ? '' : 's'} as final grades?`}
          confirmLabel="Yes, confirm as grades" busy={bulkBusy} onConfirm={runBulk} onCancel={() => setDialog(false)}>
          <p>Each selected AI suggestion will be stored as the human-confirmed score, under your name. This is audited and cannot be undone.</p>
          <ul className="list-disc ml-5 max-h-40 overflow-auto">
            {[...checked].map((id) => <li key={id}>{nameOf(id)?.studentName} - {nameOf(id)?.questionTitle}</li>)}
          </ul>
        </ConfirmDialog>
      )}
    </div>
  );
};

export default GradingQueue;
