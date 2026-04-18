/**
 * Modal — Sketchy dialog overlay.
 *
 * Paper-colored surface with a 2.5px ink border, 4px hard shadow, and a
 * slight wobble radius. Title uses Caveat.
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
      className="fixed inset-0 z-50 m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-lg rounded-wobble border-[2.5px] border-ink bg-paper p-0 shadow-sketch-lg backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      aria-labelledby="modal-title"
    >
      <div className="flex items-center justify-between border-b-2 border-ink px-5 py-3 bg-paper-2">
        <h2 id="modal-title" className="font-display text-2xl font-bold">
          {title}
        </h2>
        {showCloseButton && (
          <button
            onClick={onClose}
            className="rounded-md border-2 border-ink bg-paper px-2 py-0.5 font-display text-base leading-none transition-colors hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-3"
            aria-label="Close dialog"
          >
            <svg
              className="h-4 w-4"
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
      <div className="px-5 py-5">{children}</div>
    </dialog>
  );
}
