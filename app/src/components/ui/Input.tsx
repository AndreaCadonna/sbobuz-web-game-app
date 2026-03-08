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
      <div className="space-y-1">
        <label
          htmlFor={inputId}
          className="block text-sm font-medium"
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
            block w-full rounded-lg border bg-transparent px-3 py-2 text-sm
            transition-colors placeholder:text-[var(--color-muted)]
            focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20
            ${error ? 'border-red-500' : 'border-[var(--color-border)]'}
            ${className}
          `.trim()}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="text-sm text-red-500" role="alert">
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
