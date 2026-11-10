import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import { homeForRole } from '../utils/roles';
import Login from '../pages/Login';

// Any URL the app does not know (including removed pages): signed-in users go to their own home,
// everyone else sees the login form.
const UnknownRoute = () => {
  const { isLoggedin, role, authLoading } = useContext(AppContext);
  if (authLoading) return null;
  if (isLoggedin && role) return <Navigate to={homeForRole(role)} replace />;
  return <Login />;
};

export default UnknownRoute;
