import React from 'react';
import { RouteVisibilityGuard } from '@/components/security/route-visibility-guard';
import { AuditConsoleClient } from './audit-console-client';

export default function AuditPage() {
  return (
    <RouteVisibilityGuard area="감사 기록" route="/audit">
      <AuditConsoleClient />
    </RouteVisibilityGuard>
  );
}
