import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { X } from 'lucide-react';
import AppShell from '../../components/AppShell';
import api, { errorMessage } from '../../lib/apiClient';
import { Button, Card, CardTitle, Field, Input, Skeleton } from '../../components/ui';
import TargetRoleEditor from './components/TargetRoleEditor';

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

const InstitutionSettings = () => {
  const [settings, setSettings] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [domains, setDomains] = useState([]);
  const [selfSignup, setSelfSignup] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const apply = (data) => {
    setSettings(data);
    setDomains(data.allowedEmailDomains);
    setSelfSignup(data.selfSignup);
  };

  useEffect(() => {
    let cancelled = false;
    api.get('/api/institution/settings')
      .then(({ data }) => { if (!cancelled) apply(data); })
      .catch((err) => { if (!cancelled) setLoadError(errorMessage(err, 'Could not load the settings')); });
    return () => { cancelled = true; };
  }, []);

  const addDomain = (e) => {
    e.preventDefault();
    const d = newDomain.trim().toLowerCase().replace(/^@/, '');
    if (!d) return;
    if (!domains.includes(d)) setDomains([...domains, d]);
    setNewDomain('');
  };

  const dirty = settings && (selfSignup !== settings.selfSignup || !sameList(domains, settings.allowedEmailDomains));

  const save = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const { data } = await api.patch('/api/institution/settings', { allowedEmailDomains: domains, selfSignup });
      setSettings((prev) => ({ ...prev, allowedEmailDomains: data.allowedEmailDomains, selfSignup: data.selfSignup }));
      setDomains(data.allowedEmailDomains);
      setSelfSignup(data.selfSignup);
      toast.success('Settings saved');
    } catch (err) {
      setSaveError(errorMessage(err, 'Could not save the settings'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title="University settings" subtitle="Who can sign up, and the roles your students prepare for." width="narrow">
      {loadError && <p role="alert" className="rounded-2xl bg-danger-50 p-3 text-sm text-danger-700">{loadError}</p>}
      {!settings && !loadError && <Skeleton className="h-64 w-full" />}
      {settings && (
        <div className="space-y-6">
          <Card>
            <CardTitle>Sign-up</CardTitle>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                role="switch"
                checked={selfSignup}
                onChange={(e) => setSelfSignup(e.target.checked)}
                className="mt-1 h-4 w-4 accent-primary-600"
              />
              <span>
                <span className="block text-sm font-medium text-ink">Let students sign up themselves</span>
                <span className="block text-sm text-ink-2">Anyone with an email from the domains below can create a student account. Turn this off to allow invitations only.</span>
              </span>
            </label>

            <div className="mt-6">
              <p className="mb-2 text-sm font-medium text-ink">Allowed email domains</p>
              {domains.length === 0 ? (
                <p className="mb-3 text-sm text-ink-muted">No domains listed. Invitations can go to any email address.</p>
              ) : (
                <ul className="mb-3 flex flex-wrap gap-2" aria-label="Allowed email domains">
                  {domains.map((d) => (
                    <li key={d} className="flex items-center gap-1 rounded-full bg-primary-100 py-1 pl-3 pr-1 text-sm font-medium text-primary-800">
                      {d}
                      <button
                        type="button"
                        aria-label={`Remove ${d}`}
                        onClick={() => setDomains(domains.filter((x) => x !== d))}
                        className="grid h-6 w-6 place-items-center rounded-full hover:bg-primary-200"
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={addDomain} className="flex items-end gap-2">
                <Field label="Add a domain" className="flex-1">
                  {(p) => <Input {...p} placeholder="university.edu" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />}
                </Field>
                <Button type="submit" variant="secondary" disabled={!newDomain.trim()}>Add</Button>
              </form>
            </div>

            {saveError && <p role="alert" className="mt-4 rounded-2xl bg-danger-50 p-3 text-sm text-danger-700">{saveError}</p>}
            <div className="mt-5 flex justify-end">
              <Button onClick={save} loading={saving} disabled={!dirty}>Save changes</Button>
            </div>
          </Card>

          <Card>
            <CardTitle>Student seats</CardTitle>
            <p className="text-3xl font-semibold text-ink">{settings.contractedStudentLimit}</p>
            <p className="mt-1 text-sm text-ink-2">Set in your contract. Contact us to change it.</p>
          </Card>

          <TargetRoleEditor roles={settings.targetRoles} onChange={(targetRoles) => setSettings((prev) => ({ ...prev, targetRoles }))} />
        </div>
      )}
    </AppShell>
  );
};

export default InstitutionSettings;
