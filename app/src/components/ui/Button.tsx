/**
 * Button — Reusable button component with variants and loading state.
 */
'use client';

import { forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-b from-gold-500 to-gold-600 text-brand-950 font-semibold hover:from-gold-400 hover:to-gold-500 focus-visible:ring-gold-400 disabled:from-gold-300 disabled:to-gold-400 disabled:text-brand-800/50 shadow-sm hover:shadow-warm',
  secondary:
    'border-2 border-[var(--color-border)] bg-transparent hover:bg-[var(--color-card-bg)] hover:border-gold-400/50 focus-visible:ring-gold-400',
  danger:
    'bg-gradient-to-b from-red-500 to-red-600 text-white font-semibold hover:from-red-400 hover:to-red-500 focus-visible:ring-red-400 disabled:from-red-300 disabled:to-red-400 shadow-sm',
  ghost:
    'bg-transparent hover:bg-[var(--color-card-bg)] focus-visible:ring-gold-400 text-[var(--color-muted)] hover:text-[var(--color-foreground)]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm rounded-lg',
  md: 'h-10 px-5 text-sm rounded-xl',
  lg: 'h-12 px-7 text-base rounded-xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      fullWidth = false,
      disabled,
      className = '',
      children,
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`
          inline-flex items-center justify-center font-medium
          transition-all duration-200 motion-reduce:transition-none
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]
          disabled:pointer-events-none disabled:opacity-50
          active:scale-[0.97] motion-reduce:active:scale-100
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${fullWidth ? 'w-full' : ''}
          ${className}
        `.trim()}
        {...props}
      >
        {isLoading ? (
          <>
            <svg
              className="mr-2 h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Loading...</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);
