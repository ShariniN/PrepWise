import React, { useCallback, useState } from 'react';
import AppShell from '../../components/AppShell';
import { grading } from '../../api/analytics';
import { errorMessage } from '../../api/client';
import useApiData from '../../hooks/useApiData';
import GradingDetail from './components/GradingDetail';
import ConfirmDialog from '../../components/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState } from '../../components/DataStates';
import { Badge, Button, Card, Chip } from '../../components/ui';

const GradingQueue = () => {
  const [status, setStatus] = useState('pending');
  const [selectedId, setSelectedId] = useState(null);
  const [checked, setChecked] = useState(() => new Set());
  const [dialog, setDialog] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [bulkError, setBulkError] = useState('');

  const { data, error, loading, reload } = useApiData(() => grading.queue({ status }), status);
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
    <AppShell
      title="Grading queue: what needs your judgement"
      subtitle="Short and behavioural answers wait here. The AI can only suggest; a score exists only after you confirm it."
      actions={(
        <div className="flex gap-2" role="group" aria-label="Queue status">
          {['pending', 'reviewed'].map((s) => (
            <Chip key={s} selected={status === s} onClick={() => { setStatus(s); setSelectedId(null); setChecked(new Set()); }}>
              {s === 'pending' ? 'To review' : 'Reviewed'}
            </Chip>
          ))}
        </div>
      )}
    >
      <div className="space-y-4">
        {bulkError && <ErrorState message={bulkError} />}
        {results && (
          <Card tone="sand" className="text-sm" role="status">
            <p className="font-semibold text-ink">Bulk result: {results.filter((r) => r.status === 'confirmed').length} confirmed, {results.filter((r) => r.status !== 'confirmed').length} skipped</p>
            <ul className="ml-5 mt-1 list-disc text-ink-2">
              {results.map((r) => (
                <li key={r.attemptId}>
                  {r.status === 'confirmed' ? `Confirmed with score ${r.score}` : `Skipped: ${r.reason}`} ({r.attemptId.slice(-6)})
                </li>
              ))}
            </ul>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setResults(null)}>Dismiss</Button>
          </Card>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
          <Card as="section" aria-label="Queue" className="space-y-3 !p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-ink-2">{loading ? 'Loading...' : `${items.length} item${items.length === 1 ? '' : 's'} (oldest first)`}</p>
              {status === 'pending' && (
                <Button size="sm" disabled={!checked.size} onClick={() => setDialog(true)}>
                  Accept {checked.size} selected suggestion{checked.size === 1 ? '' : 's'}
                </Button>
              )}
            </div>
            {loading && <LoadingState />}
            {error && <ErrorState message={error} onRetry={reload} />}
            {!loading && !error && !items.length && (
              <EmptyState title={status === 'pending' ? 'Nothing waiting' : 'Nothing reviewed yet'} />
            )}
            <ul className="space-y-1.5">
              {items.map((it) => (
                <li key={it.id} className={`flex items-start gap-3 rounded-2xl border p-3 transition ${selectedId === it.id ? 'border-primary-300 bg-primary-50' : 'border-transparent hover:bg-sand'}`}>
                  {status === 'pending' && (
                    <input type="checkbox" className="mt-1 h-4 w-4 accent-primary-600" disabled={!it.hasAiSuggestion} checked={checked.has(it.id)}
                      onChange={() => toggle(it.id)}
                      aria-label={it.hasAiSuggestion ? `Select ${it.studentName} for bulk accept` : `${it.studentName}: no AI suggestion to accept`} />
                  )}
                  <button type="button" onClick={() => setSelectedId(it.id)} className="min-w-0 flex-1 text-left" aria-current={selectedId === it.id ? 'true' : undefined}>
                    <span className="block text-sm font-semibold text-ink">{it.questionTitle}</span>
                    <span className="mt-0.5 block text-xs text-ink-2">
                      {it.studentName} | {new Date(it.submittedAt).toLocaleDateString()}
                    </span>
                    <span className="mt-1.5 block">
                      {it.status === 'reviewed'
                        ? <Badge tone="success">{`score ${it.score} (human)`}</Badge>
                        : it.hasAiSuggestion
                          ? <Badge tone="primary">AI suggestion ready (not a grade)</Badge>
                          : <Badge tone="neutral">no suggestion yet</Badge>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {status === 'pending' && <p className="text-xs text-ink-2">Only items you tick are accepted, and only if they already have an AI suggestion. There is no accept-all.</p>}
          </Card>

          <Card as="section" aria-label="Detail" className="!p-4 sm:!p-6">
            {selectedId
              ? <GradingDetail key={selectedId} id={selectedId} onChanged={changed} />
              : <EmptyState title="Select an answer" className="!border-0 !bg-transparent !py-10">Pick an item to read the answer and grade it against the rubric.</EmptyState>}
          </Card>
        </div>
      </div>

      {dialog && (
        <ConfirmDialog title={`Accept ${checked.size} AI suggestion${checked.size === 1 ? '' : 's'} as final grades?`}
          confirmLabel="Yes, confirm as grades" busy={bulkBusy} onConfirm={runBulk} onCancel={() => setDialog(false)}>
          <p>Each selected AI suggestion will be stored as the human-confirmed score, under your name. This is audited and cannot be undone.</p>
          <ul className="ml-5 max-h-40 list-disc overflow-auto">
            {[...checked].map((id) => <li key={id}>{nameOf(id)?.studentName} - {nameOf(id)?.questionTitle}</li>)}
          </ul>
        </ConfirmDialog>
      )}
    </AppShell>
  );
};

export default GradingQueue;
