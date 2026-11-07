import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api, { errorMessage } from '../api/client';
import { AppContext } from '../context/AppContext';

const inputCls = 'w-full bg-gray-100 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400';

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
    <div className="bg-white rounded-lg shadow p-6 space-y-8">
      <h3 className="text-lg font-semibold text-gray-900">Privacy and data</h3>

      <section aria-labelledby="pv-consent">
        <h4 id="pv-consent" className="font-medium text-gray-900 mb-1">Consent status</h4>
        <p className="text-sm text-gray-600 mb-3">The consents you have given (terms, privacy, AI processing, recording).</p>
        {consents === null ? (
          <button type="button" onClick={showConsents} disabled={loadingConsents} className="px-3 py-2 text-sm bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-60">
            {loadingConsents ? 'Loading...' : 'Show my consent records'}
          </button>
        ) : consents.length === 0 ? (
          <p className="text-sm text-gray-500">No consent records yet.</p>
        ) : (
          <ul className="text-sm divide-y border rounded-md">
            {consents.map((c, i) => (
              <li key={`${c.type}-${i}`} className="flex justify-between px-3 py-2">
                <span>{String(c.type).replace('_', ' ')} (version {c.version})</span>
                <span className="text-gray-500">{c.acceptedAt ? new Date(c.acceptedAt).toLocaleDateString() : ''}</span>
              </li>
            ))}
          </ul>
        )}
        {consentError && <p role="alert" className="text-sm text-red-600 mt-2">{consentError}</p>}
      </section>

      <section aria-labelledby="pv-export">
        <h4 id="pv-export" className="font-medium text-gray-900 mb-1">Download my data</h4>
        <p className="text-sm text-gray-600 mb-3">A JSON file with your profile, interviews, CV analyses, skills, consents and enrolments.</p>
        <button type="button" onClick={download} disabled={downloading} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-60">
          {downloading ? 'Preparing...' : 'Download my data'}
        </button>
      </section>

      <section aria-labelledby="pv-subs">
        <h4 id="pv-subs" className="font-medium text-gray-900 mb-1">Subprocessors</h4>
        <p className="text-sm text-gray-600 mb-3">Third parties that process data on our behalf{subs?.updated ? ` (updated ${subs.updated})` : ''}.</p>
        {subsError ? (
          <p role="alert" className="text-sm text-red-600">{subsError}</p>
        ) : !subs ? (
          <p className="text-sm text-gray-500" role="status">Loading...</p>
        ) : subs.subprocessors.length === 0 ? (
          <p className="text-sm text-gray-500">None listed.</p>
        ) : (
          <ul className="space-y-2">
            {subs.subprocessors.map((s) => (
              <li key={s.name} className="border rounded-md p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{s.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === 'in_use' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {s.status === 'in_use' ? 'In use' : 'Planned'}
                  </span>
                </div>
                <p className="text-gray-600">{s.purpose}</p>
                <p className="text-gray-500 text-xs mt-1">Data: {s.data}{s.note ? `. ${s.note}` : ''}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="pv-delete" className="border border-red-200 rounded-lg p-4">
        <h4 id="pv-delete" className="font-medium text-red-700 mb-1">Delete my account</h4>
        <p className="text-sm text-gray-600 mb-3">This permanently deletes your account and your interviews, CV analyses, skills results, consents and enrolments. It cannot be undone.</p>
        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)} className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700">Delete my account</button>
        ) : (
          <form onSubmit={deleteAccount} className="space-y-3 max-w-sm">
            <div>
              <label htmlFor="pv-pw" className="block text-sm font-medium text-gray-700 mb-1">Enter your password to confirm</label>
              <input id="pv-pw" type="password" required autoComplete="current-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {deleteError && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-md p-2">{deleteError}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={deleting || !password} className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-60">
                {deleting ? 'Deleting...' : 'Permanently delete'}
              </button>
              <button type="button" onClick={() => { setConfirming(false); setPassword(''); setDeleteError(''); }} className="px-4 py-2 text-sm bg-gray-100 rounded-md hover:bg-gray-200">Cancel</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
};

export default PrivacyTab;
