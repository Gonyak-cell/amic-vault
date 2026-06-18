import React from 'react';
import { RouteVisibilityGuard } from '@/components/security/route-visibility-guard';
import { EnterpriseHardeningClient } from '../enterprise/enterprise-hardening-client';

export default function AdminPage() {
  return (
    <RouteVisibilityGuard areaKey="route.area.admin" route="/admin">
      <EnterpriseHardeningClient />
    </RouteVisibilityGuard>
  );
}
