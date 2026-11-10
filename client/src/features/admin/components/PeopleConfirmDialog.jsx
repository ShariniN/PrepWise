import React from 'react';
import { Modal, Button } from '../../../components/ui';

const ConfirmDialog = ({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', confirmDisabled = false, danger, busy, onConfirm, onCancel }) => (
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
    <div className="text-sm text-ink-2">{message}</div>
  </Modal>
);

export default ConfirmDialog;
