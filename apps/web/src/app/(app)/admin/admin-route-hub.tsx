import Link from 'next/link';
import React from 'react';
import { SectionCard } from '@/components/ui/section-card';

const adminRoutes = [
  { href: '/records', label: '기록·보존' },
  { href: '/audit', label: '감사 기록' },
  { href: '/admin/security', label: '보안 설정' },
  { href: '/integrations/outlook', label: 'Outlook 연동' },
  { href: '/integrations/matter-app', label: 'Matter 앱 연동' },
  { href: '/enterprise', label: '조직 설정' },
] as const;

export function AdminRouteHub() {
  return (
    <SectionCard title="관리 기능">
      <nav aria-label="관리 기능">
        <ul className="divide-y">
          {adminRoutes.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex min-h-10 items-center rounded-sm px-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </SectionCard>
  );
}
