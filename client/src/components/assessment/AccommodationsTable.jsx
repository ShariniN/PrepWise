import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { Button, Input, Select, Table, TBody, THead, Td, Th, Tr } from '../ui';
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
    <Tr className="align-top">
      <Td><span className="font-medium">{student?.name || acc.userId}</span><br /><span className="text-xs text-ink-2">{student?.email}</span></Td>
      <Td>
        <div className="flex items-center gap-1.5">
          <Input type="number" min="0" max="200" value={pct} onChange={(e) => setPct(e.target.value)} disabled={locked}
            className="w-24" aria-label="Extra time percent" /> %
        </div>
      </Td>
      <Td>
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-primary-700">{off.length} signal{off.length === 1 ? '' : 's'} off</summary>
          <div className="mt-2 grid gap-1">
            {ALL_SIGNALS.map((s) => (
              <label key={s} className="flex items-center gap-2 text-xs text-ink">
                <input type="checkbox" className="accent-primary-600" checked={off.includes(s)} onChange={() => toggle(s)} disabled={locked} /> {SIGNAL_LABELS[s]}
              </label>
            ))}
          </div>
        </details>
      </Td>
      <Td>
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} disabled={locked} className="min-w-[10rem]" aria-label="Note" />
      </Td>
      <Td className="whitespace-nowrap">
        <div className="flex gap-2">
          <Button size="sm" disabled={busy || locked} onClick={save}>Save</Button>
          <Button size="sm" variant="secondary" disabled={busy || locked} onClick={remove}>Remove</Button>
        </div>
      </Td>
    </Tr>
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
    <div className="space-y-3">
      <p className="text-sm text-ink-2">Applies to attempts started afterwards. For a student who is already sitting, use Extend time on the Sessions panel. Turning a signal off means it is not recorded for that student at all.</p>
      {accs.length > 0 && (
        <Table>
          <THead><Tr><Th>Student</Th><Th>Extra time</Th><Th>Signals</Th><Th>Note</Th><Th><span className="sr-only">Actions</span></Th></Tr></THead>
          <TBody>{accs.map((a) => <Row key={`${a.userId}-${a.extraTimePercent}-${(a.disabledSignals || []).join()}`} acc={a} student={byId[a.userId]}
            assessmentId={assessment.id} locked={locked} onSaved={onChanged} />)}</TBody>
        </Table>
      )}
      {!locked && (
        <div className="flex flex-wrap items-center gap-3">
          <Select value={pick} onChange={(e) => setPick(e.target.value)} className="w-auto min-w-[14rem]" aria-label="Student">
            <option value="">Add a student...</option>
            {available.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.email})</option>)}
          </Select>
          <Button size="sm" variant="secondary" disabled={!pick} loading={busy} onClick={add}>Add</Button>
        </div>
      )}
    </div>
  );
};

export default AccommodationsTable;
