'use client';

import React from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logout } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

export function LogoutButton() {
  const { t } = useI18n();

  async function handleLogout() {
    await logout().catch(() => undefined);
    window.location.assign('/login');
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleLogout}>
      <LogOut data-icon="inline-start" />
      <span className="hidden sm:inline">{t('auth.logout')}</span>
    </Button>
  );
}
