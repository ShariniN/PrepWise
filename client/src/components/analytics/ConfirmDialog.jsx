import React, { useEffect, useRef } from 'react';

// Small modal confirmation. Escape or Cancel closes it.
const ConfirmDialog = ({ title, children, confirmLabel = 'Confirm', busy = false, onConfirm, onCancel }) => {
  const cancelRef = useRef(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-3">
        <h2 id="confirm-title" className="text-lg font-semibold text-gray-800">{title}</h2>
        <div className="text-sm text-gray-700 space-y-2">{children}</div>
        <div className="flex justify-end gap-2 pt-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className="px-3 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200">Cancel</button>
          <button type="button" disabled={busy} onClick={onConfirm}
            className="px-3 py-2 text-sm rounded-md bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60">
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
