'use client';

import React from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logout } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function LogoutButton({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const label = t('auth.logout');

  async function handleLogout() {
    await logout().catch(() => undefined);
    window.location.assign('/login');
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      className={cn(
        'border-white/45 bg-white text-primary hover:bg-white/90',
        compact ? 'h-9 w-9 px-0' : undefined,
        className,
      )}
      onClick={handleLogout}
    >
      <LogOut data-icon="inline-start" />
      <span className={compact ? 'sr-only' : 'hidden sm:inline'}>{label}</span>
    </Button>
  );
}
