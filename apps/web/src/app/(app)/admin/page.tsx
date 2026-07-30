import React from 'react';
import { RouteVisibilityGuard } from '@/components/security/route-visibility-guard';
import { EnterpriseHardeningClient } from '../enterprise/enterprise-hardening-client';
import { AccountLedgerAdminClient } from './account-ledger-admin-client';
import { AdminRouteHub } from './admin-route-hub';

export default function AdminPage() {
  return (
    <RouteVisibilityGuard areaKey="route.area.admin" route="/admin">
      <EnterpriseHardeningClient>
        <AdminRouteHub />
        <AccountLedgerAdminClient />
      </EnterpriseHardeningClient>
    </RouteVisibilityGuard>
  );
}
