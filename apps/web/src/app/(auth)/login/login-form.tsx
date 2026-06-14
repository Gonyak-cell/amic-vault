'use client';

import React, { useState } from 'react';
import type { TenantId } from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { login } from '@/lib/auth';
import { LanguageToggle, useI18n } from '@/lib/i18n';

export function LoginForm() {
  const { t } = useI18n();
  const [tenantId, setTenantId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await login({ tenantId: tenantId as TenantId, email, password });
      window.location.assign('/dashboard');
    } catch {
      setError(t('auth.invalid'));
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
            <CardDescription>{t('auth.description')}</CardDescription>
          </div>
          <LanguageToggle />
        </div>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Tenant ID
            <Input
              autoComplete="organization"
              required
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Email
            <Input
              autoComplete="email"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Password
            <Input
              autoComplete="current-password"
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
          <Button disabled={pending} type="submit">
            {pending ? t('auth.pending') : t('auth.login')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
