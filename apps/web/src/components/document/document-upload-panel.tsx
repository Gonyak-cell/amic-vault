'use client';

import * as React from 'react';
import Link from 'next/link';
import type {
  AddDocumentVersionResponseDto,
  UploadDocumentResponseDto,
  UploadDuplicateCandidateDto,
} from '@amic-vault/shared';
import { ExternalLink, FileSearch, FileUp, Loader2 } from 'lucide-react';
import { addDocumentVersion, createUploadPreflight, uploadDocument } from '@/lib/api-client';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import {
  isMatterUploadSourceMode,
  matterAppSourceMode,
  type MatterAppSourceMode,
  type MatterCodeOption,
} from '@/lib/matter-app';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/status-badge';
import {
  UploadMetadataProfile,
  defaultUploadMetadataProfile,
  uploadMetadataProfileFields,
} from './upload-metadata-profile';
import {
  DuplicateDecisionDialog,
  type DuplicateDecisionSelection,
} from './duplicate-decision-dialog';

export type DocumentUploadCompletionResult =
  | UploadDocumentResponseDto
  | AddDocumentVersionResponseDto;

export interface DocumentUploadPanelProps {
  onUploadComplete?: (result: DocumentUploadCompletionResult) => void;
  selectedMatter: MatterCodeOption | null;
  sourceMode?: MatterAppSourceMode;
}

type UploadQueueStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';

export interface UploadQueueRow {
  duplicateCount?: number;
  documentId?: string;
  fileName: string;
  message: string;
  status: UploadQueueStatus;
  title?: string;
}

interface DuplicateDecisionRequest {
  candidates: UploadDuplicateCandidateDto[];
  fileName: string;
  resolve: (selection: DuplicateDecisionSelection) => void;
}

const uploadQueueStatusLabels = {
  pending: '대기',
  uploading: '업로드 중',
  uploaded: '완료',
  failed: '실패',
} as const satisfies Record<UploadQueueStatus, string>;

const uploadQueueStatusTones = {
  pending: 'neutral',
  uploading: 'warning',
  uploaded: 'success',
  failed: 'blocked',
} as const satisfies Record<UploadQueueStatus, StatusBadgeTone>;

