import React from 'react';
import { RouteVisibilityGuard } from '@/components/security/route-visibility-guard';
import { EnterpriseHardeningClient } from './enterprise-hardening-client';

export default function EnterprisePage() {
  return (
    <RouteVisibilityGuard areaKey="route.area.enterprise" route="/enterprise">
      <EnterpriseHardeningClient />
    </RouteVisibilityGuard>
  );
}
