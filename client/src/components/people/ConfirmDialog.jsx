import React from 'react';
import { Modal, Button } from '../ui';

const ConfirmDialog = ({ title, message, confirmLabel = 'Confirm', danger, busy, onConfirm, onCancel }) => (
  <Modal
    open
    onClose={onCancel}
    title={title}
    size="sm"
    footer={(
      <>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>{busy ? 'Working...' : confirmLabel}</Button>
      </>
    )}
  >
    <div className="text-sm text-ink-2">{message}</div>
  </Modal>
);

export default ConfirmDialog;
