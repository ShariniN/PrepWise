import React from 'react';
import { AlertTriangle, XCircle } from 'lucide-react';

const UsageHeader = ({ usage, error }) => {
  if (error) return <p role="alert" className="bg-red-50 text-red-700 text-sm rounded-xl p-4">{error}</p>;
  if (!usage) return <div className="bg-white rounded-xl shadow p-5 text-sm text-gray-500" role="status">Loading usage...</div>;

  const used = (usage.activeStudents || 0) + (usage.invitedStudents || 0);
  const limit = usage.studentLimit || 0;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const atLimit = limit > 0 && used >= limit;
  const warn = !atLimit && pct >= 90;
  const bar = atLimit ? 'bg-red-600' : warn ? 'bg-amber-500' : 'bg-indigo-600';

  return (
    <div className="bg-white rounded-xl shadow p-5">
      <div className="flex flex-wrap justify-between items-baseline gap-2">
        <h2 className="text-lg font-semibold text-gray-800">Student licences</h2>
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{used}</span> of {limit} used
          <span className="text-gray-400"> ({usage.activeStudents} active, {usage.invitedStudents} invited, {usage.remaining} remaining)</span>
        </p>
      </div>
      <div
        className="mt-3 h-3 bg-gray-200 rounded-full overflow-hidden"
        role="progressbar" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used} aria-label="Student licences used"
      >
        <div className={`h-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {atLimit && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-md p-3">
          <XCircle size={18} className="shrink-0 mt-0.5" />
          You have reached your student limit. New student invitations are blocked until you deactivate students or raise the limit with PrepWise.
        </p>
      )}
      {warn && (
        <p role="status" className="mt-3 flex items-start gap-2 text-sm text-amber-800 bg-amber-50 rounded-md p-3">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          You have used {pct}% of your student limit.
        </p>
      )}
    </div>
  );
};

export default UsageHeader;
