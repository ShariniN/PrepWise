import React, { useState } from 'react';
import { toast } from 'react-toastify';
import api, { errorMessage } from '../../../api/client';
import { Badge, Button, Card, Field, Table, THead, TBody, Tr, Th, Td, Textarea } from '../../../components/ui';
import CopyLinkButton from './CopyLinkButton';

const TEMPLATE = 'email,name,role,group\nstudent1@example.edu,Student One,student,CS 2026\nlecturer1@example.edu,Lecturer One,lecturer,\n';

const STATUS_TONE = { invited: 'success', skipped: 'neutral', blocked_limit: 'danger', error: 'warning' };

const downloadTemplate = () => {
  const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'prepwise-people-template.csv';
  a.click();
  URL.revokeObjectURL(url);
};

const ImportCsv = ({ onDone }) => {
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsv(await file.text());
    e.target.value = '';
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!csv.trim()) return setError('Choose a CSV file or paste CSV text first.');
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const { data } = await api.post('/api/institution/people/import', { csv });
      setResult(data);
      toast.success(`${data.summary?.invited ?? 0} invited`);
      onDone();
    } catch (err) {
      setError(
        err.response?.status === 413
          ? 'Too many rows. The maximum is 2000 per import; nothing was imported.'
          : errorMessage(err, 'Import failed')
      );
    } finally {
      setBusy(false);
    }
  };

  const s = result?.summary;

  return (
    <Card as="section" aria-labelledby="csv-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="csv-h" className="font-display text-lg font-semibold text-ink">Import CSV</h3>
        <Button size="sm" variant="ghost" onClick={downloadTemplate}>Download template</Button>
      </div>
      <p className="mt-1 text-sm text-ink-2">Columns: email (required), name, role (default student), group (optional, e.g. CS 2026). The header row is required.</p>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <Field label="CSV file">
          {(p) => (
            <input id={p.id} type="file" accept=".csv,text/csv,text/plain" onChange={onFile}
              className="block w-full cursor-pointer rounded-2xl border border-line bg-surface text-sm text-ink-2 file:mr-4 file:cursor-pointer file:rounded-full file:border-0 file:bg-primary-50 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-primary-700 hover:file:bg-primary-100" />
          )}
        </Field>
        <Field label="Or paste CSV text">
          {(p) => <Textarea {...p} rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} className="font-mono" />}
        </Field>
        <Button type="submit" loading={busy}>{busy ? 'Importing...' : 'Import'}</Button>
      </form>
      {error && <p role="alert" className="mt-4 rounded-2xl bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}

      {result && (
        <div className="mt-5" role="status">
          <p className="text-sm text-ink">
            {s.total} rows: {s.invited || 0} invited, {s.skipped || 0} skipped, {s.blocked_limit || 0} blocked by the limit
            {s.error ? `, ${s.error} with errors` : ''}.
          </p>
          {result.limitReached && (
            <p className="mt-2 rounded-2xl bg-danger-50 p-3 text-sm text-danger-700">
              The student limit was reached. Remaining student rows were not invited (staff rows were still added).
            </p>
          )}
          {result.warning && !result.limitReached && <p className="mt-2 rounded-2xl bg-sun-50 p-3 text-sm text-ink">{result.warning}</p>}
          <Table className="mt-3">
            <caption className="sr-only">Import results per CSV line</caption>
            <THead>
              <Tr><Th>Line</Th><Th>Email</Th><Th>Role</Th><Th>Result</Th><Th>Note</Th></Tr>
            </THead>
            <TBody>
              {result.results.map((r) => (
                <Tr key={`${r.line}-${r.email}`}>
                  <Td>{r.line}</Td>
                  <Td>{r.email}</Td>
                  <Td>{r.role}</Td>
                  <Td><Badge tone={STATUS_TONE[r.status] || 'neutral'}>{r.status.replace('_', ' ')}</Badge></Td>
                  <Td>{r.reason} <CopyLinkButton link={r.inviteLink} /></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </Card>
  );
};

export default ImportCsv;
