import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { Button, ConfirmDialog } from '../ui';
import { setAssessmentStatus } from '../../api/assessments';
import { errorMessage, errorCode } from '../../api/client';

// Allowed moves by effective status (same table as the server).
const MOVES = {
  draft: [['scheduled', 'Schedule'], ['open', 'Open now']],
  scheduled: [['draft', 'Back to draft'], ['open', 'Open now'], ['closed', 'Close']],
  open: [['closed', 'Close']],
  closed: [],
};

const CONFIRM_TEXT = {
  open: 'Students will be able to start immediately. If the opening time is in the future it moves to now.',
  closed: 'Closing stops every running session straight away. Answers already saved are kept, and this cannot be undone.',
};

const StatusActions = ({ assessment, onChanged }) => {
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const moves = MOVES[assessment.effectiveStatus] || [];

  const go = async (status) => {
    setBusy(true);
    try {
      const d = await setAssessmentStatus(assessment.id, status);
      toast.success(`Status is now ${d.assessment.effectiveStatus}`);
      setPending(null);
      onChanged?.(d.assessment);
    } catch (e) {
      const msg = errorCode(e) === 'PUBLISH_BLOCKED'
        ? 'A question in this assessment is no longer published. Replace it first.'
        : errorMessage(e, 'Could not change status');
      toast.error(msg);
      setPending(null);
    } finally { setBusy(false); }
  };

  if (!moves.length) return null;
  return (
    <>
      {moves.map(([status, label]) => (
        <Button key={status} size="sm" variant="secondary"
          onClick={() => (CONFIRM_TEXT[status] ? setPending(status) : go(status))}>{label}</Button>
      ))}
      {pending && (
        <ConfirmDialog open title={`${pending === 'closed' ? 'Close' : 'Open'} "${assessment.title}"?`} confirmLabel={pending === 'closed' ? 'Close assessment' : 'Open now'}
          description={CONFIRM_TEXT[pending]} danger={pending === 'closed'}
          loading={busy} onConfirm={() => go(pending)} onClose={() => setPending(null)} />
      )}
    </>
  );
};

export default StatusActions;
