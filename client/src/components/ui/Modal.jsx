import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from './cn';
import Button from './Button';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog: portal, focus trap, Escape / backdrop to close, scroll lock, focus return.
 *   <Modal open={o} onClose={close} title="Edit" footer={<Button/>}>...</Modal>
 */
export const Modal = ({ open, onClose, title, description, footer, size = 'md', children }) => {
  const panel = useRef(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = panel.current?.querySelector(FOCUSABLE);
    (first || panel.current)?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const nodes = [...panel.current.querySelectorAll(FOCUSABLE)];
      if (!nodes.length) { e.preventDefault(); return; }
      const a = nodes[0];
      const z = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (prev && prev.focus) prev.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 animate-fade-in bg-ink-deep/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn('relative w-full animate-pop-in rounded-[2rem] border border-line bg-surface p-6 shadow-float focus:outline-none sm:p-8', widths[size])}
      >
        <button type="button" onClick={onClose} aria-label="Close dialog" className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-ink-muted transition hover:bg-sand hover:text-ink">
          <X size={18} aria-hidden="true" />
        </button>
        {title && <h2 id={titleId} className="pr-10 font-display text-2xl font-semibold text-ink">{title}</h2>}
        {description && <p id={descId} className="mt-2 text-sm text-ink-2">{description}</p>}
        <div className={cn((title || description) && 'mt-5')}>{children}</div>
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};

/** Yes/no confirmation. `danger` styles the confirm button red. */
export const ConfirmDialog = ({ open, onClose, onConfirm, title = 'Are you sure?', description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger, loading }) => (
  <Modal
    open={open}
    onClose={onClose}
    title={title}
    description={description}
    size="sm"
    footer={
      <>
        <Button variant="ghost" onClick={onClose}>{cancelLabel}</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </>
    }
  />
);

export default Modal;
