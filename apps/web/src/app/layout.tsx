import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@/styles/globals.css';
import { Toaster } from '@/components/ui/toast';

export const metadata: Metadata = {
  title: 'AMIC Vault',
  description: 'Matter-centric legal data OS',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
