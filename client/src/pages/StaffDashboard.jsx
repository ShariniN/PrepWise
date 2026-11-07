import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../components/AppShell';
import CoursesPanel from '../components/CoursesPanel';
import LecturerDashboard from '../components/analytics/LecturerDashboard';
import { AppContext } from '../context/AppContext';
import { ROLES, ROLE_LABELS } from '../utils/roles';

const linkCls = 'font-medium text-primary-700 underline underline-offset-2 hover:text-primary-800';

const StaffDashboard = () => {
  const { userData, role } = useContext(AppContext);
  const isLecturer = role === ROLES.LECTURER;

  return (
    <AppShell
      eyebrow={ROLE_LABELS[role]}
      title={`Welcome${userData?.name ? `, ${userData.name}` : ''}`}
      subtitle={isLecturer ? (
        <>Answers waiting for your judgement are in the <Link to="/grading" className={linkCls}>grading queue</Link>.</>
      ) : role === ROLES.CAREER_OFFICER ? (
        <>Cohort readiness is on the <Link to="/careers" className={linkCls}>careers page</Link>.</>
      ) : undefined}
    >
      {isLecturer ? <LecturerDashboard /> : <CoursesPanel />}
    </AppShell>
  );
};

export default StaffDashboard;
