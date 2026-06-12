import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ClipboardList,
  Archive,
  Building2,
  FileCog,
  FileSearch,
  FolderKanban,
  Gavel,
  LayoutDashboard,
  ScrollText,
  Shield,
} from 'lucide-react';
import { LogoutButton } from './logout-button';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-semibold">AMIC Vault</p>
            <p className="text-xs text-muted-foreground">Matter document control</p>
          </div>
          <div className="flex items-center gap-2">
            <nav className="flex items-center gap-1">
              <NavLink href="/dashboard" label="Dashboard">
                <LayoutDashboard className="h-4 w-4" />
              </NavLink>
              <NavLink href="/matters" label="Matters">
                <FolderKanban className="h-4 w-4" />
              </NavLink>
              <NavLink href="/search" label="Search">
                <FileSearch className="h-4 w-4" />
              </NavLink>
              <NavLink href="/contracts" label="Contracts">
                <FileCog className="h-4 w-4" />
              </NavLink>
              <NavLink href="/dd" label="DD Vault">
                <ClipboardList className="h-4 w-4" />
              </NavLink>
              <NavLink href="/litigation" label="Litigation">
                <Gavel className="h-4 w-4" />
              </NavLink>
              <NavLink href="/records" label="Records">
                <Archive className="h-4 w-4" />
              </NavLink>
              <NavLink href="/enterprise" label="Enterprise">
                <Building2 className="h-4 w-4" />
              </NavLink>
              <NavLink href="/audit" label="Audit">
                <ScrollText className="h-4 w-4" />
              </NavLink>
              <NavLink href="/walls" label="Walls">
                <Shield className="h-4 w-4" />
              </NavLink>
            </nav>
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-6">{children}</div>
    </main>
  );
}

function NavLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      href={href}
    >
      {children}
    </Link>
  );
}
