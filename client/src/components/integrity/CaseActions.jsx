import React, { useState } from 'react';
import { toast } from 'react-toastify';
import ConfirmDialog from '../analytics/ConfirmDialog';
import { updateCase } from '../../api/integrity';
import { errorMessage } from '../../api/client';
import { CASE_TRANSITIONS, CASE_STATUS_LABELS, OUTCOMES } from '../../utils/assessment';

const VERBS = { dismissed: 'Dismiss', escalated: 'Escalate to student', resolved: 'Resolve', open: 'Reopen' };
const CONFIRM = {
  escalated: 'The student will see this case in My cases, with the reasons in plain words (not the evidence or your notes), and can write a response.',
  dismissed: 'The case is closed with no action. You can reopen it later.',
  open: 'Reopening clears the outcome.',
};

// Private notes plus status moves. Only moves the API allows are offered.
const CaseActions = ({ c, onUpdated }) => {
  const [notes, setNotes] = useState(c.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [target, setTarget] = useState(null);
  const [outcome, setOutcome] = useState('no_action');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const saveNotes = async () => {
    setSavingNotes(true);
    try { const d = await updateCase(c.id, { notes }); onUpdated(d.case); toast.success('Notes saved'); }
    catch (e) { toast.error(errorMessage(e, 'Could not save notes')); } finally { setSavingNotes(false); }
  };

  const move = async () => {
    setBusy(true); setErr('');
    try {
      const body = { status: target };
      if (target === 'resolved') body.outcome = outcome;
      const d = await updateCase(c.id, body);
      onUpdated(d.case); setTarget(null);
      toast.success(`Case is now ${CASE_STATUS_LABELS[target].toLowerCase()}`);
    } catch (e) { setErr(errorMessage(e, 'That change is not allowed')); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-gray-700" htmlFor="case-notes">Private notes (staff only, never shown to the student)</label>
        <textarea id="case-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={4000}
          className="w-full mt-1 border border-gray-300 rounded p-2 text-sm" />
        <button type="button" onClick={saveNotes} disabled={savingNotes || notes === (c.notes || '')}
          className="mt-1 text-xs px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50">{savingNotes ? 'Saving...' : 'Save notes'}</button>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-gray-600">Move case:</span>
        {(CASE_TRANSITIONS[c.status] || []).map((s) => (
          <button key={s} type="button" onClick={() => { setErr(''); setTarget(s); }}
            className="text-sm px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700">{VERBS[s]}</button>
        ))}
      </div>
      {c.outcome && <p className="text-sm text-gray-700">Outcome recorded: <strong>{OUTCOMES[c.outcome] || c.outcome}</strong>. An outcome is a record for the institution; it never changes a mark.</p>}
      {target && (
        <ConfirmDialog title={VERBS[target]} confirmLabel={VERBS[target]} busy={busy} onConfirm={move} onCancel={() => setTarget(null)}>
          {CONFIRM[target] && <p>{CONFIRM[target]}</p>}
          {target === 'resolved' && (
            <label className="block text-sm">Outcome (required)
              <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="mt-1 w-full border border-gray-300 rounded px-2 py-1.5">
                {Object.entries(OUTCOMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <span className="block text-xs text-gray-500 mt-1">A record only. It does not change the student&apos;s mark.</span>
            </label>
          )}
          {err && <p role="alert" className="text-red-700">{err}</p>}
        </ConfirmDialog>
      )}
    </div>
  );
};

export default CaseActions;
