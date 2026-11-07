import React from 'react';
import { Modal, Button } from '../ui';

// Small modal confirmation. Escape or Cancel closes it.
const ConfirmDialog = ({ title, children, confirmLabel = 'Confirm', busy = false, onConfirm, onCancel }) => (
  <Modal
    open
    onClose={onCancel}
    title={title}
    size="sm"
    footer={(
      <>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button loading={busy} onClick={onConfirm}>{busy ? 'Working...' : confirmLabel}</Button>
      </>
    )}
  >
    <div className="space-y-2 text-sm text-ink-2">{children}</div>
  </Modal>
);

export default ConfirmDialog;
