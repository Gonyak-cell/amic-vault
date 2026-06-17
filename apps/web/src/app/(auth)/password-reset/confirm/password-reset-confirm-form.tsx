'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { confirmPasswordReset } from '@/lib/auth';
import { LanguageToggle, useI18n } from '@/lib/i18n';

const minimumPasswordLength = 8;

export function PasswordResetConfirmForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  return <PasswordResetConfirmPanel token={token} />;
}

export function PasswordResetConfirmPanel({ token }: { token: string }) {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!token) {
      setError(t('auth.resetMissingToken'));
      return;
    }
    if (password.length < minimumPasswordLength) {
      setError(t('auth.resetPasswordTooShort'));
      return;
    }
    if (password !== passwordConfirmation) {
      setError(t('auth.resetPasswordMismatch'));
      return;
    }

    setPending(true);
    try {
      await confirmPasswordReset({ token, password });
      setComplete(true);
      setPassword('');
      setPasswordConfirmation('');
    } catch {
      setError(t('auth.resetFailed'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center">
              <img
                src="/icons/amic-vault-wordmark.svg"
                alt="AMIC Vault"
                className="h-[22px] w-[106px]"
              />
            </CardTitle>
            <CardDescription>{t('auth.resetDescription')}</CardDescription>
          </div>
          <LanguageToggle />
        </div>
      </CardHeader>
      <CardContent>
        {complete ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium text-foreground">{t('auth.resetComplete')}</p>
            <Button asChild>
              <Link href="/login">{t('auth.resetLogin')}</Link>
            </Button>
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <label className="flex flex-col gap-2 text-sm font-medium">
              {t('auth.newPassword')}
              <Input
                autoComplete="new-password"
                minLength={minimumPasswordLength}
                required
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              {t('auth.confirmPassword')}
              <Input
                autoComplete="new-password"
                minLength={minimumPasswordLength}
                required
                type="password"
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
              />
            </label>
            {!token ? (
              <p className="text-sm font-medium text-destructive">{t('auth.resetMissingToken')}</p>
            ) : null}
            {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
            <Button disabled={pending || !token} type="submit">
              {pending ? t('auth.resetPending') : t('auth.resetSubmit')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
