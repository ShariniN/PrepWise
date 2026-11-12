import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import AuthLayout from './components/AuthLayout';
import { Button, Field, Input } from '../../components/ui';
import api, { errorMessage } from '../../lib/apiClient';
import { passwordProblems, PASSWORD_RULES } from '../../lib/roles';

const Signup = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const problems = passwordProblems(password);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (problems.length) return toast.error('Password needs: ' + problems.join(', ').toLowerCase());
    setBusy(true);
    try {
      const { data } = await api.post('/api/auth/signup', { name: name.trim(), email: email.trim(), password });
      setDone(data);
    } catch (error) {
      toast.error(errorMessage(error, 'Could not sign you up'));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthLayout title="Check your email">
        <div className="text-center space-y-4">
          <p className="text-sm text-ink">{done.message}</p>
          {done.devVerificationLink && (
            <a href={done.devVerificationLink} className="inline-block rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
              Open verification link
            </a>
          )}
          <p className="text-sm"><Link to="/login" className="text-primary-700 font-medium hover:underline">Go to login</Link></p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Use your university email. We will send you a link to confirm it."
      footer={<p>Already have an account? <Link to="/login" className="text-primary-700 font-medium hover:underline">Log in</Link></p>}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Full name">
          {(p) => <Input {...p} required value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
        </Field>
        <Field label="University email">
          {(p) => <Input {...p} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />}
        </Field>
        <div>
          <Field label="Password">
            {(p) => <Input {...p} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-describedby="su-pw-rules" />}
          </Field>
          <ul id="su-pw-rules" className="mt-2 text-xs space-y-0.5">
            {PASSWORD_RULES.map((r) => (
              <li key={r.label} className={r.test(password) ? 'text-success-700' : 'text-ink-muted'}>
                {r.test(password) ? '✓' : '-'} {r.label}
              </li>
            ))}
          </ul>
        </div>
        <Button type="submit" block size="lg" loading={busy}>
          {busy ? 'Creating...' : 'Create my account'}
        </Button>
      </form>
    </AuthLayout>
  );
};

export default Signup;
