import React from 'react';
import { RouteVisibilityGuard } from '@/components/security/route-visibility-guard';
import { EnterpriseHardeningClient } from '../../enterprise/enterprise-hardening-client';

export default function AdminSecurityPage() {
  return (
    <RouteVisibilityGuard areaKey="route.area.adminSecurity" route="/admin/security">
      <EnterpriseHardeningClient />
    </RouteVisibilityGuard>
  );
}
