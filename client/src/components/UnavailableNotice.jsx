import React from 'react';

const UnavailableNotice = ({ message }) => (
  <div role="alert" className="rounded-lg border border-gray-300 bg-gray-100 p-3 text-sm text-gray-800">
    <p className="font-semibold">Code execution is currently unavailable - your work has not been scored.</p>
    <p className="text-gray-600 mt-1">{message || 'You can keep editing; your draft is still saved. Try again in a few minutes.'}</p>
  </div>
);

export default UnavailableNotice;
