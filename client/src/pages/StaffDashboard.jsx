import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import NavBar from '../components/NavBar';
import CoursesPanel from '../components/CoursesPanel';
import LecturerDashboard from '../components/analytics/LecturerDashboard';
import { AppContext } from '../context/AppContext';
import { ROLES, ROLE_LABELS } from '../utils/roles';

const StaffDashboard = () => {
  const { userData, role } = useContext(AppContext);
  const isLecturer = role === ROLES.LECTURER;

  return (
    <div className="min-h-screen bg-gray-100">
      <NavBar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <section className="bg-white rounded-2xl shadow p-6">
          <h1 className="text-2xl font-bold text-gray-800">
            Welcome{userData?.name ? `, ${userData.name}` : ''}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{ROLE_LABELS[role]}</p>
          {isLecturer && (
            <p className="text-sm text-gray-600 mt-3">
              Answers waiting for your judgement are in the <Link to="/grading" className="text-indigo-700 underline">grading queue</Link>.
            </p>
          )}
          {role === ROLES.CAREER_OFFICER && (
            <p className="text-sm text-gray-600 mt-3">
              Cohort readiness is on the <Link to="/careers" className="text-indigo-700 underline">careers page</Link>.
            </p>
          )}
        </section>
        {isLecturer ? <LecturerDashboard /> : <CoursesPanel />}
      </main>
    </div>
  );
};

export default StaffDashboard;