export function DocumentUploadPanel({
  onUploadComplete,
  selectedMatter,
  sourceMode,
}: DocumentUploadPanelProps) {
  const resolvedSourceMode = sourceMode ?? matterAppSourceMode();
  const uploadSourceReady = isMatterUploadSourceMode(resolvedSourceMode);
  const [files, setFiles] = React.useState<File[]>([]);
  const [title, setTitle] = React.useState('');
  const [metadataProfile, setMetadataProfile] = React.useState(defaultUploadMetadataProfile);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadQueue, setUploadQueue] = React.useState<UploadQueueRow[]>([]);
  const [duplicateDecisionRequest, setDuplicateDecisionRequest] =
    React.useState<DuplicateDecisionRequest | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const canUpload = Boolean(
    selectedMatter && files.length > 0 && uploadSourceReady && !isUploading,
  );

  const requestDuplicateDecision = React.useCallback(
    (fileName: string, candidates: UploadDuplicateCandidateDto[]) =>
      new Promise<DuplicateDecisionSelection>((resolve) => {
        setDuplicateDecisionRequest({ candidates, fileName, resolve });
      }),
    [],
  );

  function handleDuplicateDecision(selection: DuplicateDecisionSelection) {
    const request = duplicateDecisionRequest;
    if (!request) return;
    request.resolve(selection);
    setDuplicateDecisionRequest(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMatter || files.length === 0 || !uploadSourceReady) return;

    setIsUploading(true);
    setStatusMessage(null);
    setErrorMessage(null);
    setUploadQueue(
      files.map((selectedFile) => ({
        fileName: selectedFile.name,
        message: '대기 중',
        status: 'pending',
      })),
    );
    let successCount = 0;
    let failureCount = 0;
    const failedFiles: File[] = [];
    try {
      for (const [index, selectedFile] of files.entries()) {
        setUploadQueue((current) =>
          updateUploadQueue(current, index, { message: '중복 확인 중', status: 'uploading' }),
        );
        try {
          const sha256 = await sha256BrowserFile(selectedFile);
          const preflight = await createUploadPreflight(selectedMatter.matterReference, { sha256 });
          const duplicateSelection = preflight.duplicateDecisionRequired
            ? await requestDuplicateDecision(selectedFile.name, preflight.duplicateCandidates)
            : undefined;

          if (duplicateSelection?.decision === 'cancel') {
            failureCount += 1;
            failedFiles.push(selectedFile);
            setUploadQueue((current) =>
              updateUploadQueue(current, index, {
                message: '업로드가 취소되었습니다.',
                status: 'failed',
              }),
            );
            continue;
          }

          setUploadQueue((current) =>
            updateUploadQueue(current, index, { message: '업로드 중', status: 'uploading' }),
          );

          if (duplicateSelection?.decision === 'new_version') {
            const result = await addDocumentVersion(
              duplicateSelection.documentReference,
              selectedFile,
              { duplicateDecision: 'new_version' },
            );
            successCount += 1;
            setUploadQueue((current) =>
              updateUploadQueue(current, index, {
                documentId: result.documentId,
                duplicateCount: result.duplicates.length,
                message: versionUploadStatusMessage(result),
                status: 'uploaded',
                title: selectedFile.name,
              }),
            );
            onUploadComplete?.(result);
            continue;
          }

          const result = await uploadDocument(selectedMatter.matterReference, selectedFile, {
            ...uploadMetadataProfileFields(metadataProfile),
            uploadPreflightRef: preflight.preflightRef,
            ...(duplicateSelection?.decision === 'new_document'
              ? { duplicateDecision: 'new_document' }
              : {}),
            ...(files.length === 1 && title.trim() ? { title: title.trim() } : {}),
          });
          successCount += 1;
          setUploadQueue((current) =>
            updateUploadQueue(current, index, {
              documentId: result.documentId,
              duplicateCount: result.duplicates.length,
              message: uploadStatusMessage(result),
              status: 'uploaded',
              title: result.title,
            }),
          );
          onUploadComplete?.(result);
        } catch (error) {
          failureCount += 1;
          failedFiles.push(selectedFile);
          setUploadQueue((current) =>
            updateUploadQueue(current, index, {
              message: safeApiErrorMessage(error),
              status: 'failed',
            }),
          );
        }
      }
      setStatusMessage(bulkUploadStatusMessage(successCount, failureCount));
      if (successCount > 0) {
        setFiles(failedFiles);
        if (failedFiles.length === 0) setTitle('');
      }
      if (successCount === 0 && failureCount > 0) setErrorMessage('업로드된 파일이 없습니다.');
    } finally {
      setIsUploading(false);
    }
  }

  if (!selectedMatter) {
    return (
      <EmptyState
        variant="pre-search"
        title="Matter Code를 먼저 선택해 주세요."
        description="파일은 선택된 Matter Code의 권한 범위 안에서만 업로드할 수 있습니다."
      />
    );
  }

  if (!uploadSourceReady) {
    return (
      <EmptyState
        variant="policy-blocked"
        title="업로드 source 확인 필요"
        description="Matter app에서 업로드 가능한 Matter Code로 확인된 뒤 파일 업로드를 시작할 수 있습니다."
      />
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="rounded-md border bg-muted/30 px-3 py-2">
        <p className="text-sm font-semibold text-foreground">{selectedMatter.matterCode}</p>
        <p className="truncate text-xs text-muted-foreground">{selectedMatter.matterName}</p>
      </div>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-foreground">파일</span>
        <Input
          type="file"
          multiple
          onChange={(event) => setFiles(Array.from(event.currentTarget.files ?? []))}
        />
      </label>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-foreground">제목</span>
        <Input
          value={title}
          placeholder="단일 파일에서만 적용됩니다. 비워두면 파일명으로 저장됩니다."
          disabled={files.length > 1}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>

      <UploadMetadataProfile profile={metadataProfile} onChange={setMetadataProfile} />

      {files.length > 0 ? (
        <div className="rounded-md border bg-background">
          <div className="border-b px-3 py-2 text-sm font-semibold">
            선택된 파일 {files.length}개
          </div>
          <ul className="divide-y">
            {files.map((selectedFile, index) => (
              <li
                key={`${selectedFile.name}-${selectedFile.size}-${selectedFile.lastModified}-${index}`}
                className="px-3 py-2 text-sm"
              >
                {selectedFile.name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!canUpload}>
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileUp className="h-4 w-4" aria-hidden="true" />
          )}
          업로드
        </Button>
        {statusMessage ? (
          <p className="text-sm font-medium text-primary" role="status">
            {statusMessage}
          </p>
        ) : null}
        {errorMessage ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>

      {uploadQueue.length > 0 ? (
        <UploadQueueReceipt queue={uploadQueue} selectedMatter={selectedMatter} />
      ) : null}

      {duplicateDecisionRequest ? (
        <DuplicateDecisionDialog
          candidates={duplicateDecisionRequest.candidates}
          fileName={duplicateDecisionRequest.fileName}
          onSelect={handleDuplicateDecision}
        />
      ) : null}
    </form>
  );
}

export function UploadQueueReceipt({
  queue,
  selectedMatter,
}: {
  queue: UploadQueueRow[];
  selectedMatter: MatterCodeOption;
}) {
  return (
    <div className="rounded-md border bg-background">
      <div className="border-b px-3 py-2">
        <p className="text-sm font-semibold">업로드 큐</p>
        <p className="mt-1 text-xs text-muted-foreground">
          업로드된 문서는 문서 상세에서 프로필, 버전, 처리 상태를 이어서 확인할 수 있습니다.
        </p>
      </div>
      <ul className="divide-y">
        {queue.map((item, index) => (
          <li
            key={`${item.fileName}-${index}`}
            className="grid gap-2 px-3 py-3 text-sm lg:grid-cols-[minmax(0,1fr)_auto]"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 truncate font-medium">{item.title ?? item.fileName}</span>
                <StatusBadge tone={uploadQueueStatusTones[item.status]}>
                  {uploadQueueStatusLabels[item.status]}
                </StatusBadge>
              </div>
              <p
                className={
                  item.status === 'failed'
                    ? 'mt-1 text-sm text-destructive'
                    : 'mt-1 text-sm text-muted-foreground'
                }
              >
                {item.message}
              </p>
              {item.duplicateCount && item.duplicateCount > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  중복 후보 {item.duplicateCount}건이 감지되었습니다. 문서 상세에서 안전하게 확인해
                  주세요.
                </p>
              ) : null}
            </div>
            {item.documentId ? (
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/documents/${encodeURIComponent(item.documentId)}`}>
                    <ExternalLink className="h-4 w-4" />
                    문서 열기
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={allDocumentsVaultHref(item, selectedMatter)}>
                    <FileSearch className="h-4 w-4" />
                    전체 문서함
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={matterFileCabinetHref(selectedMatter)}>
                    <FileSearch className="h-4 w-4" />
                    Matter 문서함
                  </Link>
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function updateUploadQueue(
  queue: UploadQueueRow[],
  index: number,
  patch: Partial<UploadQueueRow> & Pick<UploadQueueRow, 'message' | 'status'>,
): UploadQueueRow[] {
  return queue.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
}

function matterFileCabinetHref(selectedMatter: MatterCodeOption): string {
  const params = new URLSearchParams();
  params.set('matterCode', selectedMatter.matterCode);
  return `/files?${params.toString()}`;
}

function allDocumentsVaultHref(item: UploadQueueRow, selectedMatter: MatterCodeOption): string {
  const params = new URLSearchParams();
  const title = item.title?.trim() || item.fileName.trim();
  if (title) params.set('title', title);
  if (selectedMatter.matterCode.trim()) params.set('matterCode', selectedMatter.matterCode.trim());
  const queryString = params.toString();
  return queryString ? `/files?${queryString}` : '/files';
}

export function uploadStatusMessage(result: UploadDocumentResponseDto): string {
  const duplicateMessage =
    result.duplicates.length > 0
      ? ` 중복 후보 ${result.duplicates.length}건이 감지되었습니다.`
      : '';
  return result.aiAllowed
    ? `${result.title} 업로드 완료. 파일 정리 준비가 자동으로 시작됩니다.${duplicateMessage}`
    : `${result.title} 업로드 완료. 파일 정리 준비는 제외되었습니다.${duplicateMessage}`;
}

export function versionUploadStatusMessage(result: AddDocumentVersionResponseDto): string {
  const duplicateMessage =
    result.duplicates.length > 0
      ? ` 중복 후보 ${result.duplicates.length}건이 감지되었습니다.`
      : '';
  return `v${result.versionNo} 새 버전 추가 완료.${duplicateMessage}`;
}

export function bulkUploadStatusMessage(successCount: number, failureCount: number): string {
  if (successCount > 0 && failureCount > 0) {
    return `${successCount}개 업로드 완료, ${failureCount}개 실패. 실패 항목을 확인해 주세요.`;
  }
  if (successCount > 0) return `${successCount}개 업로드 완료.`;
  return `${failureCount}개 업로드 실패. 실패 항목을 확인해 주세요.`;
}

async function sha256BrowserFile(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('SHA256_UNAVAILABLE');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
