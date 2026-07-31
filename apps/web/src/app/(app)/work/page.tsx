import React from 'react';
import { workQueueUrlStateFromParams } from '@/lib/api/work-ops';
import { NotificationsClient } from '../notifications/notifications-client';
import { WorkQueueClient } from './work-queue-client';

export default function WorkQueuePage({
  searchParams = {},
}: {
  searchParams?: {
    view?: string | string[];
    assignee?: string | string[];
    kind?: string | string[];
    limit?: string | string[];
    offset?: string | string[];
  };
}) {
  const urlState = workQueueUrlStateFromParams(searchParams);
  return urlState.view === 'notifications' ? (
    <NotificationsClient urlState={urlState} />
  ) : (
    <WorkQueueClient urlState={urlState} />
  );
}
