import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AppContext } from './AppContext';
import { homeForRole } from '../lib/roles';

// Redirects to /login when signed out, and to the user's own home when the
// role is not in `allow`. A student who has not chosen a target role yet is sent to /welcome
// (the welcome page itself passes skipOnboarding).
const ProtectedRoute = ({ allow, skipOnboarding, children }) => {
  const { isLoggedin, role, authLoading, needsOnboarding } = useContext(AppContext);

  if (authLoading || (isLoggedin && role === 'student' && needsOnboarding === null)) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center text-gray-600" role="status">
        Loading...
      </div>
    );
  }
  if (!isLoggedin) return <Navigate to="/login" replace />;
  if (allow && !allow.includes(role)) return <Navigate to={homeForRole(role)} replace />;
  if (role === 'student' && needsOnboarding && !skipOnboarding) return <Navigate to="/welcome" replace />;
  return children;
};

export default ProtectedRoute;
