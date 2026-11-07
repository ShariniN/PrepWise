import React, { useState } from 'react';
import { toast } from 'react-toastify';
import api, { errorMessage, errorCode } from '../../api/client';
import { ROLE_LABELS } from '../../utils/roles';
import CopyLinkButton from './CopyLinkButton';

const inputCls = 'w-full bg-gray-100 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400';

const InviteForm = ({ onDone }) => {
  const [form, setForm] = useState({ email: '', name: '', role: 'student' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [last, setLast] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setLast(null);
    try {
      const body = { email: form.email.trim(), role: form.role };
      if (form.name.trim()) body.name = form.name.trim();
      const { data } = await api.post('/api/institution/people/invite', body);
      setLast(data);
      if (data.warning) toast.warn(data.warning);
      toast.success(data.emailSent ? 'Invitation sent' : 'Invitation created (email not sent)');
      setForm({ email: '', name: '', role: form.role });
      onDone();
    } catch (err) {
      const code = errorCode(err);
      setError(
        code === 'STUDENT_LIMIT_REACHED'
          ? `${errorMessage(err)} Deactivate a student or ask PrepWise to raise your limit.`
          : errorMessage(err, 'Could not send invitation')
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-xl shadow p-5 grid gap-3 sm:grid-cols-6" aria-label="Invite person">
      <h3 className="sm:col-span-6 font-semibold text-gray-800">Invite person</h3>
      <div className="sm:col-span-2">
        <label htmlFor="inv-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input id="inv-email" type="email" required className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="inv-name" className="block text-sm font-medium text-gray-700 mb-1">Name (optional)</label>
        <input id="inv-name" className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="sm:col-span-1">
        <label htmlFor="inv-role" className="block text-sm font-medium text-gray-700 mb-1">Role</label>
        <select id="inv-role" className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="sm:col-span-1 flex items-end">
        <button type="submit" disabled={busy} className="w-full px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
          {busy ? 'Sending...' : 'Send invite'}
        </button>
      </div>
      {error && <p role="alert" className="sm:col-span-6 text-sm text-red-700 bg-red-50 rounded-md p-3">{error}</p>}
      {last && (
        <div role="status" className="sm:col-span-6 text-sm text-green-800 bg-green-50 rounded-md p-3 flex flex-wrap items-center gap-3">
          <span>Invited {last.user?.email}. {last.emailSent ? 'Email sent.' : 'The email could not be sent; share the link yourself.'}</span>
          <CopyLinkButton link={last.inviteLink} />
        </div>
      )}
    </form>
  );
};

export default InviteForm;
