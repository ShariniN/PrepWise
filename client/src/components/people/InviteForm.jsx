import React, { useState } from 'react';
import { toast } from 'react-toastify';
import api, { errorMessage } from '../../api/client';
import { ROLE_LABELS } from '../../utils/roles';
import { Button, Card, CardTitle, Field, Input, Select } from '../ui';
import CopyLinkButton from './CopyLinkButton';

const InviteForm = ({ onDone }) => {
  const [form, setForm] = useState({ email: '', name: '', role: 'student', group: '' });
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
      if (form.group.trim()) body.group = form.group.trim();
      const { data } = await api.post('/api/institution/people/invite', body);
      setLast(data);
      if (data.warning) toast.warn(data.warning);
      toast.success(data.emailSent ? 'Invitation sent' : 'Invitation created (email not sent)');
      setForm({ email: '', name: '', role: form.role, group: form.group });
      onDone();
    } catch (err) {
      // The server message already says what to do (e.g. the student limit message), so show it as it is.
      setError(errorMessage(err, 'Could not send invitation'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card as="form" onSubmit={submit} aria-label="Invite person" className="flex flex-col">
      <CardTitle>Invite person</CardTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" required>
          {(p) => <Input {...p} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
        </Field>
        <Field label="Name (optional)">
          {(p) => <Input {...p} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
        </Field>
        <Field label="Role">
          {(p) => (
            <Select {...p} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Group (optional)" hint="A class or year, e.g. CS 2026. Lecturers can filter by it.">
          {(p) => <Input {...p} list="people-groups" maxLength={60} value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })} />}
        </Field>
        <div className="flex items-end sm:col-span-2">
          <Button type="submit" loading={busy} block>{busy ? 'Sending...' : 'Send invite'}</Button>
        </div>
      </div>
      {error && <p role="alert" className="mt-4 rounded-2xl bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}
      {last && (
        <div role="status" className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-success-50 p-3 text-sm text-success-700">
          <span>Invited {last.user?.email}. {last.emailSent ? 'Email sent.' : 'The email could not be sent; share the link yourself.'}</span>
          <CopyLinkButton link={last.inviteLink} />
        </div>
      )}
    </Card>
  );
};

export default InviteForm;
