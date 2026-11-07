import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import { homeForRole } from '../utils/roles';

// Redirects to /login when signed out, and to the user's own home when the
// role is not in `allow`.
const ProtectedRoute = ({ allow, children }) => {
  const { isLoggedin, role, authLoading } = useContext(AppContext);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center text-gray-600" role="status">
        Loading...
      </div>
    );
  }
  if (!isLoggedin) return <Navigate to="/login" replace />;
  if (allow && !allow.includes(role)) return <Navigate to={homeForRole(role)} replace />;
  return children;
};

export default ProtectedRoute;
