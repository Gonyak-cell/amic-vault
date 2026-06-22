import React from 'react';
import { RouteVisibilityGuard } from '@/components/security/route-visibility-guard';
import { EnterpriseHardeningClient } from '../enterprise/enterprise-hardening-client';
import { AccountLedgerAdminClient } from './account-ledger-admin-client';

export default function AdminPage() {
  return (
    <RouteVisibilityGuard areaKey="route.area.admin" route="/admin">
      <EnterpriseHardeningClient>
        <AccountLedgerAdminClient />
      </EnterpriseHardeningClient>
    </RouteVisibilityGuard>
  );
}
