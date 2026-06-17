'use client';

import React, { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Archive,
  Bell,
  CheckSquare,
  FileText,
  FolderKanban,
  History,
  Search,
  Shield,
  type LucideIcon,
} from 'lucide-react';
import type { UserSummary } from '@amic-vault/shared';
import { getCurrentUser } from '@/lib/auth';
import { LanguageToggle } from '@/lib/i18n';
import { LogoutButton } from './logout-button';

type NavigationItem = {
  href: string;
  icon: LucideIcon;
  label: string;
};

const vaultNavigation: NavigationItem[] = [
  { href: '/dashboard', label: '홈', icon: CheckSquare },
  { href: '/matters', label: '사건', icon: FolderKanban },
  { href: '/search', label: '파일', icon: FileText },
  { href: '/search', label: '검색', icon: Search },
];

const governanceNavigation: NavigationItem[] = [
  { href: '/records', label: '기록 보존', icon: Archive },
  { href: '/audit', label: '접근 기록', icon: History },
  { href: '/walls', label: '정보 차단', icon: Shield },
  { href: '/launch', label: '공유 요청', icon: Activity },
];

export function AppShell({
  children,
  currentUser: initialCurrentUser,
}: {
  children: ReactNode;
  currentUser?: UserSummary | null;
}) {
  const [currentUser, setCurrentUser] = useState<UserSummary | null>(() => initialCurrentUser ?? null);
  const [profileStatus, setProfileStatus] = useState<'loading' | 'ready' | 'error'>(() =>
    initialCurrentUser === undefined ? 'loading' : 'ready',
  );

  useEffect(() => {
    if (initialCurrentUser !== undefined) {
      setCurrentUser(initialCurrentUser);
      setProfileStatus('ready');
      return undefined;
    }

    let active = true;
    setProfileStatus('loading');
    getCurrentUser()
      .then((response) => {
        if (!active) return;
        setCurrentUser(response.user);
        setProfileStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setCurrentUser(null);
        setProfileStatus('error');
      });

    return () => {
      active = false;
    };
  }, [initialCurrentUser]);

  return (
    <main className="grid min-h-screen grid-rows-[63px_minmax(0,1fr)] overflow-x-hidden bg-[#f8fafd] text-[#1a1f36]">
      <header className="sticky top-0 z-30 grid h-[63px] grid-cols-[minmax(0,1fr)_auto] items-center bg-[linear-gradient(90deg,#1448c4_0%,#1448c4_42%,#1464e8_100%)] text-white shadow-sm md:grid-cols-[255px_minmax(0,1fr)]">
        <Link
          href="/dashboard"
          aria-label="AMIC Vault 홈"
          className="flex h-full min-w-0 items-center px-[18px] md:border-r md:border-white/15"
        >
          <img
            src="/icons/amic-vault-wordmark.svg"
            alt="AMIC Vault"
            className="h-10 w-[139px] object-contain brightness-0 invert"
            draggable={false}
          />
        </Link>

        <div className="flex items-center gap-2 pr-3.5 md:hidden">
          <LogoutButton compact />
        </div>

        <div className="hidden min-w-0 items-center justify-between gap-4 px-5 md:flex">
          <label className="flex h-9 w-full max-w-[560px] items-center gap-2.5 rounded-lg bg-white/15 px-3 text-sm text-white/75">
            <Search className="h-4 w-4 shrink-0" />
            <input
              aria-label="Vault 검색"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/70"
              placeholder="사건, 파일, 담당자 검색"
            />
          </label>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageToggle />
            <span className="hidden h-9 items-center gap-2 rounded-md bg-white/12 px-3 text-xs font-semibold text-white/86 ring-1 ring-white/16 lg:inline-flex">
              <Bell className="h-4 w-4" />
              알림
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-1 md:grid-cols-[255px_minmax(0,1fr)]">
        <aside
          aria-label="Vault 내비게이션"
          className="hidden min-h-0 flex-col border-r border-[#e5e5e5] bg-[#fafafa] md:flex"
        >
          <ProfilePanel status={profileStatus} user={currentUser} />

          <nav className="px-2.5 pb-3">
            <div className="px-2 pb-1.5 pt-2 text-[11px] font-bold uppercase text-[#8a97a8]">
              Vault
            </div>
            {vaultNavigation.map((item) => (
              <NavItem key={`${item.href}-${item.label}`} item={item} />
            ))}
          </nav>

          <nav className="px-2.5 pb-3">
            <div className="px-2 pb-1.5 pt-2 text-[11px] font-bold uppercase text-[#8a97a8]">
              관리
            </div>
            {governanceNavigation.map((item) => (
              <NavItem key={`${item.href}-${item.label}`} item={item} />
            ))}
          </nav>

          <div className="mt-auto" />
        </aside>

        <div className="min-w-0 overflow-x-hidden bg-[#f8fafd] px-3.5 py-3.5 sm:px-5 sm:py-5 md:px-6">
          {children}
        </div>
      </div>
    </main>
  );
}

function ProfilePanel({ status, user }: { status: 'loading' | 'ready' | 'error'; user: UserSummary | null }) {
  let body: ReactNode;
  if (user) {
    body = (
      <>
        <div className="truncate text-sm font-bold text-[#1a1f36]">{user.name}</div>
        <div className="mt-0.5 truncate text-xs text-[#4a5a70]">{user.email}</div>
      </>
    );
  } else {
    body = (
      <div className="text-xs font-semibold text-[#4a5a70]">
        {status === 'error' ? '계정 정보를 표시할 수 없습니다' : '계정 정보 불러오는 중'}
      </div>
    );
  }

  return (
    <section aria-label="사용자 프로필" className="m-3.5 rounded-lg border border-[#e8ecf4] bg-white p-3">
      {body}
    </section>
  );
}

function NavItem({ item }: { item: NavigationItem }) {
  const pathname = usePathname();
  const Icon = item.icon;
  const active = pathname === item.href || (item.href === '/dashboard' && pathname === '/');

  return (
    <Link
      href={item.href}
      className={`relative flex min-h-9 items-center gap-2.5 rounded-[7px] px-2.5 text-[13px] font-semibold transition-colors ${
        active ? 'bg-[#1464e8]/10 text-[#1464e8]' : 'text-[#1a1f36] hover:bg-black/[0.06]'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      {active ? (
        <span className="absolute -left-2.5 top-2 h-5 w-[3px] rounded-full bg-[#1464e8]" />
      ) : null}
      <Icon className="h-4 w-4 shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}
