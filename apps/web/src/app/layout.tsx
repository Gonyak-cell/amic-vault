import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@/styles/globals.css';
import { Toaster } from '@/components/ui/toast';
import { LanguageProvider } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'AMIC Vault',
  description: 'Matter-centric legal data OS',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" data-language="ko" suppressHydrationWarning>
      <body>
        <LanguageProvider>
          {children}
          <Toaster />
        </LanguageProvider>
      </body>
    </html>
  );
}
