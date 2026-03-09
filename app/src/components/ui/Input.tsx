/**
 * Input — Reusable form input with label and error display.
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

    return (
      <div className="space-y-1.5">
        <label
          htmlFor={inputId}
          className="block text-sm font-semibold tracking-wide text-[var(--color-foreground)]"
        >
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={
            error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
          }
          className={`
            block w-full rounded-xl border-2 bg-[var(--color-card-bg)] px-4 py-2.5 text-sm
            transition-all duration-200 placeholder:text-[var(--color-muted)]/60
            focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-400/20
            focus:bg-[var(--color-background)]
            ${error ? 'border-red-400' : 'border-[var(--color-border)]'}
            ${className}
          `.trim()}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="text-sm font-medium text-red-500" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={`${inputId}-helper`} className="text-sm text-[var(--color-muted)]">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);
