/**
 * LoginForm — Sketchy email/password login form.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/use-auth';
import { loginSchema, type LoginFormData } from '@/lib/validators';

interface FieldErrors {
  email?: string;
  password?: string;
}

export function LoginForm(): React.JSX.Element {
  const router = useRouter();
  const { login, loginError, isAuthenticated, clearErrors } = useAuth();
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      if (loginError) clearErrors();
    },
    [loginError, clearErrors],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const result = loginSchema.safeParse(formData);
      if (!result.success) {
        const errors: FieldErrors = {};
        for (const issue of result.error.issues) {
          const field = issue.path[0];
          if (field === 'email' || field === 'password') {
            errors[field] = issue.message;
          }
        }
        setFieldErrors(errors);
        return;
      }

      setIsSubmitting(true);
      setFieldErrors({});
      await login(result.data.email, result.data.password);
      setIsSubmitting(false);
    },
    [formData, login],
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
        label="password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={formData.password}
        onChange={handleChange}
        error={fieldErrors.password}
        placeholder={'\u2022 \u2022 \u2022 \u2022 \u2022 \u2022 \u2022 \u2022'}
      />

      {loginError && (
        <div
          className="sk sk-alt !py-2 !px-3 text-sm font-semibold text-accent"
          role="alert"
        >
          {loginError}
        </div>
      )}

      <div className="pt-1">
        <Button type="submit" variant="primary" size="md" isLoading={isSubmitting}>
          Log in
        </Button>
      </div>

      <div className="sk sk-alt !py-2 !px-3 font-body text-[13px] text-ink-soft">
        <strong className="font-display text-base">{'\u26A0 '}rate limit:</strong> 5 tries / 15 min.
        generic &quot;invalid credentials&quot; &mdash; no enumeration.
      </div>
    </form>
  );
}
