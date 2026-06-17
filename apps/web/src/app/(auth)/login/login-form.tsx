'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { login } from '@/lib/auth';
import { LanguageToggle, useI18n } from '@/lib/i18n';

export function LoginForm() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await login({ email, password });
      window.location.assign('/dashboard');
    } catch {
      setError(t('auth.invalid'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-[420px] overflow-hidden border-border bg-card shadow-lg">
      <div className="h-1 bg-primary" aria-hidden="true" />
      <CardHeader className="gap-0 p-6 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="flex items-center">
              <img
                src="/icons/amic-vault-wordmark.svg"
                alt="AMIC Vault"
                className="h-7 w-[132px]"
              />
            </CardTitle>
            <CardDescription className="mt-5 text-[13px] leading-6 text-muted-foreground">
              {t('auth.description')}
            </CardDescription>
          </div>
          <LanguageToggle />
        </div>
      </CardHeader>
      <CardContent className="p-6 pt-2">
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <label className="flex flex-col gap-2 text-sm font-semibold text-foreground">
            {t('auth.email')}
            <Input
              autoComplete="email"
              className="border-input bg-background focus-visible:ring-ring"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold text-foreground">
            {t('auth.password')}
            <Input
              autoComplete="current-password"
              className="border-input bg-background focus-visible:ring-ring"
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
          <Button
            className="mt-1"
            disabled={pending}
            type="submit"
          >
            {pending ? t('auth.pending') : t('auth.login')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
