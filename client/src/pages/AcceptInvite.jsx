import React, { useContext, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { assets } from '../assets/assets';
import { AppContext } from '../context/AppContext';
import api, { errorMessage, errorCode } from '../api/client';
import { homeForRole, passwordProblems, PASSWORD_RULES } from '../utils/roles';

const inputCls = 'w-full bg-gray-100 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400';

const AcceptInvite = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const { setIsLoggedin, setAuth, getUserData } = useContext(AppContext);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState('');

  const problems = passwordProblems(password);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (problems.length) return toast.error('Password needs: ' + problems.join(', ').toLowerCase());
    if (password !== confirm) return toast.error('Passwords do not match');
    if (phoneNumber && !/^\d{10}$/.test(phoneNumber)) return toast.error('Phone number must be 10 digits');
    setBusy(true);
    try {
      const body = { token, password };
      if (name.trim()) body.name = name.trim();
      if (phoneNumber) body.phoneNumber = phoneNumber;
      const { data } = await api.post('/api/auth/accept-invite', body);
      if (data.success) {
        setIsLoggedin(true);
        setAuth(data);
        getUserData();
        toast.success('Welcome to PrepWise');
        navigate(homeForRole(data.role), { replace: true });
      }
    } catch (error) {
      const code = errorCode(error);
      if (code === 'INVITE_INVALID' || code === 'INVITE_EXPIRED') setFatal(errorMessage(error));
      else toast.error(errorMessage(error, 'Could not accept invitation'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <div className="flex justify-center mb-4">
          <img src={assets.logo} alt="PrepWise logo" className="w-16 h-16" />
        </div>
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">Accept your invitation</h1>

        {!token || fatal ? (
          <div role="alert" className="text-center">
            <p className="text-red-600 text-sm my-4">
              {fatal || 'This invitation link is missing its token.'} Ask your university to send a new invitation.
            </p>
            <Link to="/login" className="text-indigo-600 text-sm hover:underline">Go to login</Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600 text-center mb-6">Choose a password to finish setting up your account.</p>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label htmlFor="ai-name" className="block text-sm font-medium text-gray-700 mb-1">Full name (optional)</label>
                <input id="ai-name" className={inputCls} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </div>
              <div>
                <label htmlFor="ai-phone" className="block text-sm font-medium text-gray-700 mb-1">Phone number (optional, 10 digits)</label>
                <input id="ai-phone" className={inputCls} value={phoneNumber} inputMode="numeric" maxLength={10} onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))} autoComplete="tel" />
              </div>
              <div>
                <label htmlFor="ai-pw" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input id="ai-pw" type="password" required className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-describedby="ai-pw-rules" />
                <ul id="ai-pw-rules" className="mt-2 text-xs space-y-0.5">
                  {PASSWORD_RULES.map((r) => (
                    <li key={r.label} className={r.test(password) ? 'text-green-600' : 'text-gray-500'}>
                      {r.test(password) ? '✓' : '-'} {r.label}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <label htmlFor="ai-confirm" className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
                <input id="ai-confirm" type="password" required className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
              </div>
              <button type="submit" disabled={busy} className="w-full py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-indigo-900 text-white text-sm font-semibold disabled:opacity-60">
                {busy ? 'Setting up...' : 'Create my account'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default AcceptInvite;
