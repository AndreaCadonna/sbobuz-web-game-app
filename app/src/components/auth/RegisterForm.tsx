/**
 * RegisterForm — Sketchy registration form with password strength meter.
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

  if (score <= 2) return { level: 'weak', width: 'w-1/3', color: 'bg-accent' };
  if (score <= 3) return { level: 'fair', width: 'w-2/3', color: 'bg-accent-y' };
  return { level: 'strong', width: 'w-full', color: 'bg-accent-2' };
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
        label="email"
        name="email"
        type="email"
        autoComplete="email"
        value={formData.email}
        onChange={handleChange}
        error={fieldErrors.email}
        placeholder="you@somewhere.com"
      />

      <Input
        label="username"
        name="username"
        type="text"
        autoComplete="username"
        value={formData.username}
        onChange={handleChange}
        error={fieldErrors.username}
        placeholder="card_shark_42"
        helperText="3–20, a-z 0-9 _"
      />

      <Input
        label="display name"
        name="displayName"
        type="text"
        autoComplete="name"
        value={formData.displayName}
        onChange={handleChange}
        error={fieldErrors.displayName}
        placeholder="How others will see you"
      />

      <div className="space-y-2">
        <Input
          label="password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={formData.password}
          onChange={handleChange}
          error={fieldErrors.password}
          placeholder={'\u2022 \u2022 \u2022 \u2022 \u2022 \u2022 \u2022 \u2022'}
          helperText="8+ chars, Aa1"
        />
        {formData.password.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full border-[1.5px] border-ink bg-paper">
              <div
                className={`h-full transition-all duration-300 ${passwordStrength.color} ${passwordStrength.width}`}
              />
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-ink-soft">
              {passwordStrength.level}
            </span>
          </div>
        )}
      </div>

      <Input
        label="confirm password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        value={formData.confirmPassword}
        onChange={handleChange}
        error={fieldErrors.confirmPassword}
        placeholder={'\u2022 \u2022 \u2022 \u2022 \u2022 \u2022 \u2022 \u2022'}
      />

      {registerError && (
        <div className="sk sk-alt !py-2 !px-3 text-sm font-semibold text-accent" role="alert">
          {registerError}
        </div>
      )}

      <div className="pt-1">
        <Button type="submit" variant="primary" size="md" isLoading={isSubmitting}>
          Create account
        </Button>
      </div>
    </form>
  );
}
