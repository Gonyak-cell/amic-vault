'use client';

import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logout } from '@/lib/auth';

export function LogoutButton() {
  async function handleLogout() {
    await logout().catch(() => undefined);
    window.location.assign('/login');
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleLogout}>
      <LogOut data-icon="inline-start" />
      로그아웃
    </Button>
  );
}
