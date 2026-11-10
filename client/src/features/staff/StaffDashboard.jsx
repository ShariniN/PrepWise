import React, { useContext, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import AppShell from '../../components/AppShell';
import { Button, Card, Field, Input, Select } from '../../components/ui';
import { ErrorState } from '../../components/DataStates';
import OverviewPanel, { OverviewSkeleton } from './components/OverviewPanel';
import StudentTable from './components/StudentTable';
import useApiData from '../../hooks/useApiData';
import { getOverview, listStudents, downloadStudentsCsv } from './api';
import { saveBlob } from '../../api/analytics';
import { errorMessage } from '../../api/client';
import { AppContext } from '../../app/AppContext';
import { ROLES } from '../../utils/roles';
import { ATTENTION_FILTERS } from './utils';

const PAGE_SIZE = 25;
const linkCls = 'font-medium text-primary-700 underline underline-offset-2 hover:text-primary-800';

// attention filter value -> API query
const attentionParams = (a) => (a === 'any' ? { needsAttention: 1 } : a ? { attention: a } : {});

// Lecturer home: how the university's students do in mock interviews, CV analysis and Practice.
// Filters live in the URL so they survive opening a student and coming back.
const StaffDashboard = () => {
  const { role } = useContext(AppContext);
  const [params, setParams] = useSearchParams();
  const group = params.get('group') || '';
  const search = params.get('q') || '';
  const sort = params.get('sort') || 'name';
  const attention = params.get('attention') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [searchText, setSearchText] = useState(search);
  const [exporting, setExporting] = useState(false);

  // Change some params; anything that changes the result set goes back to page 1.
  const update = (changes, { keepPage = false } = {}) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => { if (v === '' || v == null) next.delete(k); else next.set(k, String(v)); });
    if (!keepPage) next.delete('page');
    if (next.get('sort') === 'name') next.delete('sort');
    if (next.get('page') === '1') next.delete('page');
    setParams(next, { replace: true });
  };

  // Debounced search into the URL.
  useEffect(() => {
    if (searchText.trim() === search) return undefined;
    const t = setTimeout(() => update({ q: searchText.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  const filters = { group, search, sort, ...attentionParams(attention) };
  const query = { ...filters, page, pageSize: PAGE_SIZE };
  const overview = useApiData(() => getOverview(group), `overview|${group}`);
  const students = useApiData(() => listStudents(query), JSON.stringify(query));

  const groups = overview.data?.groups || [];

  const exportCsv = async () => {
    setExporting(true);
    try {
      saveBlob(await downloadStudentsCsv(filters), group ? `students-${group.replace(/[^\w-]+/g, '_')}.csv` : 'students.csv');
      toast.success('Download started. The export is recorded in the audit log.');
    } catch (e) {
      toast.error(errorMessage(e, 'Export failed'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppShell
      eyebrow={role === ROLES.ADMIN ? 'University admin' : 'Lecturer'}
      title="Students"
      subtitle={(
        <>
          How your students do in mock interviews, CV analysis and Practice.
          {role === ROLES.LECTURER && <> Answers waiting for your judgement are in the <Link to="/grading" className={linkCls}>grading queue</Link>.</>}
        </>
      )}
      actions={(
        <Field label="Group" className="w-full sm:w-56">
          {(p) => (
            <Select {...p} value={group} onChange={(e) => update({ group: e.target.value })}>
              <option value="">All students</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
              {group && !groups.includes(group) && <option value={group}>{group}</option>}
            </Select>
          )}
        </Field>
      )}
    >
      <div className="space-y-8">
        <section aria-label="Overview">
          {overview.error && <ErrorState message={overview.error} onRetry={overview.reload} />}
          {overview.loading && !overview.data && <OverviewSkeleton />}
          {overview.data && (
            <div className={overview.loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
              <OverviewPanel data={overview.data} />
            </div>
          )}
        </section>

        <Card as="section" aria-labelledby="st-h" className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="st-h" className="font-display text-xl font-semibold text-ink">{group ? `Students in ${group}` : 'All students'}</h2>
              <p className="mt-1 text-sm text-ink-2">Select a student to see their interviews, CVs, skills and Practice.</p>
            </div>
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <Button variant="secondary" size="sm" loading={exporting} onClick={exportCsv} icon={<Download size={15} aria-hidden="true" />}>
                Download CSV
              </Button>
              <p className="text-xs text-ink-2">Exports are recorded in the audit log.</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_15rem]">
            <div>
              <label htmlFor="st-search" className="sr-only">Search by name or email</label>
              <Input id="st-search" type="search" icon={<Search size={16} aria-hidden="true" />} placeholder="Search name or email"
                value={searchText} maxLength={100} onChange={(e) => setSearchText(e.target.value)} />
            </div>
            <div>
              <label htmlFor="st-att" className="sr-only">Show</label>
              <Select id="st-att" value={attention} onChange={(e) => update({ attention: e.target.value })}>
                {ATTENTION_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </Select>
            </div>
          </div>

          {students.error && <ErrorState message={students.error} onRetry={students.reload} />}
          <StudentTable
            data={students.data}
            loading={students.loading}
            sort={sort}
            onSort={(s) => update({ sort: s })}
            onPage={(p) => update({ page: p }, { keepPage: true })}
          />
        </Card>
      </div>
    </AppShell>
  );
};

export default StaffDashboard;
