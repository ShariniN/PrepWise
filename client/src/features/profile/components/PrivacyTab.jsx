import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api, { errorMessage } from '../../../api/client';
import { AppContext } from '../../../app/AppContext';

const inputCls = 'w-full bg-sand rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-400';

const fetchExport = async () => (await api.get('/api/me/export')).data;

const PrivacyTab = () => {
  const navigate = useNavigate();
  const { clearAuth } = useContext(AppContext);

  const [consents, setConsents] = useState(null);
  const [consentError, setConsentError] = useState('');
  const [loadingConsents, setLoadingConsents] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [subs, setSubs] = useState(null);
  const [subsError, setSubsError] = useState('');

  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    api.get('/api/compliance/subprocessors')
      .then(({ data }) => setSubs(data))
      .catch((e) => setSubsError(errorMessage(e, 'Could not load the list of subprocessors')));
  }, []);

  const showConsents = async () => {
    setLoadingConsents(true);
    setConsentError('');
    try {
      const data = await fetchExport();
      setConsents(data.consents || []);
    } catch (e) {
      setConsentError(errorMessage(e, 'Could not load consent records'));
    } finally {
      setLoadingConsents(false);
    }
  };

  const download = async () => {
    setDownloading(true);
    try {
      const data = await fetchExport();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `prepwise-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setConsents(data.consents || []);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not export your data'));
    } finally {
      setDownloading(false);
    }
  };

  const deleteAccount = async (e) => {
    e.preventDefault();
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete('/api/me', { data: { password } });
      toast.success('Your account has been deleted');
      clearAuth();
      navigate('/login', { replace: true });
    } catch (err) {
      setDeleteError(errorMessage(err, 'Could not delete your account'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-surface rounded-xl shadow p-6 space-y-8">
      <h3 className="text-lg font-semibold text-ink">Privacy and data</h3>

      <section aria-labelledby="pv-consent">
        <h4 id="pv-consent" className="font-medium text-ink mb-1">Consent status</h4>
        <p className="text-sm text-ink-2 mb-3">The consents you have given (terms, privacy, AI processing, recording).</p>
        {consents === null ? (
          <button type="button" onClick={showConsents} disabled={loadingConsents} className="px-3 py-2 text-sm bg-sand rounded-xl hover:bg-line disabled:opacity-60">
            {loadingConsents ? 'Loading...' : 'Show my consent records'}
          </button>
        ) : consents.length === 0 ? (
          <p className="text-sm text-ink-muted">No consent records yet.</p>
        ) : (
          <ul className="text-sm divide-y border rounded-xl">
            {consents.map((c, i) => (
              <li key={`${c.type}-${i}`} className="flex justify-between px-3 py-2">
                <span>{String(c.type).replace('_', ' ')} (version {c.version})</span>
                <span className="text-ink-muted">{c.acceptedAt ? new Date(c.acceptedAt).toLocaleDateString() : ''}</span>
              </li>
            ))}
          </ul>
        )}
        {consentError && <p role="alert" className="text-sm text-danger-600 mt-2">{consentError}</p>}
      </section>

      <section aria-labelledby="pv-export">
        <h4 id="pv-export" className="font-medium text-ink mb-1">Download my data</h4>
        <p className="text-sm text-ink-2 mb-3">A JSON file with your profile, interviews, CV analyses, skills and consents.</p>
        <button type="button" onClick={download} disabled={downloading} className="px-4 py-2 text-sm bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-60">
          {downloading ? 'Preparing...' : 'Download my data'}
        </button>
      </section>

      <section aria-labelledby="pv-subs">
        <h4 id="pv-subs" className="font-medium text-ink mb-1">Subprocessors</h4>
        <p className="text-sm text-ink-2 mb-3">Third parties that process data on our behalf{subs?.updated ? ` (updated ${subs.updated})` : ''}.</p>
        {subsError ? (
          <p role="alert" className="text-sm text-danger-600">{subsError}</p>
        ) : !subs ? (
          <p className="text-sm text-ink-muted" role="status">Loading...</p>
        ) : subs.subprocessors.length === 0 ? (
          <p className="text-sm text-ink-muted">None listed.</p>
        ) : (
          <ul className="space-y-2">
            {subs.subprocessors.map((s) => (
              <li key={s.name} className="border rounded-xl p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">{s.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === 'in_use' ? 'bg-success-100 text-success-700' : 'bg-sand text-ink-2'}`}>
                    {s.status === 'in_use' ? 'In use' : 'Planned'}
                  </span>
                </div>
                <p className="text-ink-2">{s.purpose}</p>
                <p className="text-ink-muted text-xs mt-1">Data: {s.data}{s.note ? `. ${s.note}` : ''}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="pv-delete" className="border border-danger-100 rounded-xl p-4">
        <h4 id="pv-delete" className="font-medium text-danger-700 mb-1">Delete my account</h4>
        <p className="text-sm text-ink-2 mb-3">This permanently deletes your account and your interviews, CV analyses, skills results and consents. It cannot be undone.</p>
        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)} className="px-4 py-2 text-sm bg-danger-600 text-white rounded-xl hover:bg-danger-700">Delete my account</button>
        ) : (
          <form onSubmit={deleteAccount} className="space-y-3 max-w-sm">
            <div>
              <label htmlFor="pv-pw" className="block text-sm font-medium text-ink-2 mb-1">Enter your password to confirm</label>
              <input id="pv-pw" type="password" required autoComplete="current-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {deleteError && <p role="alert" className="text-sm text-danger-700 bg-danger-50 rounded-xl p-2">{deleteError}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={deleting || !password} className="px-4 py-2 text-sm bg-danger-600 text-white rounded-xl hover:bg-danger-700 disabled:opacity-60">
                {deleting ? 'Deleting...' : 'Permanently delete'}
              </button>
              <button type="button" onClick={() => { setConfirming(false); setPassword(''); setDeleteError(''); }} className="px-4 py-2 text-sm bg-sand rounded-xl hover:bg-line">Cancel</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
};

export default PrivacyTab;
