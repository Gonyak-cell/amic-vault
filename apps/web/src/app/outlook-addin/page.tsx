import type { Metadata } from 'next';
import { OutlookAddinClient } from './outlook-addin-client';

export const metadata: Metadata = {
  title: 'AMIC Vault Outlook',
};

export default function OutlookAddinPage() {
  return <OutlookAddinClient />;
}
