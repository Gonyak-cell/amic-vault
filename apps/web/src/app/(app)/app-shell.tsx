'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Menu, Search, X } from 'lucide-react';
import type { UserSummary } from '@amic-vault/shared';
import { getCurrentUser } from '@/lib/auth';
import { LanguageToggle, useI18n } from '@/lib/i18n';
import { getNavigationGroups, type NavigationGroup, type NavigationItem } from '@/lib/navigation';
import { LogoutButton } from './logout-button';

export function AppShell({
  children,
  currentUser: initialCurrentUser,
}: {
  children: ReactNode;
  currentUser?: UserSummary | null;
}) {
  const router = useRouter();
  const { language, t } = useI18n();
  const [currentUser, setCurrentUser] = useState<UserSummary | null>(() => initialCurrentUser ?? null);
  const [profileStatus, setProfileStatus] = useState<'loading' | 'ready' | 'error'>(() =>
    initialCurrentUser === undefined ? 'loading' : 'ready',
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileNavCloseButtonRef = useRef<HTMLButtonElement | null>(null);

  const closeMobileNav = useCallback((returnFocus = true) => {
    setMobileNavOpen(false);
    if (returnFocus) {
      window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
    }
  }, []);

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

  useEffect(() => {
    if (!mobileNavOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => mobileNavCloseButtonRef.current?.focus());

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMobileNav();
      }
    }

    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [closeMobileNav, mobileNavOpen]);

  const navigationGroups = useMemo(
    () => getNavigationGroups(currentUser?.role, language),
    [currentUser?.role, language],
  );

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return;
    closeMobileNav(false);
    router.push(`/search?q=${encodeURIComponent(trimmedQuery)}`);
  }

  function trapMobileNavFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="grid min-h-screen grid-rows-[63px_minmax(0,1fr)] overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-30 grid h-[63px] grid-cols-[minmax(0,1fr)_auto] items-center bg-[linear-gradient(90deg,hsl(var(--primary-strong))_0%,hsl(var(--primary))_100%)] text-primary-foreground shadow-sm md:grid-cols-[255px_minmax(0,1fr)]">
        <Link
          href="/dashboard"
          aria-label={t('app.homeAria')}
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
          <button
            ref={mobileMenuButtonRef}
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-white/12 text-white ring-1 ring-white/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label={t('nav.toggle')}
            aria-expanded={mobileNavOpen}
            aria-controls="vault-mobile-navigation"
            onClick={() => (mobileNavOpen ? closeMobileNav(false) : setMobileNavOpen(true))}
          >
            {mobileNavOpen ? (
              <X className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Menu className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          <LogoutButton compact />
        </div>

        <div className="hidden min-w-0 items-center justify-between gap-4 px-5 md:flex">
          <SearchForm
            ariaLabel={t('nav.searchAria')}
            onSubmit={submitSearch}
            placeholder={t('nav.searchPlaceholder')}
            query={searchQuery}
            setQuery={setSearchQuery}
          />
          <div className="flex shrink-0 items-center gap-2">
            <LanguageToggle />
            <Link
              href="/notifications"
              className="hidden h-9 items-center gap-2 rounded-md bg-white/12 px-3 text-xs font-semibold text-white/90 ring-1 ring-white/16 transition-colors hover:bg-white/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white lg:inline-flex"
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              {t('nav.notifications')}
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      {mobileNavOpen ? (
        <div
          id="vault-mobile-navigation"
          className="fixed inset-0 z-40 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={t('nav.mobileLabel')}
        >
          <button
            type="button"
            tabIndex={-1}
            className="absolute inset-0 bg-foreground/30"
            aria-label={t('nav.close')}
            onClick={() => closeMobileNav()}
          />
          <aside
            className="relative flex h-full w-[min(22rem,calc(100vw-2rem))] flex-col border-r bg-background shadow-xl"
            onKeyDown={trapMobileNavFocus}
          >
            <div className="flex h-[63px] items-center justify-between border-b px-4">
              <img src="/icons/amic-vault-wordmark.svg" alt="AMIC Vault" className="h-8 w-[132px]" draggable={false} />
              <button
                ref={mobileNavCloseButtonRef}
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t('nav.close')}
                onClick={() => closeMobileNav()}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="border-b p-3">
              <SearchForm
                ariaLabel={t('nav.searchAria')}
                onSubmit={submitSearch}
                placeholder={t('nav.searchPlaceholder')}
                query={searchQuery}
                setQuery={setSearchQuery}
                compact
              />
            </div>
            <ProfilePanel status={profileStatus} user={currentUser} />
            <NavigationList groups={navigationGroups} onNavigate={() => closeMobileNav(false)} />
            <div className="mt-auto border-t p-3">
              <LanguageToggle />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="grid min-h-0 grid-cols-1 md:grid-cols-[255px_minmax(0,1fr)]">
        <aside aria-label={t('nav.mobileLabel')} className="hidden min-h-0 flex-col border-r bg-background md:flex">
          <ProfilePanel status={profileStatus} user={currentUser} />
          <NavigationList groups={navigationGroups} />
          <div className="mt-auto" />
        </aside>

        <div className="min-w-0 overflow-x-hidden bg-background px-3.5 py-3.5 sm:px-5 sm:py-5 md:px-6">
          {children}
        </div>
      </div>
    </div>
  );
}

function SearchForm({
  ariaLabel,
  compact = false,
  onSubmit,
  placeholder,
  query,
  setQuery,
}: {
  ariaLabel: string;
  compact?: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  placeholder: string;
  query: string;
  setQuery: (query: string) => void;
}) {
  return (
    <form
      className={
        compact
          ? 'flex h-9 w-full items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground'
          : 'flex h-9 w-full max-w-[560px] items-center gap-2.5 rounded-lg bg-white/15 px-3 text-sm text-white/75'
      }
      onSubmit={onSubmit}
      role="search"
    >
      <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
      <input
        aria-label={ariaLabel}
        className={
          compact
            ? 'min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground'
            : 'min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/70'
        }
        placeholder={placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
    </form>
  );
}

function NavigationList({
  groups,
  onNavigate,
}: {
  groups: NavigationGroup[];
  onNavigate?: (() => void) | undefined;
}) {
  return (
    <nav className="px-2.5 pb-3">
      {groups.map((group) => (
        <div key={group.key} className="pb-3">
          <div className="px-2 pb-1.5 pt-2 text-[11px] font-bold uppercase text-muted-foreground">
            {group.label}
          </div>
          {group.items.map((item) => (
            <NavItem key={`${item.href}-${item.label}`} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  );
}

function ProfilePanel({ status, user }: { status: 'loading' | 'ready' | 'error'; user: UserSummary | null }) {
  const { t } = useI18n();
  let body: ReactNode;
  if (user) {
    body = (
      <>
        <div className="truncate text-sm font-semibold text-foreground">{user.name}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</div>
      </>
    );
  } else {
    body = (
      <div className="text-xs font-semibold text-muted-foreground">
        {status === 'error' ? t('profile.error') : t('profile.loading')}
      </div>
    );
  }

  return (
    <section aria-label={t('profile.aria')} className="m-3.5 rounded-lg border bg-card p-3">
      {body}
    </section>
  );
}

function NavItem({ item, onNavigate }: { item: NavigationItem; onNavigate?: (() => void) | undefined }) {
  const pathname = usePathname();
  const Icon = item.icon;
  const active =
    pathname === item.href ||
    (item.href !== '/dashboard' && item.href !== '/search' && pathname.startsWith(`${item.href}/`)) ||
    (item.href === '/dashboard' && pathname === '/');
  const clickProps = onNavigate ? { onClick: onNavigate } : {};

  return (
    <Link
      href={item.href}
      className={`relative flex min-h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-semibold transition-colors ${
        active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
      }`}
      aria-current={active ? 'page' : undefined}
      {...clickProps}
    >
      {active ? (
        <span className="absolute -left-2.5 top-2 h-5 w-[3px] rounded-full bg-primary" aria-hidden="true" />
      ) : null}
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
  );
}
