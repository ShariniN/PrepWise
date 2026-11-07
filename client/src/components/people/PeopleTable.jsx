import React, { useState } from 'react';
import { toast } from 'react-toastify';
import api, { errorMessage } from '../../api/client';
import { ROLE_LABELS } from '../../utils/roles';
import ConfirmDialog from './ConfirmDialog';
import CopyLinkButton from './CopyLinkButton';

const STATUS_STYLE = {
  active: 'bg-green-100 text-green-800',
  invited: 'bg-blue-100 text-blue-800',
  deactivated: 'bg-gray-200 text-gray-700',
};

const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString() : '-');
const linkBtn = 'text-indigo-700 hover:underline text-sm disabled:opacity-50';

const PeopleTable = ({ people, loading, error, filters, setFilters, onChanged }) => {
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
            <select aria-label="New role" className="mt-2 block w-full bg-gray-100 rounded-md px-3 py-2 text-sm" value={pending.role} onChange={(e) => setPending({ ...pending, role: e.target.value })}>
              {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </>
        } />
    );
  };

  const sel = 'bg-gray-100 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400';

  return (
    <section className="bg-white rounded-xl shadow p-5" aria-labelledby="people-h">
      <h3 id="people-h" className="font-semibold text-gray-800 mb-3">People</h3>
      <div className="flex flex-wrap gap-2 mb-4">
        <div>
          <label htmlFor="f-search" className="sr-only">Search by name or email</label>
          <input id="f-search" type="search" placeholder="Search name or email" className={`${sel} w-64`} value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        </div>
        <div>
          <label htmlFor="f-role" className="sr-only">Filter by role</label>
          <select id="f-role" className={sel} value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}>
            <option value="">All roles</option>
            {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-status" className="sr-only">Filter by status</label>
          <select id="f-status" className={sel} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="deactivated">Deactivated</option>
          </select>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-md p-3 mb-3">{error}</p>}

      {loading && !people ? (
        <p className="text-sm text-gray-500" role="status">Loading people...</p>
      ) : people && people.length === 0 ? (
        <p className="text-sm text-gray-500">No people match. Invite someone or import a CSV.</p>
      ) : people ? (
        <div className="overflow-x-auto" aria-busy={loading}>
          <table className="min-w-full text-sm">
            <caption className="sr-only">People in your university</caption>
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th scope="col" className="py-2 pr-3">Name</th><th scope="col" className="pr-3">Email</th><th scope="col" className="pr-3">Role</th>
                <th scope="col" className="pr-3">Status</th><th scope="col" className="pr-3">Last active</th><th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-b last:border-0 align-top">
                  <td className="py-2 pr-3 font-medium text-gray-800">{p.name}</td>
                  <td className="pr-3">{p.email}</td>
                  <td className="pr-3">{ROLE_LABELS[p.role] || p.role}</td>
                  <td className="pr-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_STYLE[p.status] || ''}`}>{p.status}</span>
                    {p.status === 'invited' && p.inviteExpiresAt && <div className="text-xs text-gray-400">expires {fmt(p.inviteExpiresAt)}</div>}
                  </td>
                  <td className="pr-3">{fmt(p.lastActive)}</td>
                  <td>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {p.status === 'active' && <button type="button" className={linkBtn} onClick={() => setPending({ kind: 'deactivate', person: p })}>Deactivate</button>}
                      {p.status === 'deactivated' && <button type="button" className={linkBtn} onClick={() => setPending({ kind: 'reactivate', person: p })}>Reactivate</button>}
                      {p.status === 'invited' && <button type="button" className={linkBtn} onClick={() => setPending({ kind: 'resend', person: p })}>Resend invite</button>}
                      {p.status !== 'deactivated' && <button type="button" className={linkBtn} onClick={() => setPending({ kind: 'role', person: p, role: p.role })}>Change role</button>}
                      <CopyLinkButton link={links[p.id]} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {dialog()}
    </section>
  );
};

export default PeopleTable;
