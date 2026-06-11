'use client';

import { useState } from 'react';
import type { TenantId } from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { login } from '@/lib/auth';

export function LoginForm() {
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
      setError('로그인 정보를 확인할 수 없습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>AMIC Vault</CardTitle>
        <CardDescription>Tenant, email, password로 접속합니다.</CardDescription>
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
            {pending ? '확인 중' : '로그인'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
