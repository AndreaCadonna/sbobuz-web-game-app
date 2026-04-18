/**
 * Input — Sketchy text input with tiny mono label and optional helper hint.
 *
 * Matches wireframe `.input`: 2px ink border, 6px radius, Kalam 16px body,
 * italic muted placeholder. Label uses JetBrains Mono 10px uppercase with
 * tracking.
 */
'use client';

import { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ label, error, helperText, id, className = '', ...props }, ref) {
    const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-');
    const hasError = Boolean(error);

    return (
      <div className="space-y-1.5">
        <label htmlFor={inputId} className="label-tiny block">
          {label}
          {helperText ? (
            <span className="ml-2 font-body normal-case tracking-normal text-[var(--line-soft)]">
              {'\u00B7 '}{helperText}
            </span>
          ) : null}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={hasError ? 'true' : 'false'}
          aria-describedby={hasError ? `${inputId}-error` : undefined}
          className={`
            block w-full rounded-md border-2 bg-paper px-3 py-2
            font-body text-base text-ink
            placeholder:italic placeholder:text-[var(--line-soft)]
            focus:outline-none focus:ring-2 focus:ring-accent-3 focus:ring-offset-2 focus:ring-offset-paper
            ${hasError ? 'border-accent' : 'border-ink'}
            ${className}
          `.trim()}
          {...props}
        />
        {hasError && (
          <p id={`${inputId}-error`} className="font-body text-sm font-semibold text-accent" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);
