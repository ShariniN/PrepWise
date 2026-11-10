import React, { useContext, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import AuthLayout from '../components/AuthLayout';
import { Button, Field, Input } from '../components/ui';
import { AppContext } from '../context/AppContext';
import api, { errorMessage, errorCode } from '../api/client';
import { homeForRole, passwordProblems, PASSWORD_RULES } from '../utils/roles';


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
    <AuthLayout title="Accept your invitation" subtitle={!token || fatal ? undefined : 'Choose a password to finish setting up your account.'}>
        {!token || fatal ? (
          <div role="alert" className="text-center">
            <p className="text-danger-700 text-sm mb-4">
              {fatal || 'This invitation link is missing its token. Ask your administrator to send a new one.'}
            </p>
            <Link to="/login" className="text-primary-700 text-sm font-medium hover:underline">Go to login</Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Full name (optional)">
              {(p) => <Input {...p} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
            </Field>
            <Field label="Phone number (optional, 10 digits)">
              {(p) => <Input {...p} value={phoneNumber} inputMode="numeric" maxLength={10} onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))} autoComplete="tel" />}
            </Field>
            <div>
              <Field label="Password">
                {(p) => <Input {...p} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-describedby="ai-pw-rules" />}
              </Field>
              <ul id="ai-pw-rules" className="mt-2 text-xs space-y-0.5">
                {PASSWORD_RULES.map((r) => (
                  <li key={r.label} className={r.test(password) ? 'text-success-700' : 'text-ink-muted'}>
                    {r.test(password) ? '✓' : '-'} {r.label}
                  </li>
                ))}
              </ul>
            </div>
            <Field label="Confirm password">
              {(p) => <Input {...p} type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />}
            </Field>
            <Button type="submit" block size="lg" loading={busy}>
              {busy ? 'Setting up...' : 'Create my account'}
            </Button>
          </form>
        )}
    </AuthLayout>
  );
};

export default AcceptInvite;
