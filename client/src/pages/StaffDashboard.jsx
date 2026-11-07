import React, { useContext } from 'react';
import NavBar from '../components/NavBar';
import CoursesPanel from '../components/CoursesPanel';
import { AppContext } from '../context/AppContext';
import { ROLE_LABELS } from '../utils/roles';

const StaffDashboard = () => {
  const { userData, role } = useContext(AppContext);

  return (
    <div className="min-h-screen bg-gray-100">
      <NavBar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <section className="bg-white rounded-2xl shadow p-6">
          <h1 className="text-2xl font-bold text-gray-800">
            Welcome{userData?.name ? `, ${userData.name}` : ''}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{ROLE_LABELS[role]}</p>
          <div className="mt-4 rounded-lg bg-indigo-50 border border-indigo-100 p-4 text-sm text-indigo-900">
            <p className="font-semibold mb-1">Coming in Phase 3</p>
            <p>
              Cohort analytics will appear here: failure patterns, a topic heatmap, students who need help, and
              question quality. For now you can set up your courses and cohorts below.
            </p>
          </div>
        </section>
        <CoursesPanel />
      </main>
    </div>
  );
};

export default StaffDashboard;
