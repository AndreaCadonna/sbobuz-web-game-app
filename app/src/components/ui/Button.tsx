/**
 * Button — Sketchy hand-drawn button primitive.
 *
 * Matches the wireframe `.btn`: 2px ink border, 6px radius, 2px hard shadow,
 * Caveat 20px weight 600. Variants: primary (ink bg), secondary (paper),
 * danger/accent (orange), green, ghost. Sizes: sm, md, lg.
 */
'use client';

import { forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'danger' | 'green' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-ink text-paper border-ink shadow-sketch hover:-translate-y-0.5 hover:shadow-sketch-lg',
  secondary:
    'bg-paper text-ink border-ink shadow-sketch hover:bg-paper-2 hover:-translate-y-0.5 hover:shadow-sketch-lg',
  accent:
    'bg-accent text-white border-ink shadow-sketch hover:-translate-y-0.5 hover:shadow-sketch-lg',
  // danger is an alias for accent (orange) — keeps existing call sites working
  danger:
    'bg-accent text-white border-ink shadow-sketch hover:-translate-y-0.5 hover:shadow-sketch-lg',
  green:
    'bg-accent-2 text-white border-ink shadow-sketch hover:-translate-y-0.5 hover:shadow-sketch-lg',
  ghost:
    'bg-transparent text-ink border-transparent hover:bg-paper-2',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1 text-base',   // Caveat 16px
  md: 'px-4 py-1.5 text-xl',   // Caveat 20px
  lg: 'px-5 py-2 text-2xl',    // Caveat 24px (display button)
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
    const isDisabled = disabled ?? isLoading;
    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`
          inline-flex items-center justify-center gap-1.5
          font-display font-semibold leading-none
          border-2 rounded-md
          transition-transform duration-150 motion-reduce:transition-none
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-3 focus-visible:ring-offset-2 focus-visible:ring-offset-paper
          active:translate-x-px active:translate-y-px active:shadow-sketch-sm
          disabled:opacity-45 disabled:bg-paper-2 disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed disabled:hover:translate-y-0
          ${variantClasses[variant]}
          ${size === 'sm' ? 'shadow-sketch-sm' : ''}
          ${sizeClasses[size]}
          ${fullWidth ? 'w-full' : ''}
          ${className}
        `.trim()}
        {...props}
      >
        {isLoading ? (
          <>
            <svg
              className="mr-1 h-4 w-4 animate-spin"
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
