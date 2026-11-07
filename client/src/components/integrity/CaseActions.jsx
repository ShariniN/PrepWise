import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { Button, Field, Modal, Select, Textarea } from '../ui';
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
      <div className="space-y-2">
        <Field label="Private notes (staff only, never shown to the student)">
          {(p) => <Textarea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={4000} />}
        </Field>
        <Button size="sm" variant="secondary" onClick={saveNotes} loading={savingNotes} disabled={notes === (c.notes || '')}>{savingNotes ? 'Saving...' : 'Save notes'}</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-2">Move case:</span>
        {(CASE_TRANSITIONS[c.status] || []).map((s) => (
          <Button key={s} size="sm" variant={s === 'escalated' ? 'primary' : 'secondary'} onClick={() => { setErr(''); setTarget(s); }}>{VERBS[s]}</Button>
        ))}
      </div>
      {c.outcome && <p className="text-sm text-ink-2">Outcome recorded: <strong className="text-ink">{OUTCOMES[c.outcome] || c.outcome}</strong>. An outcome is a record for the institution; it never changes a mark.</p>}
      {target && (
        <Modal
          open
          onClose={() => setTarget(null)}
          title={VERBS[target]}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button>
              <Button loading={busy} onClick={move}>{VERBS[target]}</Button>
            </>
          )}
        >
          <div className="space-y-4 text-sm">
            {CONFIRM[target] && <p className="text-ink-2">{CONFIRM[target]}</p>}
            {target === 'resolved' && (
              <Field label="Outcome (required)" hint="A record only. It does not change the student's mark.">
                {(p) => (
                  <Select {...p} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                    {Object.entries(OUTCOMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                )}
              </Field>
            )}
            {err && <p role="alert" className="text-danger-700">{err}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default CaseActions;
