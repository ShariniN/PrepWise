import React, { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import AuthLayout from './components/AuthLayout';
import { AppContext } from '../../app/AppContext';
import api, { errorCode } from '../../lib/apiClient';

const MESSAGES = {
  VERIFY_INVALID: 'This verification link is not valid, or it has already been used. If you have not logged in yet, request a new link from the login page.',
  VERIFY_EXPIRED: 'This verification link has expired. Request a new link from the login page.',
  SEAT_LIMIT_REACHED: 'Your university has no free student seats right now. Ask your university administrator, then try this link again.',
};

const VerifyEmail = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const { setIsLoggedin, setAuth, getUserData } = useContext(AppContext);
  const [problem, setProblem] = useState(token ? '' : MESSAGES.VERIFY_INVALID);
  // The link works once, so the request must be sent exactly once even when React runs effects twice.
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    api.post('/api/auth/verify-email', { token })
      .then(({ data }) => {
        if (!data.success) return;
        setIsLoggedin(true);
        setAuth(data);
        getUserData();
        navigate('/welcome', { replace: true });
      })
      .catch((error) => setProblem(MESSAGES[errorCode(error)] || 'We could not verify your email. Try again in a moment.'));
  }, [token, navigate, setIsLoggedin, setAuth, getUserData]);

  return (
    <AuthLayout title="Verifying your email">
      {problem ? (
        <div role="alert" className="text-center">
          <p className="text-danger-700 text-sm mb-4">{problem}</p>
          <Link to="/login" className="text-primary-700 text-sm font-medium hover:underline">Go to login</Link>
        </div>
      ) : (
        <p className="text-center text-sm text-ink-muted" role="status">One moment...</p>
      )}
    </AuthLayout>
  );
};

export default VerifyEmail;
