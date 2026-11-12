import React, { useContext, useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import { toast } from 'react-toastify';
import { AppContext } from '../../../app/AppContext';
import api, { errorMessage } from '../../../lib/apiClient';
import { Button, Field, Select } from '../../../components/ui';

// Lets a student change the role they are preparing for (profile settings, student only).
const TargetRolePicker = () => {
  const { targetRoleId, setTargetRole } = useContext(AppContext);
  const [roles, setRoles] = useState(null);
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get('/api/me/target-roles')
      .then(({ data }) => {
        if (cancelled) return;
        setRoles(data);
        setSelected(data.find((r) => r.id === targetRoleId)?.id || '');
      })
      .catch((err) => { if (!cancelled) setError(errorMessage(err, 'Could not load the roles')); });
    return () => { cancelled = true; };
  }, [targetRoleId]);

  const current = roles?.find((r) => r.id === targetRoleId);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const { data } = await api.put('/api/me/target-role', { targetRoleId: selected });
      setTargetRole(data.targetRoleTitle, data.targetRoleId);
      toast.success('Target role updated');
    } catch (err) {
      setError(errorMessage(err, 'Could not save your role'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface p-6 rounded-xl shadow">
      <h3 className="text-lg font-semibold mb-1 flex items-center">
        <Target className="mr-2" size={20} aria-hidden="true" />
        Target role
      </h3>
      <p className="mb-4 text-sm text-ink-2">Your CV, practice and interviews are tailored to this role.</p>
      {roles && (
        <Field label="Role you are preparing for" hint={current?.description}>
          {(p) => (
            <Select {...p} value={selected} onChange={(e) => setSelected(e.target.value)}>
              {!current && <option value="" disabled>Choose a role</option>}
              {roles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </Select>
          )}
        </Field>
      )}
      {error && <p role="alert" className="mt-3 rounded-2xl bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}
      <Button className="mt-4" onClick={save} loading={saving} disabled={!selected || selected === current?.id}>Save role</Button>
    </div>
  );
};

export default TargetRolePicker;
