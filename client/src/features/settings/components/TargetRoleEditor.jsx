import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import api, { errorMessage } from '../../../lib/apiClient';
import { Button, Card, CardTitle, ConfirmDialog, Field, Input, Textarea } from '../../../components/ui';

const EMPTY = { title: '', description: '', skills: '' };
const skillsToText = (skills) => (skills || []).join(', ');
const textToSkills = (text) => text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

// Add, edit and delete the roles students can prepare for. `roles` is the list from the settings endpoint,
// `onChange` receives the new list after every successful change.
const TargetRoleEditor = ({ roles, onChange }) => {
  const [editingId, setEditingId] = useState(null); // a role id, 'new', or null
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  const open = (role) => {
    setError('');
    setEditingId(role ? role.id : 'new');
    setForm(role ? { title: role.title, description: role.description, skills: skillsToText(role.skills) } : EMPTY);
  };

  const close = () => { setEditingId(null); setError(''); };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = { title: form.title.trim(), description: form.description.trim(), skills: textToSkills(form.skills) };
    try {
      const { data } = editingId === 'new'
        ? await api.post('/api/institution/target-roles', body)
        : await api.patch(`/api/institution/target-roles/${editingId}`, body);
      onChange(data.targetRoles);
      toast.success(editingId === 'new' ? 'Role added' : 'Role updated');
      close();
    } catch (err) {
      setError(errorMessage(err, 'Could not save the role'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setDeleteError('');
    try {
      const { data } = await api.delete(`/api/institution/target-roles/${toDelete.id}`);
      onChange(data.targetRoles);
      toast.success('Role deleted');
      setToDelete(null);
    } catch (err) {
      setDeleteError(errorMessage(err, 'Could not delete the role'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardTitle action={editingId !== 'new' && <Button size="sm" variant="secondary" icon={<Plus size={14} aria-hidden="true" />} onClick={() => open(null)}>Add role</Button>}>
        Target roles
      </CardTitle>
      <p className="mb-4 text-sm text-ink-2">
        Students pick one of these roles. Their CV, practice and interviews are tailored to it. Deleting a role asks the students on it to choose again.
      </p>

      <ul className="space-y-3">
        {roles.map((r) => (
          <li key={r.id} className="rounded-2xl border border-line p-4">
            {editingId === r.id ? (
              <RoleForm form={form} setForm={setForm} onSubmit={save} onCancel={close} busy={busy} error={error} submitLabel="Save role" />
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{r.title}</p>
                  {r.description && <p className="mt-1 text-sm text-ink-2">{r.description}</p>}
                  {r.skills.length > 0 && <p className="mt-2 text-xs text-ink-muted">Skills: {r.skills.join(', ')}</p>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" icon={<Pencil size={14} aria-hidden="true" />} onClick={() => open(r)} aria-label={`Edit ${r.title}`}>Edit</Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 size={14} aria-hidden="true" />} onClick={() => { setDeleteError(''); setToDelete(r); }} aria-label={`Delete ${r.title}`}>Delete</Button>
                </div>
              </div>
            )}
          </li>
        ))}
        {editingId === 'new' && (
          <li className="rounded-2xl border border-primary-200 bg-primary-50/40 p-4">
            <RoleForm form={form} setForm={setForm} onSubmit={save} onCancel={close} busy={busy} error={error} submitLabel="Add role" />
          </li>
        )}
      </ul>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        loading={busy}
        danger
        title={`Delete "${toDelete?.title}"?`}
        description={
          <span>
            Students on this role will be asked to choose another one.
            {deleteError && <span role="alert" className="mt-3 block rounded-2xl bg-danger-50 p-3 text-sm text-danger-700">{deleteError}</span>}
          </span>
        }
        confirmLabel="Delete role"
      />
    </Card>
  );
};

const RoleForm = ({ form, setForm, onSubmit, onCancel, busy, error, submitLabel }) => (
  <form onSubmit={onSubmit} className="space-y-4">
    <Field label="Title" required>
      {(p) => <Input {...p} required maxLength={80} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}
    </Field>
    <Field label="Description" hint="What the role does day to day. Students see this when they choose.">
      {(p) => <Textarea {...p} rows={3} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
    </Field>
    <Field label="Key skills" hint="Separate with commas.">
      {(p) => <Input {...p} value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} />}
    </Field>
    {error && <p role="alert" className="rounded-2xl bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}
    <div className="flex justify-end gap-2">
      <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
      <Button type="submit" loading={busy} disabled={!form.title.trim()}>{submitLabel}</Button>
    </div>
  </form>
);

export default TargetRoleEditor;
