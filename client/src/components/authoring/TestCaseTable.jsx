import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { addTest, updateTest, deleteTest } from '../../api/questions';
import { errorMessage } from '../../api/client';
import { Button, Input, Select, Table, THead, TBody, Tr, Th, Td, Textarea } from '../ui';

const MODES = ['trim', 'exact', 'tokens'];
const mono = '!rounded-xl !px-3 !py-2 font-mono text-xs';

const toRow = (t) => ({ id: t.id, input: t.input || '', expectedOutput: t.expectedOutput || '', visible: !!t.visible, weight: t.weight ?? 1, comparison: t.comparison || 'trim', dirty: false });

const TestRow = ({ row, onChange, onSave, onDelete, disabled, busy }) => (
  <Tr className="align-top">
    <Td className="!p-2"><Textarea className={mono} rows={3} disabled={disabled} value={row.input} onChange={(e) => onChange({ input: e.target.value })} aria-label="Test input" /></Td>
    <Td className="!p-2"><Textarea className={mono} rows={3} disabled={disabled} value={row.expectedOutput} onChange={(e) => onChange({ expectedOutput: e.target.value })} aria-label="Expected output" /></Td>
    <Td className="!p-2 text-center"><input type="checkbox" className="h-4 w-4 accent-primary-600" disabled={disabled} checked={row.visible} onChange={(e) => onChange({ visible: e.target.checked })} aria-label="Visible to students" /></Td>
    <Td className="!p-2"><Input type="number" min="0" max="100" className="!px-3 !py-2" disabled={disabled} value={row.weight} onChange={(e) => onChange({ weight: e.target.value })} aria-label="Weight" /></Td>
    <Td className="!p-2">
      <Select className="!px-3 !py-2" disabled={disabled} value={row.comparison} onChange={(e) => onChange({ comparison: e.target.value })} aria-label="Comparison mode">
        {MODES.map((m) => <option key={m}>{m}</option>)}
      </Select>
    </Td>
    <Td className="!p-2 whitespace-nowrap">
      <Button size="sm" disabled={disabled || busy || !row.dirty} onClick={onSave}>{row.id ? 'Save' : 'Add'}</Button>
      <Button size="sm" variant="ghost" className="ml-1 !text-danger-600 hover:!bg-danger-50" disabled={disabled || busy} onClick={onDelete}>Delete</Button>
    </Td>
  </Tr>
);

// Test cases live on their own endpoints, so each row saves independently.
// onChanged() tells the page to reload the question (validation may have become stale).
const TestCaseTable = ({ questionId, tests, disabled, onChanged }) => {
  const [rows, setRows] = useState(() => (tests || []).map(toRow));
  const [busy, setBusy] = useState(false);

  const patch = (i, p) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p, dirty: true } : r)));

  const save = async (i) => {
    const r = rows[i];
    if (r.expectedOutput === '') { toast.error('Expected output is required'); return; }
    const body = { input: r.input, expectedOutput: r.expectedOutput, visible: r.visible, weight: Number(r.weight), comparison: r.comparison };
    setBusy(true);
    try {
      const data = r.id ? await updateTest(questionId, r.id, body) : await addTest(questionId, body);
      setRows((rs) => rs.map((x, j) => (j === i ? toRow(data.test) : x)));
      onChanged?.();
    } catch (e) { toast.error(errorMessage(e, 'Could not save test')); } finally { setBusy(false); }
  };

  const remove = async (i) => {
    const r = rows[i];
    if (!r.id) { setRows((rs) => rs.filter((_, j) => j !== i)); return; }
    if (!window.confirm('Delete this test case?')) return;
    setBusy(true);
    try {
      await deleteTest(questionId, r.id);
      setRows((rs) => rs.filter((_, j) => j !== i));
      onChanged?.();
    } catch (e) { toast.error(errorMessage(e, 'Could not delete test')); } finally { setBusy(false); }
  };

  const add = () => setRows((rs) => [...rs, { id: null, input: '', expectedOutput: '', visible: rs.length === 0, weight: 1, comparison: 'trim', dirty: true }]);

  const visibleCount = rows.filter((r) => r.visible).length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-semibold text-ink">Test cases ({rows.length}/50, {visibleCount} visible)</h3>
        <Button size="sm" variant="secondary" disabled={disabled || busy || rows.length >= 50} onClick={add}>Add test</Button>
      </div>
      <p className="text-sm text-ink-2">Visible tests are shown to students with expected output; hidden tests only report pass or fail. At least one visible test is needed to publish. Changing a test on a published question moves it back to draft.</p>
      {rows.length === 0 ? <p className="text-sm text-ink-2">No tests yet.</p> : (
        <Table className="!shadow-none">
          <THead>
            <Tr><Th>Input (stdin)</Th><Th>Expected output</Th><Th className="text-center">Visible</Th><Th className="w-20">Weight</Th><Th className="w-28">Compare</Th><Th><span className="sr-only">Actions</span></Th></Tr>
          </THead>
          <TBody>
            {rows.map((r, i) => (
              <TestRow key={r.id || `new-${i}`} row={r} disabled={disabled} busy={busy}
                onChange={(p) => patch(i, p)} onSave={() => save(i)} onDelete={() => remove(i)} />
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
};

export default TestCaseTable;
