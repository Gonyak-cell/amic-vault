import React from 'react';
import { RouteVisibilityGuard } from '@/components/security/route-visibility-guard';
import { RecordsGovernanceClient } from './records-governance-client';

export default function RecordsPage() {
  return (
    <RouteVisibilityGuard area="기록·보존" route="/records">
      <React.Suspense
        fallback={
          <div className="text-sm text-muted-foreground">기록 보존 정보를 불러오는 중입니다.</div>
        }
      >
        <RecordsGovernanceClient />
      </React.Suspense>
    </RouteVisibilityGuard>
  );
}
