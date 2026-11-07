import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { putAccommodation, deleteAccommodation } from '../../api/assessments';
import { errorMessage } from '../../api/client';
import { ALL_SIGNALS, SIGNAL_LABELS } from '../../utils/assessment';

const Row = ({ acc, student, assessmentId, locked, onSaved }) => {
  const [pct, setPct] = useState(acc.extraTimePercent || 0);
  const [off, setOff] = useState(acc.disabledSignals || []);
  const [note, setNote] = useState(acc.note || '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const n = Number(pct);
    if (!Number.isFinite(n) || n < 0 || n > 200) { toast.error('Extra time must be 0 to 200 percent'); return; }
    setBusy(true);
    try {
      const d = await putAccommodation(assessmentId, acc.userId, { extraTimePercent: n, disabledSignals: off, note });
      toast.success('Accommodation saved'); onSaved(d.assessment);
    } catch (e) { toast.error(errorMessage(e, 'Could not save')); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { const d = await deleteAccommodation(assessmentId, acc.userId); onSaved(d.assessment); }
    catch (e) { toast.error(errorMessage(e, 'Could not remove')); } finally { setBusy(false); }
  };
  const toggle = (s) => setOff((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <tr className="border-t align-top">
      <td className="py-2 pr-3 text-sm"><span className="font-medium">{student?.name || acc.userId}</span><br /><span className="text-xs text-gray-500">{student?.email}</span></td>
      <td className="pr-3">
        <input type="number" min="0" max="200" value={pct} onChange={(e) => setPct(e.target.value)} disabled={locked}
          className="w-20 border border-gray-300 rounded px-2 py-1 text-sm" aria-label="Extra time percent" /> %
      </td>
      <td className="pr-3">
        <details>
          <summary className="text-xs cursor-pointer text-indigo-700">{off.length} signal{off.length === 1 ? '' : 's'} off</summary>
          <div className="mt-1 grid gap-0.5">
            {ALL_SIGNALS.map((s) => (
              <label key={s} className="text-xs flex items-center gap-1">
                <input type="checkbox" checked={off.includes(s)} onChange={() => toggle(s)} disabled={locked} /> {SIGNAL_LABELS[s]}
              </label>
            ))}
          </div>
        </details>
      </td>
      <td className="pr-3"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} disabled={locked}
        className="w-full min-w-[8rem] border border-gray-300 rounded px-2 py-1 text-sm" aria-label="Note" /></td>
      <td className="whitespace-nowrap space-x-1">
        <button type="button" disabled={busy || locked} onClick={save} className="text-xs px-2 py-1 rounded bg-indigo-600 text-white disabled:opacity-50">Save</button>
        <button type="button" disabled={busy || locked} onClick={remove} className="text-xs px-2 py-1 rounded bg-gray-200 disabled:opacity-50">Remove</button>
      </td>
    </tr>
  );
};

// Per-student extra time and disabled signals. Applies to sessions started afterwards.
const AccommodationsTable = ({ assessment, students, locked, onChanged }) => {
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const accs = assessment.accommodations || [];
  const byId = Object.fromEntries(students.map((s) => [s.id, s]));
  const available = students.filter((s) => !accs.some((a) => a.userId === s.id));

  const add = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      const d = await putAccommodation(assessment.id, pick, { extraTimePercent: 25, disabledSignals: [], note: '' });
      setPick(''); onChanged(d.assessment);
    } catch (e) { toast.error(errorMessage(e, 'Could not add')); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-600">Applies to attempts started afterwards. For a student who is already sitting, use Extend time on the Sessions panel. Turning a signal off means it is not recorded for that student at all.</p>
      {accs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="text-left text-xs text-gray-500"><th>Student</th><th>Extra time</th><th>Signals</th><th>Note</th><th /></tr></thead>
            <tbody>{accs.map((a) => <Row key={`${a.userId}-${a.extraTimePercent}-${(a.disabledSignals || []).join()}`} acc={a} student={byId[a.userId]}
              assessmentId={assessment.id} locked={locked} onSaved={onChanged} />)}</tbody>
          </table>
        </div>
      )}
      {!locked && (
        <div className="flex gap-2 items-center">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-sm" aria-label="Student">
            <option value="">Add a student...</option>
            {available.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.email})</option>)}
          </select>
          <button type="button" disabled={!pick || busy} onClick={add} className="text-xs px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50">Add</button>
        </div>
      )}
    </div>
  );
};

export default AccommodationsTable;
