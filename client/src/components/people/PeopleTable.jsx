import React, { useState } from 'react';
import { toast } from 'react-toastify';
import api, { errorMessage } from '../../api/client';
import { ROLE_LABELS } from '../../utils/roles';
import { Badge, Button, Card, EmptyState, Input, Select, Skeleton, Table, THead, TBody, Tr, Th, Td } from '../ui';
import ConfirmDialog from './ConfirmDialog';
import CopyLinkButton from './CopyLinkButton';

const STATUS_TONE = { active: 'success', invited: 'primary', deactivated: 'neutral' };

const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString() : '-');
const linkBtn = 'text-sm font-medium text-primary-700 hover:underline disabled:opacity-50';

// Inline group editor: PATCH /api/institution/people/:id/group ("" clears the group).
const GroupCell = ({ person, onChanged }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(person.group || '');
  const [saving, setSaving] = useState(false);
  const who = person.name || person.email;

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/institution/people/${person.id}/group`, { group: value.trim() });
      toast.success(value.trim() ? `Group set to ${value.trim()}` : 'Group cleared');
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not change the group'));
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex flex-col items-start gap-0.5">
        <span className={person.group ? 'whitespace-nowrap' : 'text-ink-muted'}>{person.group || 'No group'}</span>
        <button type="button" className={linkBtn} onClick={() => { setValue(person.group || ''); setEditing(true); }}
          aria-label={`Edit group of ${who}`}>
          Edit group
        </button>
      </div>
    );
  }
  return (
    <form className="flex min-w-[14rem] flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); save(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}>
      <Input aria-label={`New group for ${who}`} list="people-groups" maxLength={60} autoFocus value={value}
        onChange={(e) => setValue(e.target.value)} className="!w-40 !py-1.5" placeholder="e.g. CS 2026" />
      <Button type="submit" size="sm" loading={saving}>Save</Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
    </form>
  );
};

const PeopleTable = ({ people, loading, error, filters, setFilters, groups = [], onChanged }) => {
  const [pending, setPending] = useState(null); // { kind, person, role? }
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState({}); // personId -> inviteLink (non-production)

  const run = async () => {
    const { kind, person } = pending;
    setBusy(true);
    try {
      let res;
      if (kind === 'deactivate') res = await api.patch(`/api/institution/people/${person.id}/deactivate`);
      if (kind === 'reactivate') res = await api.patch(`/api/institution/people/${person.id}/reactivate`);
      if (kind === 'resend') res = await api.post(`/api/institution/people/${person.id}/resend-invite`);
      if (kind === 'role') res = await api.patch(`/api/institution/people/${person.id}/role`, { role: pending.role });
      if (res.data.inviteLink) setLinks((l) => ({ ...l, [person.id]: res.data.inviteLink }));
      toast.success(
        { deactivate: 'Person deactivated', reactivate: 'Person reactivated', resend: 'Invitation re-sent', role: 'Role changed' }[kind]
      );
      setPending(null);
      onChanged();
    } catch (err) {
      // 409 STUDENT_LIMIT_REACHED, LAST_ADMIN etc. carry a readable message.
      toast.error(errorMessage(err, 'Action failed'));
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  const dialog = () => {
    if (!pending) return null;
    const { kind, person } = pending;
    const who = person.name || person.email;
    const common = { busy, onConfirm: run, onCancel: () => setPending(null) };
    if (kind === 'deactivate')
      return <ConfirmDialog {...common} danger title="Deactivate this person?" confirmLabel="Deactivate" message={`${who} will be signed out immediately and cannot log in. Their data is kept.`} />;
    if (kind === 'reactivate')
      return <ConfirmDialog {...common} title="Reactivate this person?" confirmLabel="Reactivate" message={`${who} will be able to log in again. Students count toward your limit.`} />;
    if (kind === 'resend')
      return <ConfirmDialog {...common} title="Resend invitation?" confirmLabel="Resend" message={`A new invitation email goes to ${person.email}. The old link stops working.`} />;
    return (
      <ConfirmDialog {...common} title="Change role" confirmLabel="Change role"
        message={
          <>
            Choose a new role for {who}.{' '}
            <Select aria-label="New role" className="mt-3" value={pending.role} onChange={(e) => setPending({ ...pending, role: e.target.value })}>
              {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </>
        } />
    );
  };

  return (
    <Card as="section" aria-labelledby="people-h">
      <h3 id="people-h" className="mb-4 font-display text-lg font-semibold text-ink">People</h3>
      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-[minmax(0,1fr)_11rem_11rem_11rem]">
        <div className="sm:col-span-3 lg:col-span-1">
          <label htmlFor="f-search" className="sr-only">Search by name or email</label>
          <Input id="f-search" type="search" placeholder="Search name or email" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        </div>
        <div>
          <label htmlFor="f-role" className="sr-only">Filter by role</label>
          <Select id="f-role" value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}>
            <option value="">All roles</option>
            {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="f-status" className="sr-only">Filter by status</label>
          <Select id="f-status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="deactivated">Deactivated</option>
          </Select>
        </div>
        <div>
          <label htmlFor="f-group" className="sr-only">Filter by group</label>
          <Select id="f-group" value={filters.group} onChange={(e) => setFilters({ ...filters, group: e.target.value })}>
            <option value="">All groups</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            {filters.group && !groups.includes(filters.group) && <option value={filters.group}>{filters.group}</option>}
          </Select>
        </div>
      </div>

      {error && <p role="alert" className="mb-3 rounded-2xl bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}

      {loading && !people ? (
        <div role="status" className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <span className="sr-only">Loading people...</span>
        </div>
      ) : people && people.length === 0 ? (
        <EmptyState title="No people match" description="Invite someone or import a CSV." className="!py-10" />
      ) : people ? (
        <Table className="!shadow-none" >
          <caption className="sr-only">People in your university</caption>
          <THead>
            <Tr><Th>Name</Th><Th>Email</Th><Th>Group</Th><Th>Role</Th><Th>Status</Th><Th>Last active</Th><Th>Actions</Th></Tr>
          </THead>
          <TBody>
            {people.map((p) => (
              <Tr key={p.id} className="align-top">
                <Td className="whitespace-nowrap font-medium">{p.name}</Td>
                <Td className="whitespace-nowrap">{p.email}</Td>
                <Td><GroupCell key={`${p.id}-${p.group}`} person={p} onChanged={onChanged} /></Td>
                <Td className="whitespace-nowrap">{ROLE_LABELS[p.role] || p.role}</Td>
                <Td>
                  <Badge tone={STATUS_TONE[p.status] || 'neutral'}>{p.status}</Badge>
                  {p.status === 'invited' && p.inviteExpiresAt && <div className="mt-1 text-xs text-ink-2">expires {fmt(p.inviteExpiresAt)}</div>}
                </Td>
                <Td className="whitespace-nowrap">{fmt(p.lastActive)}</Td>
                <Td>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {p.status === 'active' && <button type="button" className={linkBtn} onClick={() => setPending({ kind: 'deactivate', person: p })}>Deactivate</button>}
                    {p.status === 'deactivated' && <button type="button" className={linkBtn} onClick={() => setPending({ kind: 'reactivate', person: p })}>Reactivate</button>}
                    {p.status === 'invited' && <button type="button" className={linkBtn} onClick={() => setPending({ kind: 'resend', person: p })}>Resend invite</button>}
                    {p.status !== 'deactivated' && <button type="button" className={linkBtn} onClick={() => setPending({ kind: 'role', person: p, role: ROLE_LABELS[p.role] ? p.role : 'student' })}>Change role</button>}
                    <CopyLinkButton link={links[p.id]} />
                  </div>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      ) : null}
      {dialog()}
    </Card>
  );
};

export default PeopleTable;
