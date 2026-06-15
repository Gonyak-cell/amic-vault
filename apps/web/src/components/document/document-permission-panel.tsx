'use client';

import React, { useState } from 'react';
import { Save } from 'lucide-react';
import type { DocumentConfidentialityLevel } from '@amic-vault/shared';
import { documentConfidentialityLevels } from '@amic-vault/shared';
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
    unavailable: string;
    levels: Record<DocumentConfidentialityLevel, string>;
  }
> = {
  ko: {
    title: '접근 권한',
    confidentiality: '보안 등급',
    save: '보안 설정 저장',
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function save() {
    setSaving(true);
    setError(false);
    try {
      const updated = await updateDocumentConfidentiality(summary.documentId, level);
      setLevel(updated.confidentialityLevel);
    } catch {
      setError(true);
      setLevel(summary.confidentialityLevel);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-normal">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{summary.privilegeStatus}</p>
        </div>
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">{summary.status}</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium" htmlFor="document-confidentiality">
          {copy.confidentiality}
        </label>
        <select
          id="document-confidentiality"
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={level}
          onChange={(event) => setLevel(event.target.value as DocumentConfidentialityLevel)}
        >
          {documentConfidentialityLevels.map((item) => (
            <option key={item} value={item}>
              {copy.levels[item]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          aria-label={copy.save}
          title={copy.save}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background text-sm font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-destructive">{copy.unavailable}</p> : null}
    </section>
  );
}
