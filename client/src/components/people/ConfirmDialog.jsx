import React, { useEffect, useRef } from 'react';

const ConfirmDialog = ({ title, message, confirmLabel = 'Confirm', danger, busy, onConfirm, onCancel }) => {
  const cancelRef = useRef(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="cd-title" aria-describedby="cd-msg" className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 id="cd-title" className="text-lg font-semibold text-gray-900">{title}</h2>
        <p id="cd-msg" className="text-sm text-gray-600 mt-2">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className="px-4 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200">Cancel</button>
          <button
            type="button" onClick={onConfirm} disabled={busy}
            className={`px-4 py-2 text-sm rounded-lg text-white disabled:opacity-60 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
