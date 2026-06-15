'use client';

import React, { type ReactNode } from 'react';
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
import { LanguageToggle } from '@/lib/i18n';
import { LogoutButton } from './logout-button';

type NavigationItem = {
  count?: string;
  href: string;
  icon: LucideIcon;
  label: string;
};

const vaultNavigation: NavigationItem[] = [
  { href: '/dashboard', label: '홈', icon: CheckSquare },
  { href: '/matters', label: '사건', icon: FolderKanban, count: '18' },
  { href: '/search', label: '파일', icon: FileText, count: '642' },
  { href: '/search', label: '검색', icon: Search },
];

const governanceNavigation: NavigationItem[] = [
  { href: '/records', label: '기록 보존', icon: Archive },
  { href: '/audit', label: '접근 기록', icon: History, count: '9' },
  { href: '/walls', label: '정보 차단', icon: Shield },
  { href: '/launch', label: '공유 요청', icon: Activity },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen grid-rows-[63px_minmax(0,1fr)_auto] overflow-x-hidden bg-[#f8fafd] text-[#1a1f36]">
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
          <div className="m-3.5 rounded-lg border border-[#e8ecf4] bg-white p-3">
            <div className="text-[11px] font-bold uppercase text-[#8a97a8]">워크스페이스</div>
            <div className="mt-1 text-sm font-bold text-[#1a1f36]">Gonyak Legal Ops</div>
            <div className="mt-0.5 text-xs text-[#4a5a70]">워크스페이스 ID: amic-prod-shadow</div>
          </div>

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

          <div className="mt-auto border-t border-[#e8ecf4] px-3.5 py-3 text-xs text-[#4a5a70]">
            <div className="flex items-center justify-between gap-2">
              <span>기록 동기화</span>
              <span className="h-2 w-2 rounded-full bg-[#1464e8]" aria-hidden="true" />
            </div>
            <div className="mt-0.5">최근 활동 18:42 KST</div>
          </div>
        </aside>

        <div className="min-w-0 overflow-x-hidden bg-[#f8fafd] px-3.5 py-3.5 sm:px-5 sm:py-5 md:px-6">
          {children}
        </div>
      </div>

      <footer className="flex min-h-7 flex-wrap items-start justify-between gap-x-3 gap-y-1 border-t border-[#e8ecf4] bg-[#f4f6fb] px-3.5 py-1.5 text-[11px] font-semibold text-[#4a5a70] md:items-center md:py-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Vault 상태: 정상</span>
          <span>정보 차단: 적용 중</span>
          <span>활동 기록: 자동 저장</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>미리보기 모드</span>
          <span>18:42 KST</span>
        </div>
      </footer>
    </main>
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
      {item.count ? (
        <span className="ml-auto text-[11px] font-bold text-[#8a97a8]">{item.count}</span>
      ) : null}
    </Link>
  );
}
