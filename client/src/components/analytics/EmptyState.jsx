import React from 'react';
import { AlertCircle } from 'lucide-react';
import { EmptyState as UiEmpty, Skeleton, Button } from '../ui';

export const EmptyState = ({ title, children }) => (
  <UiEmpty title={title} description={children} className="!py-10" />
);

export const LoadingState = ({ label = 'Loading...' }) => (
  <div role="status" className="space-y-3 py-4">
    <Skeleton className="h-5 w-1/3" />
    <Skeleton className="h-24 w-full" rounded="rounded-2xl" />
    <span className="sr-only">{label}</span>
  </div>
);

export const ErrorState = ({ message, onRetry }) => (
  <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700" role="alert">
    <AlertCircle size={18} className="shrink-0" aria-hidden="true" />
    <span className="min-w-0 flex-1">{message}</span>
    {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button>}
  </div>
);

export default EmptyState;
