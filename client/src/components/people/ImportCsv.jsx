import React, { useState } from 'react';
import { toast } from 'react-toastify';
import api, { errorMessage } from '../../api/client';
import CopyLinkButton from './CopyLinkButton';

const TEMPLATE = 'email,name,role\nstudent1@example.edu,Student One,student\nlecturer1@example.edu,Lecturer One,lecturer\n';

const STATUS_STYLE = {
  invited: 'bg-green-100 text-green-800',
  skipped: 'bg-gray-100 text-gray-700',
  blocked_limit: 'bg-red-100 text-red-800',
  error: 'bg-amber-100 text-amber-800',
};

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
    <section className="bg-white rounded-xl shadow p-5" aria-labelledby="csv-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="csv-h" className="font-semibold text-gray-800">Import CSV</h3>
        <button type="button" onClick={downloadTemplate} className="text-sm text-indigo-700 hover:underline">Download template</button>
      </div>
      <p className="text-xs text-gray-500 mt-1">Columns: email (required), name, role (default student). The header row is required.</p>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <div>
          <label htmlFor="csv-file" className="block text-sm font-medium text-gray-700 mb-1">CSV file</label>
          <input id="csv-file" type="file" accept=".csv,text/csv,text/plain" onChange={onFile} className="text-sm" />
        </div>
        <div>
          <label htmlFor="csv-text" className="block text-sm font-medium text-gray-700 mb-1">Or paste CSV text</label>
          <textarea id="csv-text" rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} className="w-full bg-gray-100 rounded-md px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
          {busy ? 'Importing...' : 'Import'}
        </button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-red-700 bg-red-50 rounded-md p-3">{error}</p>}

      {result && (
        <div className="mt-4" role="status">
          <p className="text-sm text-gray-700">
            {s.total} rows: {s.invited || 0} invited, {s.skipped || 0} skipped, {s.blocked_limit || 0} blocked by the limit
            {s.error ? `, ${s.error} with errors` : ''}.
          </p>
          {result.limitReached && (
            <p className="mt-2 text-sm text-red-700 bg-red-50 rounded-md p-3">
              The student limit was reached. Remaining student rows were not invited (staff rows were still added).
            </p>
          )}
          {result.warning && !result.limitReached && <p className="mt-2 text-sm text-amber-800 bg-amber-50 rounded-md p-3">{result.warning}</p>}
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <caption className="sr-only">Import results per CSV line</caption>
              <thead><tr className="text-left text-gray-500 border-b">
                <th scope="col" className="py-1 pr-3">Line</th><th scope="col" className="pr-3">Email</th><th scope="col" className="pr-3">Role</th><th scope="col" className="pr-3">Result</th><th scope="col">Note</th>
              </tr></thead>
              <tbody>
                {result.results.map((r) => (
                  <tr key={`${r.line}-${r.email}`} className="border-b last:border-0">
                    <td className="py-1 pr-3">{r.line}</td>
                    <td className="pr-3">{r.email}</td>
                    <td className="pr-3">{r.role}</td>
                    <td className="pr-3"><span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_STYLE[r.status] || ''}`}>{r.status.replace('_', ' ')}</span></td>
                    <td>{r.reason} <CopyLinkButton link={r.inviteLink} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};

export default ImportCsv;
