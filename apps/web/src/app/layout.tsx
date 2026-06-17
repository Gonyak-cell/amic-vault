import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@/styles/globals.css';
import { Toaster } from '@/components/ui/toast';
import { LanguageProvider } from '@/lib/i18n';
import { PwaRegistration } from './pwa-registration';

export const metadata: Metadata = {
  title: 'AMIC Vault',
  description: 'Matter-centric legal data OS',
  applicationName: 'AMIC Vault',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/amic-vault-icon.svg', type: 'image/svg+xml' },
      { url: '/icons/amic-vault-icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/amic-vault-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'AMIC Vault',
    statusBarStyle: 'black-translucent',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: 'hsl(218 83% 50%)',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" data-language="ko" suppressHydrationWarning>
      <body>
        <LanguageProvider>
          {children}
          <PwaRegistration />
          <Toaster />
        </LanguageProvider>
      </body>
    </html>
  );
}
