'use client';

import React, { useState } from 'react';
import { Save } from 'lucide-react';
import type { DocumentConfidentialityLevel } from '@amic-vault/shared';
import { documentConfidentialityLevels } from '@amic-vault/shared';
import type { DocumentPermissionSummary } from '../../lib/api/document-permissions';
import { updateDocumentConfidentiality } from '../../lib/api/document-permissions';

interface DocumentPermissionPanelProps {
  summary: DocumentPermissionSummary;
}

export function DocumentPermissionPanel({ summary }: DocumentPermissionPanelProps) {
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
          <h2 className="text-base font-semibold tracking-normal">Permissions</h2>
          <p className="text-sm text-muted-foreground">{summary.privilegeStatus}</p>
        </div>
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">{summary.status}</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium" htmlFor="document-confidentiality">
          Confidentiality
        </label>
        <select
          id="document-confidentiality"
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={level}
          onChange={(event) => setLevel(event.target.value as DocumentConfidentialityLevel)}
        >
          {documentConfidentialityLevels.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          aria-label="Save confidentiality"
          title="Save confidentiality"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background text-sm font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-destructive">Access unavailable</p> : null}
    </section>
  );
}
