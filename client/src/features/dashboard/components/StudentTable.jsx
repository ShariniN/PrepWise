import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { Button, EmptyState, Skeleton, Table, THead, TBody, Tr, Th, Td } from '../../../components/ui';
import AttentionChips from './AttentionChips';
import Sparkline from './Sparkline';
import { fmtLastActive, fmtNum, fmtDate, LEVEL_LABELS } from '../utils';

const COLUMNS = [
  { key: 'name', label: 'Student', sort: 'name' },
  { key: 'attention', label: 'To follow up' },
  { key: 'group', label: 'Group', sort: 'group' },
  { key: 'targetRoleTitle', label: 'Target role', sort: 'targetRoleTitle' },
  { key: 'cvScore', label: 'CV score', sort: 'cvScore', num: true },
  { key: 'lastInterviewScore', label: 'Last interview', sort: 'lastInterviewScore', num: true },
  { key: 'trend', label: 'Trend' },
  { key: 'practiceSolved', label: 'Practice solved', sort: 'practiceSolved', num: true },
  { key: 'lastActive', label: 'Last active', sort: 'lastActive' },
];

const dash = <span className="text-ink-muted">-</span>;

const parseSort = (s) => (s?.startsWith('-') ? { key: s.slice(1), desc: true } : { key: s || 'name', desc: false });

const SortHeader = ({ col, sort, onSort }) => {
  const cur = parseSort(sort);
  const active = cur.key === col.sort;
  const Icon = active ? (cur.desc ? ArrowDown : ArrowUp) : ChevronsUpDown;
  const next = () => {
    if (active) return onSort(cur.desc ? col.sort : `-${col.sort}`);
    // Text starts A-Z; numbers and dates start with the highest / most recent.
    return onSort(col.num || col.sort === 'lastActive' ? `-${col.sort}` : col.sort);
  };
  return (
    <Th aria-sort={active ? (cur.desc ? 'descending' : 'ascending') : 'none'} className={col.num ? 'text-right' : undefined}>
      <button type="button" onClick={next} className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-ink">
        {col.label}
        <Icon size={13} aria-hidden="true" className={active ? 'text-ink' : 'text-ink-muted'} />
      </button>
    </Th>
  );
};

const StudentTable = ({ data, loading, sort, onSort, onPage }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const open = (id) => navigate(`/dashboard/students/${id}`, { state: { from: `${location.pathname}${location.search}` } });

  if (loading && !data) {
    return (
      <div role="status" className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
        <span className="sr-only">Loading students...</span>
      </div>
    );
  }
  if (!data) return null;
  if (!data.students.length) {
    return <EmptyState title="No students match" description="Try another search, group or filter." className="!py-10" />;
  }

  const first = (data.page - 1) * data.pageSize + 1;
  const last = first + data.students.length - 1;

  return (
    <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={loading || undefined}>
      <Table className="!shadow-none" maxHeight="70vh">
        <caption className="sr-only">Students, sorted by {parseSort(sort).key}. Select a row to open the student&apos;s record.</caption>
        <THead>
          <Tr>
            {COLUMNS.map((c) => (c.sort
              ? <SortHeader key={c.key} col={c} sort={sort} onSort={onSort} />
              : <Th key={c.key}>{c.label}</Th>))}
          </Tr>
        </THead>
        <TBody>
          {data.students.map((s) => (
            <Tr key={s.id} onClick={() => open(s.id)} className="align-top">
              <Td className="min-w-[13rem]">
                <Link
                  to={`/dashboard/students/${s.id}`}
                  state={{ from: `${location.pathname}${location.search}` }}
                  onClick={(e) => e.stopPropagation()}
                  className="font-semibold text-ink hover:text-primary-700 hover:underline"
                >
                  {s.name}
                </Link>
                <span className="block text-xs text-ink-2">{s.email}</span>
              </Td>
              <Td className="min-w-[11rem]"><AttentionChips reasons={s.attention} empty={dash} /></Td>
              <Td className="whitespace-nowrap">{s.group || dash}</Td>
              <Td className="min-w-[9rem]">{s.targetRoleTitle || dash}</Td>
              <Td className="text-right tabular-nums">{fmtNum(s.cvScore, '%')}</Td>
              <Td className="whitespace-nowrap text-right tabular-nums">
                {fmtNum(s.lastInterviewScore)}
                {LEVEL_LABELS[s.lastLevelReached] && <span className="block text-xs text-ink-2">reached {LEVEL_LABELS[s.lastLevelReached]}</span>}
              </Td>
              <Td><Sparkline values={s.trend} /></Td>
              <Td className="text-right tabular-nums">{s.practiceSolved}</Td>
              <Td className="whitespace-nowrap"><span title={fmtDate(s.lastActive)}>{fmtLastActive(s.lastActive)}</span></Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">{first}-{last} of {data.total} students</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>Previous</Button>
          <span className="text-sm text-ink-2">Page {data.page} of {Math.max(1, data.totalPages)}</span>
          <Button size="sm" variant="secondary" disabled={data.page >= data.totalPages} onClick={() => onPage(data.page + 1)}>Next</Button>
        </div>
      </nav>
    </div>
  );
};

export default StudentTable;
