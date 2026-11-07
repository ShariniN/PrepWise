import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { addTest, updateTest, deleteTest } from '../../api/questions';
import { errorMessage } from '../../api/client';

const MODES = ['trim', 'exact', 'tokens'];
const inp = 'w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono bg-white disabled:bg-gray-100';

const toRow = (t) => ({ id: t.id, input: t.input || '', expectedOutput: t.expectedOutput || '', visible: !!t.visible, weight: t.weight ?? 1, comparison: t.comparison || 'trim', dirty: false });

const TestRow = ({ row, onChange, onSave, onDelete, disabled, busy }) => (
  <tr className="align-top border-t">
    <td className="p-1"><textarea className={inp} rows={3} disabled={disabled} value={row.input} onChange={(e) => onChange({ input: e.target.value })} aria-label="Test input" /></td>
    <td className="p-1"><textarea className={inp} rows={3} disabled={disabled} value={row.expectedOutput} onChange={(e) => onChange({ expectedOutput: e.target.value })} aria-label="Expected output" /></td>
    <td className="p-1 text-center"><input type="checkbox" disabled={disabled} checked={row.visible} onChange={(e) => onChange({ visible: e.target.checked })} aria-label="Visible to students" /></td>
    <td className="p-1"><input type="number" min="0" max="100" className={inp} disabled={disabled} value={row.weight} onChange={(e) => onChange({ weight: e.target.value })} aria-label="Weight" /></td>
    <td className="p-1">
      <select className={inp} disabled={disabled} value={row.comparison} onChange={(e) => onChange({ comparison: e.target.value })} aria-label="Comparison mode">
        {MODES.map((m) => <option key={m}>{m}</option>)}
      </select>
    </td>
    <td className="p-1 whitespace-nowrap">
      <button type="button" disabled={disabled || busy || !row.dirty} onClick={onSave} className="text-xs px-2 py-1 rounded bg-indigo-600 text-white disabled:opacity-40">{row.id ? 'Save' : 'Add'}</button>
      <button type="button" disabled={disabled || busy} onClick={onDelete} className="text-xs px-2 py-1 ml-1 text-red-600 disabled:opacity-40">Delete</button>
    </td>
  </tr>
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
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Test cases ({rows.length}/50, {visibleCount} visible)</h3>
        <button type="button" disabled={disabled || busy || rows.length >= 50} onClick={add} className="text-xs px-2 py-1 rounded bg-gray-200 disabled:opacity-50">Add test</button>
      </div>
      <p className="text-xs text-gray-500">Visible tests are shown to students with expected output; hidden tests only report pass or fail. At least one visible test is needed to publish. Changing a test on a published question moves it back to draft.</p>
      {rows.length === 0 ? <p className="text-sm text-gray-500">No tests yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[640px]">
            <thead className="text-xs text-gray-500">
              <tr><th className="p-1">Input (stdin)</th><th className="p-1">Expected output</th><th className="p-1 text-center">Visible</th><th className="p-1 w-16">Weight</th><th className="p-1 w-24">Compare</th><th className="p-1" /></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <TestRow key={r.id || `new-${i}`} row={r} disabled={disabled} busy={busy}
                  onChange={(p) => patch(i, p)} onSave={() => save(i)} onDelete={() => remove(i)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TestCaseTable;
