import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Button, Card, Modal, Skeleton } from '../ui';
import { getSimilarity, runSimilarity } from '../../api/integrity';
import { errorMessage } from '../../api/client';

const RangeStrip = ({ ranges }) => {
  const max = Math.max(10, ...(ranges || []).map((r) => r.endLine));
  return (
    <svg viewBox="0 0 200 14" className="w-full h-3.5" role="img"
      aria-label={`Matching lines: ${(ranges || []).map((r) => `${r.startLine} to ${r.endLine}`).join(', ') || 'none'}`}>
      <rect x="0" y="4" width="200" height="6" rx="3" fill="var(--viz-grid, #e4e3df)" />
      {(ranges || []).map((r, i) => (
        <rect key={i} x={((r.startLine - 1) / max) * 200} y="2" rx="2" height="10"
          width={Math.max(3, ((r.endLine - r.startLine + 1) / max) * 200)} fill="#6250d6" />
      ))}
    </svg>
  );
};

const Side = ({ s, self }) => (
  <div className="min-w-0 space-y-1">
    <p className="truncate text-sm font-medium text-ink">{s.name || 'Student'}{self ? ' (this case)' : ''}</p>
    <p className="truncate text-xs text-ink-2">{s.email}</p>
    <RangeStrip ranges={s.ranges} />
    <p className="text-xs text-ink-2">Matching lines: {(s.ranges || []).map((r) => (r.startLine === r.endLine ? `${r.startLine}` : `${r.startLine}-${r.endLine}`)).join(', ') || 'none'}</p>
  </div>
);

// Cohort similarity for the case's assessment, narrowed to pairs that include this student.
const SimilarityPanel = ({ c, stored }) => {
  const [pairs, setPairs] = useState(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await getSimilarity(c.assessmentId, { flagged: 1 });
      setPairs((d.pairs || []).filter((p) => p.a.userId === c.userId || p.b.userId === c.userId));
      setError('');
    } catch (e) { setError(errorMessage(e, 'Could not load similarity pairs')); setPairs([]); }
  }, [c.assessmentId, c.userId]);
  useEffect(() => { load(); }, [load]);

  const run = async () => {
    setBusy(true);
    try { setSummary(await runSimilarity(c.assessmentId)); await load(); toast.success('Similarity run finished'); setConfirm(false); }
    catch (e) { toast.error(errorMessage(e, 'Similarity run failed')); setConfirm(false); } finally { setBusy(false); }
  };

  return (
    <Card as="section" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-xl font-semibold text-ink flex-1">Similarity to other submissions</h2>
        <Button size="sm" variant="secondary" onClick={() => setConfirm(true)}>Run similarity for this assessment</Button>
      </div>
      <p className="text-sm text-ink-2">
        Similarity is a lead for a person to read, not proof. Short solutions and shared lecture examples look alike without any copying, and restructured copying can score low.
        Only submitted code is compared, within this cohort.
      </p>
      {pairs === null && <div role="status" aria-label="Loading"><Skeleton className="h-10 w-full" /></div>}
      {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
      {pairs && !error && pairs.length === 0 && (
        <p className="text-sm text-ink-2">{stored.length ? 'No flagged pairs include this student in the latest run.' : 'No flagged pairs for this student. Run similarity after the assessment closes to compare the cohort.'}</p>
      )}
      <ul className="space-y-3">
        {(pairs || []).map((p) => {
          const mineA = p.a.userId === c.userId;
          const me = mineA ? p.a : p.b; const other = mineA ? p.b : p.a;
          return (
            <li key={p.id} className="rounded-2xl border border-line bg-paper p-4 space-y-3">
              <p className="text-sm text-ink-2">
                {Math.round(p.containment * 100)}% of the shorter submission matches ({p.sharedFingerprints} shared fragments; overlap {Math.round(p.jaccard * 100)}%). Question {String(p.questionId).slice(-4)}.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Side s={me} self />
                <Side s={other} />
              </div>
            </li>
          );
        })}
      </ul>
      {summary && (
        <p className="text-xs text-ink-2">
          Last run: {summary.pairsStored} pairs stored, {summary.flaggedPairs} flagged, {summary.sessionsFlagged} sessions listed. {summary.limits}
        </p>
      )}
      {confirm && (
        <Modal open onClose={() => setConfirm(false)} title="Run similarity"
          footer={(<><Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button><Button loading={busy} onClick={run}>Run</Button></>)}>
          <div className="space-y-2 text-sm">
            <p className="text-ink">This compares the last submitted code of every student in the assessment and replaces the stored pairs. It can add a reason to other students&apos; cases.</p>
            <p className="text-ink-2">If students are still sitting, partial work is compared. Best run after it closes.</p>
          </div>
        </Modal>
      )}

    </Card>
  );
};

export default SimilarityPanel;
