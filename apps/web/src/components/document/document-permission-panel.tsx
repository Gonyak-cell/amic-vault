'use client';

import React, { useEffect, useState } from 'react';
import { Save, ShieldCheck } from 'lucide-react';
import type { DocumentConfidentialityLevel } from '@amic-vault/shared';
import { documentConfidentialityLevels } from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { useI18n, type Language } from '@/lib/i18n';
import type { DocumentPermissionSummary } from '../../lib/api/document-permissions';
import { updateDocumentConfidentiality } from '../../lib/api/document-permissions';

interface DocumentPermissionPanelProps {
  summary: DocumentPermissionSummary;
}

const permissionCopy: Record<
  Language,
  {
    title: string;
    confidentiality: string;
    save: string;
    saving: string;
    unavailable: string;
    levels: Record<DocumentConfidentialityLevel, string>;
  }
> = {
  ko: {
    title: '접근 권한',
    confidentiality: '보안 등급',
    save: '보안 설정 저장',
    saving: '저장 중',
    unavailable: '접근 정보를 확인할 수 없습니다.',
    levels: {
      standard: '일반',
      high: '높음',
      restricted: '제한됨',
    },
  },
  en: {
    title: 'Access',
    confidentiality: 'Security level',
    save: 'Save security level',
    saving: 'Saving',
    unavailable: 'Access information is unavailable.',
    levels: {
      standard: 'Standard',
      high: 'High',
      restricted: 'Restricted',
    },
  },
};

export function DocumentPermissionPanel({ summary }: DocumentPermissionPanelProps) {
  const { language } = useI18n();
  const copy = permissionCopy[language];
  const [level, setLevel] = useState<DocumentConfidentialityLevel>(summary.confidentialityLevel);
  const [persistedLevel, setPersistedLevel] = useState<DocumentConfidentialityLevel>(
    summary.confidentialityLevel,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const changed = level !== persistedLevel;

  useEffect(() => {
    setLevel(summary.confidentialityLevel);
    setPersistedLevel(summary.confidentialityLevel);
    setError(false);
  }, [summary.confidentialityLevel]);

  async function save() {
    if (!changed || saving) return;
    setSaving(true);
    setError(false);
    try {
      const updated = await updateDocumentConfidentiality(summary.documentId, level);
      setLevel(updated.confidentialityLevel);
      setPersistedLevel(updated.confidentialityLevel);
    } catch {
      setError(true);
      setLevel(persistedLevel);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      icon={<ShieldCheck className="h-4 w-4" />}
      title={copy.title}
      meta={summary.privilegeStatus}
      actions={<StatusBadge>{summary.status}</StatusBadge>}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium" htmlFor="document-confidentiality">
          {copy.confidentiality}
        </label>
        <select
          id="document-confidentiality"
          className="h-10 min-w-40 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={level}
          disabled={saving}
          onChange={(event) => setLevel(event.target.value as DocumentConfidentialityLevel)}
        >
          {documentConfidentialityLevels.map((item) => (
            <option key={item} value={item}>
              {copy.levels[item]}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={!changed || saving}
        >
          <Save className="h-4 w-4" />
          {saving ? copy.saving : copy.save}
        </Button>
      </div>
      {error ? <p className="mt-3 text-sm text-destructive">{copy.unavailable}</p> : null}
    </SectionCard>
  );
}
