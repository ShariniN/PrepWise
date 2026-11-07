import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Button, Field, Input, Modal, Skeleton, Table, TBody, THead, Td, Th, Textarea, Tr } from '../ui';
import { listAssessmentSessions, extendSession } from '../../api/assessments';
import { errorMessage } from '../../api/client';
import { fmtDateTime } from '../../utils/assessment';

// Sessions of one assessment with the extend-time action for live ones.
const SessionsPanel = ({ assessmentId }) => {
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState('');
  const [target, setTarget] = useState(null);
  const [minutes, setMinutes] = useState(10);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await listAssessmentSessions(assessmentId);
      setSessions(d.sessions || []); setError('');
    } catch (e) { setError(errorMessage(e, 'Could not load sessions')); setSessions([]); }
  }, [assessmentId]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    const m = Number(minutes);
    if (!Number.isInteger(m) || m < 1 || m > 480) { setFormError('Minutes must be a whole number from 1 to 480.'); return; }
    if (reason.trim().length < 3) { setFormError('Give a reason of at least 3 characters. It is recorded in the audit log.'); return; }
    setBusy(true); setFormError('');
    try {
      await extendSession(assessmentId, target.id, { minutes: m, reason: reason.trim() });
      toast.success(`Added ${m} minutes for ${target.studentName || 'the student'}`);
      setTarget(null); setReason(''); setMinutes(10);
      load();
    } catch (e) { setFormError(errorMessage(e, 'Could not extend')); } finally { setBusy(false); }
  };

  if (sessions === null) return <div className="space-y-2 p-4" role="status" aria-label="Loading sessions"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>;
  return (
    <div className="space-y-3 p-3 sm:p-4">
      {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
      {sessions.length === 0 && !error && <p className="text-sm text-ink-2">Nobody has started yet.</p>}
      {sessions.length > 0 && (
        <Table>
          <THead>
            <Tr><Th>Student</Th><Th>Attempt</Th><Th>Status</Th><Th>Deadline</Th><Th>Extra</Th><Th><span className="sr-only">Actions</span></Th></Tr>
          </THead>
          <TBody>
            {sessions.map((s) => (
              <Tr key={s.id}>
                <Td><span className="font-medium">{s.studentName}</span><br /><span className="text-xs text-ink-2">{s.studentEmail}</span></Td>
                <Td>{s.attemptNo}</Td>
                <Td>{s.status}{s.timedOut ? ' (time ran out)' : ''}</Td>
                <Td className="whitespace-nowrap">{fmtDateTime(s.deadline)}</Td>
                <Td className="text-xs text-ink-2">
                  {s.extraTimePercent ? `${s.extraTimePercent}% accommodation` : ''}
                  {s.extensions?.length ? ` +${s.extensions.reduce((n, x) => n + x.minutes, 0)} min extended` : ''}
                </Td>
                <Td className="whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    {s.status === 'active' && (
                      <Button size="sm" variant="secondary" onClick={() => { setTarget(s); setFormError(''); }}>Extend time</Button>
                    )}
                    {s.caseId && <Link className="text-xs font-semibold text-primary-700 underline" to={`/integrity/${s.caseId}`}>Review case</Link>}
                  </div>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
      {target && (
        <Modal
          open
          onClose={() => setTarget(null)}
          title={`Extend time for ${target.studentName || 'student'}`}
          description="Adds time to this running session, even past the closing time. Use it for things like a power cut or a platform problem."
          footer={(
            <>
              <Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button>
              <Button loading={busy} onClick={submit}>Extend</Button>
            </>
          )}
        >
          <div className="space-y-4">
            <Field label="Minutes (1 to 480)">
              {(p) => <Input {...p} type="number" min="1" max="480" value={minutes} onChange={(e) => setMinutes(e.target.value)} />}
            </Field>
            <Field label="Reason">
              {(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} placeholder="e.g. power cut for 8 minutes" />}
            </Field>
            {formError && <p role="alert" className="text-sm text-danger-700">{formError}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default SessionsPanel;
