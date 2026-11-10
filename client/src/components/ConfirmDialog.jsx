import React from 'react';
import { Modal, Button } from './ui';

// Small modal confirmation. Escape or Cancel closes it.
// The body is either `children` (spaced blocks) or a single `message`.
const ConfirmDialog = ({
  title, message, children, confirmLabel = 'Confirm', cancelLabel = 'Cancel', confirmDisabled = false, danger, busy = false, onConfirm, onCancel,
}) => (
  <Modal
    open
    onClose={onCancel}
    title={title}
    size="sm"
    footer={(
      <>
        <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={busy} disabled={confirmDisabled || busy} onClick={onConfirm}>{busy ? 'Working...' : confirmLabel}</Button>
      </>
    )}
  >
    {children
      ? <div className="space-y-2 text-sm text-ink-2">{children}</div>
      : <div className="text-sm text-ink-2">{message}</div>}
  </Modal>
);

export default ConfirmDialog;
