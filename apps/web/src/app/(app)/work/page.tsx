import React from 'react';
import { resolveWorkInboxView } from '@/components/work/work-inbox-tabs';
import { NotificationsClient } from '../notifications/notifications-client';
import { WorkQueueClient } from './work-queue-client';

export default function WorkQueuePage({
  searchParams = {},
}: {
  searchParams?: { view?: string | string[] };
}) {
  return resolveWorkInboxView(searchParams.view) === 'notifications' ? (
    <NotificationsClient />
  ) : (
    <WorkQueueClient />
  );
}
