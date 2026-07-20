import React from 'react';
import { RouteVisibilityGuard } from '@/components/security/route-visibility-guard';
import { AdminSecurityClient } from './admin-security-client';

export default function AdminSecurityPage() {
  return (
    <RouteVisibilityGuard areaKey="route.area.adminSecurity" route="/admin/security">
      <AdminSecurityClient />
    </RouteVisibilityGuard>
  );
}
