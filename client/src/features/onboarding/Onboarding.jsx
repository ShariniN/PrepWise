import React, { useContext, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Check, Upload } from 'lucide-react';
import { AppContext } from '../../app/AppContext';
import AppShell from '../../components/AppShell';
import api, { errorMessage } from '../../lib/apiClient';
import { homeForRole } from '../../lib/roles';
import { Button, Card, EmptyState, Skeleton } from '../../components/ui';

// First sign-in for a student: step 1 picks the role they are preparing for, step 2 offers a CV upload.
const Onboarding = () => {
  const navigate = useNavigate();
  const { role, needsOnboarding, setTargetRole, getUserData } = useContext(AppContext);
  // Decided once, so finishing step 1 (which clears needsOnboarding) does not bounce the student home mid-way.
  const [alreadyDone] = useState(needsOnboarding === false);

  const [step, setStep] = useState(1);
  const [roles, setRoles] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get('/api/me/target-roles')
      .then(({ data }) => { if (!cancelled) setRoles(data); })
      .catch((err) => { if (!cancelled) setLoadError(errorMessage(err, 'Could not load the roles')); });
    return () => { cancelled = true; };
  }, []);

  if (alreadyDone) return <Navigate to={homeForRole(role)} replace />;

  const home = () => navigate(homeForRole(role), { replace: true });

  const saveRole = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const { data } = await api.put('/api/me/target-role', { targetRoleId: selected });
      setTargetRole(data.targetRoleTitle, data.targetRoleId);
      setStep(2);
    } catch (err) {
      setSaveError(errorMessage(err, 'Could not save your role'));
    } finally {
      setSaving(false);
    }
  };

  const uploadCv = async () => {
    setUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('cv', file);
      await api.put('/api/user/upload-cv', formData);
      toast.success('CV uploaded');
      await getUserData();
      home();
    } catch (err) {
      setUploadError(errorMessage(err, 'Could not upload your CV'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <AppShell
      nav={false}
      width="narrow"
      eyebrow={`Step ${step} of 2`}
      title={step === 1 ? 'Which role are you preparing for?' : 'Add your CV'}
      subtitle={step === 1
        ? 'We tailor your practice and interviews to this role. You can change it later in your profile.'
        : 'Your CV is scored against your role. You can also do this later.'}
    >
      {step === 1 && (
        <div className="space-y-5">
          {loadError && <p role="alert" className="rounded-2xl bg-danger-50 p-3 text-sm text-danger-700">{loadError}</p>}
          {!roles && !loadError && <Skeleton className="h-40 w-full" />}
          {roles && roles.length === 0 && (
            <EmptyState title="No roles yet" description="Your university has not added any roles. Ask your administrator." />
          )}
          {roles && roles.length > 0 && (
            <div role="radiogroup" aria-label="Target role" className="grid gap-3 sm:grid-cols-2">
              {roles.map((r) => {
                const on = selected === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setSelected(r.id)}
                    className={`rounded-3xl border p-5 text-left transition focus:outline-none focus:ring-4 focus:ring-primary-600/15 ${
                      on ? 'border-primary-600 bg-primary-50 shadow-soft' : 'border-line bg-surface hover:border-primary-300'
                    }`}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-display text-base font-semibold text-ink">{r.title}</span>
                      {on && <Check size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-primary-700" />}
                    </span>
                    <span className="mt-2 block text-sm leading-relaxed text-ink-2">{r.description}</span>
                  </button>
                );
              })}
            </div>
          )}
          {saveError && <p role="alert" className="rounded-2xl bg-danger-50 p-3 text-sm text-danger-700">{saveError}</p>}
          <div className="flex justify-end">
            <Button onClick={saveRole} disabled={!selected} loading={saving}>Continue</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <Card className="space-y-5">
          <div>
            <label htmlFor="onboarding-cv" className="mb-2 block text-sm font-medium text-ink">CV (PDF, up to 10 MB)</label>
            <input
              id="onboarding-cv"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => { setFile(e.target.files?.[0] || null); setUploadError(''); }}
              className="block w-full text-sm text-ink-2 file:mr-4 file:rounded-full file:border-0 file:bg-primary-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-800"
            />
          </div>
          {uploadError && <p role="alert" className="rounded-2xl bg-danger-50 p-3 text-sm text-danger-700">{uploadError}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" onClick={home} disabled={uploading}>Skip for now</Button>
            <Button onClick={uploadCv} disabled={!file} loading={uploading} icon={<Upload size={16} aria-hidden="true" />}>Upload CV</Button>
          </div>
        </Card>
      )}
    </AppShell>
  );
};

export default Onboarding;
