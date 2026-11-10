import React, { useContext } from 'react';
import AppShell from '../components/AppShell';
import { AppContext } from '../context/AppContext';
import { ROLE_LABELS } from '../utils/roles';

const StaffDashboard = () => {
  const { userData, role } = useContext(AppContext);
  return (
    <AppShell eyebrow={ROLE_LABELS[role]} title={`Welcome${userData?.name ? `, ${userData.name}` : ''}`} />
  );
};

export default StaffDashboard;
