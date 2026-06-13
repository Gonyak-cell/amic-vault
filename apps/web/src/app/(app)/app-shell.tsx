'use client';

import React, { type ReactNode } from 'react';
import Link from 'next/link';
import {
  Activity,
  Archive,
  Bell,
  Building2,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  FileCog,
  FileSearch,
  FolderKanban,
  Gavel,
  Gauge,
  LayoutDashboard,
  Menu,
  ScrollText,
  Search,
  Settings,
  Shield,
  Sparkles,
} from 'lucide-react';
import { LanguageToggle, useI18n } from '@/lib/i18n';
import { LogoutButton } from './logout-button';

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <main className="min-h-screen overflow-x-hidden bg-background">
      <header className="sticky top-0 z-30 h-[72px] border-b bg-card">
        <div className="flex h-full items-center justify-between gap-3 px-3 sm:gap-5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <HeaderIconButton label={t('nav.toggle')}>
              <Menu className="h-5 w-5" />
            </HeaderIconButton>
            <Link href="/dashboard" className="flex shrink-0 items-center gap-2 sm:min-w-36">
              <span className="grid h-9 w-9 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                A
              </span>
              <span className="hidden text-base font-semibold sm:inline">AMIC Vault</span>
            </Link>
            <Link
              href="/matters"
              className="hidden h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:inline-flex"
            >
              {t('nav.create')}
            </Link>
            <HeaderMenu label={t('nav.recent')} />
            <HeaderMenu label={t('nav.favorites')} />
            <HeaderMenu label={t('nav.spaces')} />
          </div>

          <div className="hidden h-10 w-full max-w-[520px] items-center justify-between rounded-md border bg-muted px-3 text-sm text-muted-foreground lg:flex">
            <span className="flex min-w-0 items-center gap-2">
              <Search className="h-4 w-4 shrink-0" />
              <span className="truncate">{t('nav.globalSearch')}</span>
            </span>
            <span className="font-mono text-xs">Cmd + K</span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <LanguageToggle />
            <span className="hidden h-9 items-center gap-2 rounded-full bg-emerald-50 px-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200 xl:inline-flex">
              <Shield className="h-4 w-4" />
              {t('nav.securityQueue')}
            </span>
            <span className="hidden items-center gap-2 md:flex">
              <HeaderIconButton label={t('nav.notifications')}>
                <Bell className="h-5 w-5" />
              </HeaderIconButton>
              <HeaderIconButton label={t('nav.help')}>
                <CircleHelp className="h-5 w-5" />
              </HeaderIconButton>
              <HeaderIconButton label={t('nav.settings')}>
                <Settings className="h-5 w-5" />
              </HeaderIconButton>
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-72px)] grid-cols-[64px_minmax(0,1fr)] sm:grid-cols-[80px_minmax(0,1fr)]">
        <aside className="sticky top-[72px] h-[calc(100vh-72px)] border-r bg-card px-2 py-5 sm:px-3">
          <nav className="flex flex-col items-center gap-2">
            <NavLink href="/dashboard" label={t('nav.dashboard')}>
              <LayoutDashboard className="h-5 w-5" />
            </NavLink>
            <NavLink href="/matters" label={t('nav.matters')}>
              <FolderKanban className="h-5 w-5" />
            </NavLink>
            <NavLink href="/search" label={t('nav.search')}>
              <FileSearch className="h-5 w-5" />
            </NavLink>
            <NavLink href="/contracts" label={t('nav.contracts')}>
              <FileCog className="h-5 w-5" />
            </NavLink>
            <NavLink href="/dd" label={t('nav.dd')}>
              <ClipboardList className="h-5 w-5" />
            </NavLink>
            <NavLink href="/litigation" label={t('nav.litigation')}>
              <Gavel className="h-5 w-5" />
            </NavLink>
            <NavDivider />
            <NavLink href="/records" label={t('nav.records')}>
              <Archive className="h-5 w-5" />
            </NavLink>
            <NavLink href="/enterprise" label={t('nav.enterprise')}>
              <Building2 className="h-5 w-5" />
            </NavLink>
            <NavLink href="/scale" label={t('nav.scale')}>
              <Gauge className="h-5 w-5" />
            </NavLink>
            <NavDivider />
            <NavLink href="/audit" label={t('nav.audit')}>
              <ScrollText className="h-5 w-5" />
            </NavLink>
            <NavLink href="/walls" label={t('nav.walls')}>
              <Shield className="h-5 w-5" />
            </NavLink>
            <NavLink href="/dashboard" label={t('nav.liveActivity')}>
              <Activity className="h-5 w-5" />
            </NavLink>
            <NavLink href="/dashboard" label={t('nav.aiEvidence')}>
              <Sparkles className="h-5 w-5" />
            </NavLink>
          </nav>
        </aside>
        <div className="min-w-0 overflow-x-hidden px-3 py-4 sm:px-6 sm:py-6">{children}</div>
      </div>
    </main>
  );
}

function NavLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link
      aria-label={label}
      title={label}
      className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      href={href}
    >
      {children}
    </Link>
  );
}

function HeaderMenu({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="hidden h-10 items-center gap-1 rounded-md px-2 text-sm font-medium hover:bg-muted xl:inline-flex"
      title={label}
    >
      {label}
      <ChevronDown className="h-4 w-4" />
    </button>
  );
}

function HeaderIconButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

function NavDivider() {
  return <div className="my-2 h-px w-10 bg-border" />;
}
