/**
 * Modal — Accessible dialog overlay component.
 */
'use client';

import { useCallback, useEffect, useRef } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  showCloseButton?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  showCloseButton = true,
}: ModalProps): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    } else {
      dialog.close();
      previousFocusRef.current?.focus();
    }
  }, [isOpen]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === dialogRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-lg rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-background)] p-0 shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      aria-labelledby="modal-title"
    >
      <div className="flex items-center justify-between border-b-2 border-[var(--color-border)] px-6 py-4">
        <h2 id="modal-title" className="font-display text-xl font-bold">
          {title}
        </h2>
        {showCloseButton && (
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:bg-[var(--color-card-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            aria-label="Close dialog"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
      <div className="px-6 py-5">{children}</div>
    </dialog>
  );
}
