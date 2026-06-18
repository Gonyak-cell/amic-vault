'use client';

import React, { useEffect, useState } from 'react';
import type { OutlookIntegrationAdminFeature, OutlookIntegrationAdminStatusDto } from '@amic-vault/shared';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { getOutlookIntegrationAdminStatus } from '@/lib/api/outlook-addin';
import { getTranslation, useI18n, type Language, type TranslationKey } from '@/lib/i18n';

type StatusState =
  | { status: 'loading' }
  | { status: 'ready'; data: OutlookIntegrationAdminStatusDto }
  | { status: 'error' };

const featureLabelKeys: Record<OutlookIntegrationAdminFeature, TranslationKey> = {
  ADDIN_BOOTSTRAP: 'outlook.feature.addinBootstrap',
  AUTH_EXCHANGE: 'outlook.feature.authExchange',
  GRAPH_ATTACHMENT_ACQUISITION: 'outlook.feature.graphAttachment',
  SMART_ALERTS: 'outlook.feature.smartAlerts',
  SEND_FILE: 'outlook.feature.sendFile',
  DOCUMENT_INSERTION: 'outlook.feature.documentInsertion',
  FOLDER_MAPPING: 'outlook.feature.folderMapping',
  AUTOFILE: 'outlook.feature.autofile',
};

const evidenceLabelKeys: Record<string, TranslationKey> = {
  'EV-OUTLOOK-002': 'outlook.evidence.manifest',
  'EV-OUTLOOK-003': 'outlook.evidence.graphConsent',
  'OPERATOR-APPROVAL': 'outlook.evidence.operatorApproval',
  'DISABLE-REMOVE-REHEARSAL': 'outlook.evidence.rollbackRehearsal',
};

const reasonLabelKeys: Record<string, TranslationKey> = {
  AUDIT_UNAVAILABLE: 'outlook.reason.auditUnavailable',
  GLOBAL_DISABLED: 'outlook.reason.globalDisabled',
  FEATURE_DISABLED: 'outlook.reason.featureDisabled',
  RING_NOT_ALLOWED: 'outlook.reason.ringNotAllowed',
  MISSING_EVIDENCE_REF: 'outlook.reason.missingEvidence',
  MALFORMED_EVIDENCE_REF: 'outlook.reason.malformedEvidence',
  MISSING_GRAPH_CONSENT_REF: 'outlook.reason.graphConsentMissing',
  MISSING_MANIFEST_VALIDATION_REF: 'outlook.reason.manifestMissing',
  MISSING_OPERATOR_APPROVAL_REF: 'outlook.reason.operatorApprovalMissing',
  MISSING_ROLLBACK_REHEARSAL_REF: 'outlook.reason.rollbackMissing',
  UNKNOWN_FEATURE: 'outlook.reason.unknownFeature',
  UNKNOWN_RING: 'outlook.reason.unknownRing',
};

export function OutlookIntegrationStatusClient() {
  const [state, setState] = useState<StatusState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    getOutlookIntegrationAdminStatus()
      .then((data) => {
        if (active) setState({ status: 'ready', data });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, []);

  return <OutlookIntegrationStatusContent state={state} />;
}

export function OutlookIntegrationStatusContent({ state }: { state: StatusState }) {
  const { language, t } = useI18n();

  if (state.status === 'loading') {
    return (
      <EmptyState
        variant="api-unavailable"
        title={t('outlook.loading.title')}
        description={t('outlook.loading.description')}
      />
    );
  }

  if (state.status === 'error') {
    return (
      <EmptyState
        variant="api-error"
        title={t('outlook.error.title')}
        description={t('outlook.error.description')}
      />
    );
  }

  const status = state.data;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(22rem,0.7fr)]">
      <SectionCard title={t('outlook.gate.title')} meta={t('outlook.gate.meta')}>
        <dl className="grid gap-3 sm:grid-cols-3">
          <StatusValue
            label={t('outlook.gate.enforced')}
            value={status.operationalGateEnforced ? t('outlook.status.enforced') : t('outlook.status.devMode')}
            tone={status.operationalGateEnforced ? 'success' : 'neutral'}
          />
          <StatusValue
            label={t('outlook.gate.rolloutRing')}
            value={status.rolloutRing ?? t('outlook.status.unset')}
            tone={status.rolloutRing ? 'neutral' : 'warning'}
          />
          <StatusValue
            label={t('outlook.gate.auditAvailability')}
            value={status.auditAvailable ? t('outlook.status.confirmed') : t('outlook.status.unconfirmed')}
            tone={status.auditAvailable ? 'success' : 'blocked'}
          />
        </dl>
      </SectionCard>

      <SectionCard title={t('outlook.evidence.title')} meta={t('outlook.evidence.meta')}>
        <div className="flex flex-col gap-2">
          {status.evidence.map((item) => (
            <div key={item.kind} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <span className="min-w-0 truncate text-sm font-medium">
                {labelForKey(evidenceLabelKeys[item.kind], language, 'outlook.evidence.missing')}
              </span>
              <StatusBadge tone={item.present && item.validFormat ? 'success' : 'warning'}>
                {item.present
                  ? item.validFormat
                    ? t('outlook.evidence.valid')
                    : t('outlook.evidence.invalid')
                  : t('outlook.evidence.missing')}
              </StatusBadge>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard className="lg:col-span-2" title={t('outlook.features.title')} meta={t('outlook.features.meta')}>
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-[760px] w-full border-collapse text-sm">
            <caption className="sr-only">{t('outlook.features.caption')}</caption>
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t('outlook.features.feature')}</th>
                <th className="px-4 py-3 font-medium">{t('outlook.features.configuration')}</th>
                <th className="px-4 py-3 font-medium">{t('outlook.features.gate')}</th>
                <th className="px-4 py-3 font-medium">{t('outlook.features.reason')}</th>
              </tr>
            </thead>
            <tbody>
              {status.features.map((feature) => (
                <tr key={feature.feature} className="border-t">
                  <td className="px-4 py-3 font-medium">
                    {labelForKey(featureLabelKeys[feature.feature], language, 'outlook.feature.unknown')}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={feature.configured ? 'success' : 'neutral'}>
                      {feature.configured ? t('outlook.features.enabled') : t('outlook.features.disabled')}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={feature.allowed ? 'success' : 'blocked'}>
                      {feature.allowed ? t('outlook.features.allowed') : t('outlook.features.blocked')}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {feature.allowed ? t('outlook.features.noReason') : reasonLabel(feature.reasonCode, language)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

function labelForKey(
  key: TranslationKey | undefined,
  language: Language,
  fallbackKey: TranslationKey,
): string {
  return getTranslation(key ?? fallbackKey, language);
}

function reasonLabel(reasonCode: string | undefined, language: Language): string {
  return labelForKey(reasonCode ? reasonLabelKeys[reasonCode] : undefined, language, 'outlook.features.policyReview');
}

function StatusValue({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'blocked';
  value: string;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-2">
        <StatusBadge tone={tone}>{value}</StatusBadge>
      </dd>
    </div>
  );
}
