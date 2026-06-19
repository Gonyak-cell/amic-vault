import React from 'react';
import { RecordsGovernanceClient } from './records-governance-client';

export default function RecordsPage() {
  return (
    <React.Suspense fallback={<div className="text-sm text-muted-foreground">기록 보존 정보를 불러오는 중입니다.</div>}>
      <RecordsGovernanceClient />
    </React.Suspense>
  );
}
