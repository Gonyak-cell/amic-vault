'use client';

import React, { FormEvent, useMemo, useState } from 'react';
import { FileCheck2, ShieldAlert } from 'lucide-react';
import type {
  CreateExternalLinkRequestDto,
  ExternalLinkCreatedResponseDto,
  ExternalManagementWorkspaceDto,
} from '@amic-vault/shared';
import { MatterDocumentList } from '@/components/document/matter-document-list';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiClientError } from '@/lib/api-client';
import type { MatterCodeOption } from '@/lib/matter-app';

export const externalDlpOverrideReasonCode = 'DLP_WARNING_ACCEPTED';

export interface LinkIssuanceDialogProps {
  disabled?: boolean;
  matterOption?: MatterCodeOption | null;
  onCreated: (created: ExternalLinkCreatedResponseDto) => void;
  onCreateLink: (input: CreateExternalLinkRequestDto) => Promise<ExternalLinkCreatedResponseDto>;
  workspace: ExternalManagementWorkspaceDto | null;
}

interface PendingDlpWarning {
  input: CreateExternalLinkRequestDto;
  message: string;
}

export function isExternalDlpWarningRequired(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    error.code === 'VALIDATION_FAILED' &&
    error.reason === 'EXTERNAL_DLP_WARNING_REQUIRED'
  );
}

export async function createExternalLinkAfterDlpAcceptance(
  input: CreateExternalLinkRequestDto,
  createLink: (nextInput: CreateExternalLinkRequestDto) => Promise<ExternalLinkCreatedResponseDto>,
): Promise<ExternalLinkCreatedResponseDto> {
  return createLink({
    ...input,
    dlpWarningAccepted: true,
    dlpOverrideReasonCode: externalDlpOverrideReasonCode,
  });
}

export function ExternalDlpWarningDialog({
  disabled,
  message,
  onAccept,
  onCancel,
}: {
  disabled?: boolean;
  message: string;
  onAccept: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4"
      role="dialog"
    >
      <section className="w-full max-w-lg rounded-md border bg-card p-5 shadow-lg">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-warning/10 text-warning">
            <ShieldAlert className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-normal">DLP 경고 수용</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={disabled} onClick={onCancel}>
            취소
          </Button>
          <Button type="button" disabled={disabled} onClick={onAccept}>
            <ShieldAlert className="h-4 w-4" />
            경고 수용 후 발급
          </Button>
        </div>
      </section>
    </div>
  );
}

export function LinkIssuanceDialog({
  disabled,
  matterOption,
  onCreated,
  onCreateLink,
  workspace,
}: LinkIssuanceDialogProps) {
  const [externalUserId, setExternalUserId] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [watermarkRequired, setWatermarkRequired] = useState(true);
  const [pendingDlpWarning, setPendingDlpWarning] = useState<PendingDlpWarning | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const users = workspace?.users ?? [];
  const selectedExternalUserId = externalUserId || users[0]?.externalUserId || '';
  const canSubmit = Boolean(workspace && selectedExternalUserId && documentId.trim() && expiresAt);

  const input = useMemo<CreateExternalLinkRequestDto | null>(() => {
    if (!workspace || !canSubmit) return null;
    return {
      workspaceId: workspace.workspaceId,
      externalUserId: selectedExternalUserId,
      documentId: documentId.trim(),
      ...(versionId.trim() ? { versionId: versionId.trim() } : {}),
      expiresAt: new Date(expiresAt).toISOString(),
      ndaVersion: 'NDA-R11-V1',
      watermarkRequired,
      dlpWarningAccepted: false,
    };
  }, [canSubmit, documentId, expiresAt, selectedExternalUserId, versionId, watermarkRequired, workspace]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input || busy) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const created = await onCreateLink(input);
      onCreated(created);
      setDocumentId('');
      setVersionId('');
    } catch (error) {
      if (isExternalDlpWarningRequired(error)) {
        setPendingDlpWarning({
          input,
          message: '선택한 문서에 외부 송부 전 확인이 필요한 DLP 결과가 있습니다.',
        });
      } else {
        setErrorMessage('링크를 발급하지 못했습니다.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function acceptDlpWarning() {
    if (!pendingDlpWarning || busy) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const created = await createExternalLinkAfterDlpAcceptance(
        pendingDlpWarning.input,
        onCreateLink,
      );
      onCreated(created);
      setPendingDlpWarning(null);
      setDocumentId('');
      setVersionId('');
    } catch {
      setErrorMessage('DLP 경고 수용 후 링크 발급에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-4">
      <form className="grid gap-3 lg:grid-cols-[minmax(12rem,1fr)_minmax(14rem,1fr)_minmax(12rem,1fr)_auto]" onSubmit={submit}>
        <select
          aria-label="외부 사용자"
          className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={disabled || busy || users.length === 0}
          value={selectedExternalUserId}
          onChange={(event) => setExternalUserId(event.target.value)}
        >
          {users.length === 0 ? <option value="">외부 사용자를 먼저 초대하세요</option> : null}
          {users.map((user) => (
            <option key={user.externalUserId} value={user.externalUserId}>
              {user.displayRef ?? user.emailHash.slice(0, 12)}
            </option>
          ))}
        </select>
        <Input
          aria-label="연결할 문서"
          disabled={disabled || busy || !workspace}
          placeholder="문서 식별값"
          value={documentId}
          onChange={(event) => setDocumentId(event.target.value)}
        />
        <Input
          aria-label="만료 시각"
          disabled={disabled || busy || !workspace}
          type="datetime-local"
          value={expiresAt}
          onChange={(event) => setExpiresAt(event.target.value)}
        />
        <Button type="submit" disabled={disabled || busy || !canSubmit}>
          <FileCheck2 className="h-4 w-4" />
          링크 발급
        </Button>
        <Input
          aria-label="연결할 버전"
          className="lg:col-span-2"
          disabled={disabled || busy || !workspace}
          placeholder="버전 식별값"
          value={versionId}
          onChange={(event) => setVersionId(event.target.value)}
        />
        <label className="flex min-h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm">
          <input
            checked={watermarkRequired}
            disabled={disabled || busy || !workspace}
            type="checkbox"
            onChange={(event) => setWatermarkRequired(event.target.checked)}
          />
          워터마크 필요
        </label>
      </form>

      {matterOption ? (
        <div className="border-t pt-4">
          <MatterDocumentList selectedMatter={matterOption} />
        </div>
      ) : null}

      {errorMessage ? <p className="text-sm font-medium text-destructive">{errorMessage}</p> : null}
      {pendingDlpWarning ? (
        <ExternalDlpWarningDialog
          disabled={busy}
          message={pendingDlpWarning.message}
          onAccept={acceptDlpWarning}
          onCancel={() => setPendingDlpWarning(null)}
        />
      ) : null}
    </section>
  );
}
