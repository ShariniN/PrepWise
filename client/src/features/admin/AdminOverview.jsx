import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { toast } from 'react-toastify';
import AppShell from '../../components/AppShell';
import { Button, Card, Field, Select } from '../../components/ui';
import ConfirmDialog from '../../components/ConfirmDialog';
import { BarList } from '../../components/Charts';
import { ErrorState, LoadingState } from '../../components/DataStates';
import InsufficientData from './components/InsufficientData';
import StatCard from './components/StatCard';
import useApiData from '../../hooks/useApiData';
import { admin } from './api';
import { saveBlob } from '../../lib/download';
import { errorMessage } from '../../lib/apiClient';

const Evidence = () => {
  const [includeStudents, setIncludeStudents] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [format, setFormat] = useState('csv');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      if (format === 'csv') {
        saveBlob(await admin.evidenceCsv(includeStudents), 'evidence.csv');
      } else {
        const data = await admin.evidence(includeStudents);
        saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'evidence.json');
      }
      toast.success(includeStudents ? 'Download started. Student-level export recorded in the audit log.' : 'Download started.');
      setDialog(false);
    } catch (e) {
      toast.error(errorMessage(e, 'Export failed'));
      setDialog(false);
    } finally { setBusy(false); }
  };

  const start = () => (includeStudents ? setDialog(true) : run());

  return (
    <Card as="section" className="space-y-4" aria-labelledby="ev-h">
      <div>
        <h2 id="ev-h" className="font-display text-xl font-semibold text-ink">Evidence for renewal</h2>
        <p className="mt-1 text-sm text-ink-2">Counts for the whole university. Student names are left out unless you ask for them.</p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Format" className="w-32">
          {(p) => (
            <Select {...p} value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="csv">CSV</option><option value="json">JSON</option>
            </Select>
          )}
        </Field>
        <label className="flex min-h-[2.75rem] items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="h-4 w-4 accent-primary-600" checked={includeStudents} onChange={(e) => setIncludeStudents(e.target.checked)} />
          Include students (names, emails, activity)
        </label>
        <Button variant="dark" loading={busy} onClick={start} icon={<Download size={16} aria-hidden="true" />}>
          Download evidence
        </Button>
      </div>
      {dialog && (
        <ConfirmDialog title="Export with student details?" confirmLabel="Export students" busy={busy} onConfirm={run} onCancel={() => setDialog(false)}>
          <p>This file will contain every student&apos;s name, email and activity counts. Handle it as personal data.</p>
          <p className="font-semibold">The export is written to the audit log.</p>
        </ConfirmDialog>
      )}
    </Card>
  );
};

const AdminOverview = () => {
  const { data, error, loading, reload } = useApiData(() => admin.overview(), 'overview');
  const a = data?.adoption;
  const imp = data?.improvement;
  const ai = data?.aiUsage;

  return (
    <AppShell
      title="Overview: is the platform being used and is it working?"
      subtitle={(
        <>
          Adoption against your contract, improvement in Practice, and AI usage.{' '}
          <Link to="/manage-people" className="font-medium text-primary-700 underline underline-offset-2 hover:text-primary-800">Manage people</Link>
        </>
      )}
    >
      <div className="space-y-6">
        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={reload} />}

        {data && (
          <>
            <Card as="section" className="space-y-4" aria-labelledby="ad-h">
              <h2 id="ad-h" className="font-display text-xl font-semibold text-ink">Adoption against the contracted limit</h2>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Active, last 7 days" value={a.activeStudents7d} />
                <StatCard label="Active, last 30 days" value={a.activeStudents30d} />
                <StatCard label="Registered students" value={a.registeredActiveStudents} />
                <StatCard label="Contracted limit" value={a.contractedStudentLimit ?? 'not set'}
                  hint={a.contractEnd ? `Contract ends ${new Date(a.contractEnd).toLocaleDateString()}` : 'No contract end date'} />
              </div>
              {a.percentOfLimitActive30d != null && (
                <BarList caption="Students active in 30 days as a share of the contracted limit"
                  items={[{ label: 'Active 30 days / limit', value: a.percentOfLimitActive30d, detail: `${a.activeStudents30d} of ${a.contractedStudentLimit}` }]} />
              )}
              <p className="text-xs text-ink-2">Active means a run, a submission or a mock interview in the window.</p>
            </Card>

            <Card as="section" className="space-y-4" aria-labelledby="im-h">
              <h2 id="im-h" className="font-display text-xl font-semibold text-ink">Improvement in Practice</h2>
              <p className="text-sm text-ink-2">{imp.definition}</p>
              <p className="text-xs text-ink-2">{imp.excludedAttempts} attempt{imp.excludedAttempts === 1 ? '' : 's'} not counted (fallback or unconfirmed AI scores).</p>
              {imp.insufficientData ? (
                <InsufficientData n={imp.n} minimum={imp.minimum} notice={imp.notice} />
              ) : (
                <div className="space-y-3">
                  <BarList caption={`First vs latest mean score (${imp.students} students, ${imp.pairs} question pairs)`}
                    items={[{ label: 'First attempt', value: imp.meanFirst }, { label: 'Latest attempt', value: imp.meanLatest }]} />
                  <p className="text-sm text-ink">Change: {imp.delta > 0 ? '+' : ''}{imp.delta} points.</p>
                </div>
              )}
            </Card>

            <Card as="section" className="space-y-4" aria-labelledby="au-h">
              <h2 id="au-h" className="font-display text-xl font-semibold text-ink">AI usage against the monthly cap</h2>
              <BarList caption={`AI calls in ${ai.month}`} max={100}
                items={[{ label: 'Share of cap used', value: ai.percentOfCap, detail: `${ai.calls} of ${ai.cap} calls` }]} />
              {ai.percentOfCap >= 80 && (
                <p className="rounded-2xl bg-sun-50 p-3 text-sm text-ink">Near the cap: once reached, AI features pause and manual grading remains available.</p>
              )}
            </Card>
          </>
        )}

        <Evidence />
      </div>
    </AppShell>
  );
};

export default AdminOverview;
