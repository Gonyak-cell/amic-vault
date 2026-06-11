import type { ReactNode } from 'react';
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
          <LogoutButton />
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-6">{children}</div>
    </main>
  );
}
