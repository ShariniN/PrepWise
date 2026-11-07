import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import ConfirmDialog from '../analytics/ConfirmDialog';
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

  if (sessions === null) return <p className="text-sm text-gray-500 p-3" role="status">Loading sessions...</p>;
  return (
    <div className="p-3 space-y-2">
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {sessions.length === 0 && !error && <p className="text-sm text-gray-500">Nobody has started yet.</p>}
      {sessions.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500">
              <th className="py-1 pr-3">Student</th><th className="pr-3">Attempt</th><th className="pr-3">Status</th>
              <th className="pr-3">Deadline</th><th className="pr-3">Extra</th><th /></tr></thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="py-1.5 pr-3"><span className="font-medium">{s.studentName}</span><br /><span className="text-xs text-gray-500">{s.studentEmail}</span></td>
                  <td className="pr-3">{s.attemptNo}</td>
                  <td className="pr-3">{s.status}{s.timedOut ? ' (time ran out)' : ''}</td>
                  <td className="pr-3">{fmtDateTime(s.deadline)}</td>
                  <td className="pr-3 text-xs text-gray-600">
                    {s.extraTimePercent ? `${s.extraTimePercent}% accommodation` : ''}
                    {s.extensions?.length ? ` +${s.extensions.reduce((n, x) => n + x.minutes, 0)} min extended` : ''}
                  </td>
                  <td className="space-x-2 whitespace-nowrap">
                    {s.status === 'active' && (
                      <button type="button" className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300" onClick={() => { setTarget(s); setFormError(''); }}>Extend time</button>
                    )}
                    {s.caseId && <Link className="text-xs text-indigo-700 underline" to={`/integrity/${s.caseId}`}>Review case</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {target && (
        <ConfirmDialog title={`Extend time for ${target.studentName || 'student'}`} confirmLabel="Extend" busy={busy}
          onConfirm={submit} onCancel={() => setTarget(null)}>
          <p className="text-gray-600">Adds time to this running session, even past the closing time. Use it for things like a power cut or a platform problem.</p>
          <label className="block text-sm">Minutes (1 to 480)
            <input type="number" min="1" max="480" value={minutes} onChange={(e) => setMinutes(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded px-2 py-1" />
          </label>
          <label className="block text-sm">Reason
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300}
              className="mt-1 w-full border border-gray-300 rounded px-2 py-1" placeholder="e.g. power cut for 8 minutes" />
          </label>
          {formError && <p role="alert" className="text-red-700">{formError}</p>}
        </ConfirmDialog>
      )}
    </div>
  );
};

export default SessionsPanel;
