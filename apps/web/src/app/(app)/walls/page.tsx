import React from 'react';
import { RouteVisibilityGuard } from '@/components/security/route-visibility-guard';
import { WallAdminClient } from './wall-admin-client';

export default function WallsPage() {
  return (
    <RouteVisibilityGuard area="정보 차단" route="/walls">
      <WallAdminClient />
    </RouteVisibilityGuard>
  );
}
