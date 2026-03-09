/**
 * RegisterForm — Registration form with Zod validation and password strength indicator.
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/use-auth';
import { registerSchema, type RegisterFormData } from '@/lib/validators';

interface FieldErrors {
  email?: string;
  username?: string;
  displayName?: string;
  password?: string;
  confirmPassword?: string;
}

function getPasswordStrength(password: string): {
  level: 'weak' | 'fair' | 'strong';
  width: string;
  color: string;
} {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { level: 'weak', width: 'w-1/3', color: 'bg-red-500' };
  if (score <= 3) return { level: 'fair', width: 'w-2/3', color: 'bg-yellow-500' };
  return { level: 'strong', width: 'w-full', color: 'bg-green-500' };
}

export function RegisterForm(): React.JSX.Element {
  const router = useRouter();
  const { register, registerError, isAuthenticated, clearErrors } = useAuth();
  const [formData, setFormData] = useState<RegisterFormData>({
    email: '',
    username: '',
    displayName: '',
    password: '',
    confirmPassword: '',
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordStrength = useMemo(
    () => getPasswordStrength(formData.password),
    [formData.password],
  );

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/lobby');
    }
  }, [isAuthenticated, router]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setFormData((prev) => ({ ...prev, [name]: value }));
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
      if (registerError) clearErrors();
    },
    [registerError, clearErrors],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const result = registerSchema.safeParse(formData);
      if (!result.success) {
        const errors: FieldErrors = {};
        for (const issue of result.error.issues) {
          const field = issue.path[0];
          if (
            field === 'email' ||
            field === 'username' ||
            field === 'displayName' ||
            field === 'password' ||
            field === 'confirmPassword'
          ) {
            errors[field] = issue.message;
          }
        }
        setFieldErrors(errors);
        return;
      }

      setIsSubmitting(true);
      setFieldErrors({});
      await register(
        result.data.email,
        result.data.username,
        result.data.password,
        result.data.displayName,
      );
      setIsSubmitting(false);
    },
    [formData, register],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        value={formData.email}
        onChange={handleChange}
        error={fieldErrors.email}
        placeholder="you@example.com"
      />

      <Input
        label="Username"
        name="username"
        type="text"
        autoComplete="username"
        value={formData.username}
        onChange={handleChange}
        error={fieldErrors.username}
        placeholder="Choose a username"
        helperText="3-20 characters, letters, numbers, hyphens, underscores"
      />

      <Input
        label="Display Name"
        name="displayName"
        type="text"
        autoComplete="name"
        value={formData.displayName}
        onChange={handleChange}
        error={fieldErrors.displayName}
        placeholder="How others will see you"
      />

      <div className="space-y-1">
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={formData.password}
          onChange={handleChange}
          error={fieldErrors.password}
          placeholder="At least 8 characters"
        />
        {formData.password.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className={`h-full rounded-full transition-all ${passwordStrength.color} ${passwordStrength.width}`}
              />
            </div>
            <span className="text-xs text-[var(--color-muted)] capitalize">
              {passwordStrength.level}
            </span>
          </div>
        )}
      </div>

      <Input
        label="Confirm Password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        value={formData.confirmPassword}
        onChange={handleChange}
        error={fieldErrors.confirmPassword}
        placeholder="Repeat your password"
      />

      {registerError && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300" role="alert">
          {registerError}
        </div>
      )}

      <Button type="submit" fullWidth isLoading={isSubmitting}>
        Create Account
      </Button>
    </form>
  );
}
