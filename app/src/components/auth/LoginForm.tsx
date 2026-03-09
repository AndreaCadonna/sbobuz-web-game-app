/**
 * LoginForm — Email/password login form with Zod validation.
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

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/lobby');
    }
  }, [isAuthenticated, router]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setFormData((prev) => ({ ...prev, [name]: value }));
      // Clear field error on change
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
      if (loginError) clearErrors();
    },
    [loginError, clearErrors],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Validate
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
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
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
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={formData.password}
        onChange={handleChange}
        error={fieldErrors.password}
        placeholder="Enter your password"
      />

      {loginError && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm font-medium text-red-700 dark:bg-red-950/50 dark:border-red-800 dark:text-red-300" role="alert">
          {loginError}
        </div>
      )}

      <Button type="submit" fullWidth isLoading={isSubmitting} size="lg">
        Sign In
      </Button>
    </form>
  );
}
