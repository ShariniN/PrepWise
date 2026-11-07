import React from 'react';

export const EmptyState = ({ title, children }) => (
  <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600">
    <p className="font-semibold text-gray-700">{title}</p>
    {children && <p className="mt-1">{children}</p>}
  </div>
);

export const LoadingState = ({ label = 'Loading...' }) => (
  <p className="text-sm text-gray-500 py-6" role="status">{label}</p>
);

export const ErrorState = ({ message, onRetry }) => (
  <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-800" role="alert">
    {message}
    {onRetry && <button type="button" onClick={onRetry} className="ml-3 underline">Retry</button>}
  </div>
);

export default EmptyState;
