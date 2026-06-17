import React from 'react';
import { RouteVisibilityGuard } from '@/components/security/route-visibility-guard';
import { EnterpriseHardeningClient } from './enterprise-hardening-client';

export default function EnterprisePage() {
  return (
    <RouteVisibilityGuard area="관리자 설정" route="/enterprise">
      <EnterpriseHardeningClient />
    </RouteVisibilityGuard>
  );
}
