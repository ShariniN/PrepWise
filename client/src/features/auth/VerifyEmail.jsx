import React, { useContext, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import AuthLayout from './components/AuthLayout';
import PasswordChecklist from './components/PasswordChecklist';
import { Button, Field, Input } from '../../components/ui';
import { AppContext } from '../../app/AppContext';
import api, { errorCode, errorMessage } from '../../lib/apiClient';
import { passwordProblems } from '../../lib/roles';

// Codes that mean this link cannot be used again: the form is replaced by the message.
const FATAL = {
  VERIFY_INVALID: 'This verification link is not valid, or it has already been used. If you have not finished signing up, request a new link below.',
  VERIFY_EXPIRED: 'This verification link has expired. Request a new link below.',
  SIGNUP_CLOSED: 'Sign-up is closed for this address. Ask your university for an invitation.',
};
// A new link only helps when sign-up is still open.
const CAN_RESEND = new Set([FATAL.VERIFY_INVALID, FATAL.VERIFY_EXPIRED]);
const SEAT_MESSAGE = 'Your university has no free student seats right now. Ask your university administrator, then try this link again.';

// The password is chosen here, by whoever opened the link in the mailbox, never at sign-up.
// Nothing is sent until the student submits the form.
const VerifyEmail = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const { setIsLoggedin, setAuth, getUserData } = useContext(AppContext);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState(token ? '' : FATAL.VERIFY_INVALID);
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  const problems = passwordProblems(password);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (problems.length) return toast.error('Password needs: ' + problems.join(', ').toLowerCase());
    if (password !== confirm) return toast.error('Passwords do not match');
    setBusy(true);
    setNotice('');
    try {
      const { data } = await api.post('/api/auth/verify-email', { token, password });
      if (data.success) {
        setIsLoggedin(true);
        setAuth(data);
        getUserData();
        navigate('/welcome', { replace: true });
      }
    } catch (error) {
      const code = errorCode(error);
      if (FATAL[code]) setFatal(FATAL[code]);
      else if (code === 'SEAT_LIMIT_REACHED') setNotice(SEAT_MESSAGE);
      else toast.error(errorMessage(error, 'We could not verify your email. Try again in a moment.'));
    } finally {
      setBusy(false);
    }
  };

  // A self-signup has no password until this page, so login cannot offer a new link: it is offered here.
  const resend = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const { data } = await api.post('/api/auth/resend-verification', { email: email.trim() });
      toast.success(data.message);
    } catch (error) {
      toast.error(errorMessage(error, 'Could not send a new link'));
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthLayout title={fatal ? 'Verification link' : 'Choose a password'} subtitle={fatal ? undefined : 'Your email is almost confirmed. Choose a password to finish signing up.'}>
      {fatal ? (
        <div className="space-y-4">
          <p role="alert" className="text-danger-700 text-sm text-center">{fatal}</p>
          {CAN_RESEND.has(fatal) && <form onSubmit={resend} className="space-y-3">
            <Field label="Your university email">
              {(p) => <Input {...p} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />}
            </Field>
            <Button type="submit" block variant="secondary" loading={sending}>
              {sending ? 'Sending...' : 'Send me a new link'}
            </Button>
          </form>}
          <p className="text-center"><Link to="/login" className="text-primary-700 text-sm font-medium hover:underline">Go to login</Link></p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {notice && <p role="alert" className="text-danger-700 text-sm">{notice}</p>}
          <div>
            <Field label="Password">
              {(p) => <Input {...p} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-describedby="ve-pw-rules" />}
            </Field>
            <PasswordChecklist id="ve-pw-rules" password={password} />
          </div>
          <Field label="Confirm password">
            {(p) => <Input {...p} type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />}
          </Field>
          <Button type="submit" block size="lg" loading={busy}>
            {busy ? 'Finishing...' : 'Finish signing up'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
};

export default VerifyEmail;
