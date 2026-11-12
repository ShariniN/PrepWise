import React from 'react';
import { AlertTriangle, XCircle } from 'lucide-react';
import { Card, ProgressBar, Skeleton } from '../../../components/ui';

const UsageHeader = ({ usage, error }) => {
  if (error) return <p role="alert" className="rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">{error}</p>;
  if (!usage) {
    return (
      <Card role="status" className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-full" rounded="rounded-full" />
        <span className="sr-only">Loading usage...</span>
      </Card>
    );
  }

  const used = (usage.activeStudents || 0) + (usage.invitedStudents || 0);
  const limit = usage.studentLimit || 0;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const atLimit = limit > 0 && used >= limit;
  const warn = !atLimit && pct >= 90;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold text-ink">Student licences</h2>
        <p className="text-sm text-ink-2">
          <span className="font-semibold text-ink">{used}</span> of {limit} used
          <span className="text-ink-muted"> ({usage.activeStudents} active, {usage.invitedStudents} invited, {usage.remaining} remaining)</span>
        </p>
      </div>
      <ProgressBar className="mt-4" size="lg" value={pct} tone={atLimit ? 'danger' : warn ? 'warning' : 'primary'} label="Student licences used" />
      {atLimit && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-2xl bg-danger-50 p-3 text-sm text-danger-700">
          <XCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          You have reached your student limit. New student invitations are blocked until you deactivate students or raise the limit with PrepWise.
        </p>
      )}
      {warn && (
        <p role="status" className="mt-4 flex items-start gap-2 rounded-2xl bg-sun-50 p-3 text-sm text-ink">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-sun-700" aria-hidden="true" />
          You have used {pct}% of your student limit.
        </p>
      )}
    </Card>
  );
};

export default UsageHeader;
