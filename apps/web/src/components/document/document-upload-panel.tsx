'use client';

import * as React from 'react';
import Link from 'next/link';
import type {
  AddDocumentVersionResponseDto,
  BulkUploadBatchDto,
  BulkUploadBatchItemDto,
  EnterpriseApprovedDmsTaxonomyDto,
  QuarantinedIntakeResponseDto,
  UploadDocumentResponseDto,
  UploadDuplicateCandidateDto,
} from '@amic-vault/shared';
import { ExternalLink, FileSearch, FileUp, FolderUp, Loader2, RotateCw } from 'lucide-react';
import {
  addDocumentVersion,
  createUploadPreflight,
  getBulkUploadBatch,
  retryBulkUploadBatchItem,
  stageBulkUploadBatch,
  uploadDocument,
} from '@/lib/api-client';
import { listApprovedEnterpriseDmsTaxonomies } from '@/lib/api/enterprise';
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
  | QuarantinedIntakeResponseDto
  | AddDocumentVersionResponseDto;

export interface DocumentUploadPanelProps {
  onUploadComplete?: (result: DocumentUploadCompletionResult) => void;
  selectedMatter: MatterCodeOption | null;
  sourceMode?: MatterAppSourceMode;
}

type UploadQueueStatus =
  | 'pending'
  | 'uploading'
  | 'uploaded'
  | 'quarantined'
  | 'failed'
  | 'duplicate';

export interface UploadQueueRow {
  duplicateCount?: number;
  documentId?: string;
  fileName: string;
  message: string;
  sourceRelativePath?: string;
  status: UploadQueueStatus;
  title?: string;
}

interface DuplicateDecisionRequest {
  candidates: UploadDuplicateCandidateDto[];
  fileName: string;
  resolve: (selection: DuplicateDecisionSelection) => void;
}

export interface UploadFileEntry {
  file: File;
  sourceRelativePath?: string;
}

type FileWithWebkitRelativePath = File & { webkitRelativePath?: string };

interface BrowserFileSystemEntry {
  isDirectory: boolean;
  isFile: boolean;
  name: string;
}

interface BrowserFileSystemFileEntry extends BrowserFileSystemEntry {
  file(successCallback: (file: File) => void, errorCallback?: (error: DOMException) => void): void;
}

interface BrowserFileSystemDirectoryEntry extends BrowserFileSystemEntry {
  createReader(): BrowserFileSystemDirectoryReader;
}

interface BrowserFileSystemDirectoryReader {
  readEntries(
    successCallback: (entries: BrowserFileSystemEntry[]) => void,
    errorCallback?: (error: DOMException) => void,
  ): void;
}

interface WebkitEntryGetter {
  webkitGetAsEntry?: () => BrowserFileSystemEntry | null;
}

const uploadQueueStatusLabels = {
  pending: '대기',
  uploading: '업로드 중',
  uploaded: '완료',
  quarantined: '검사 대기',
  failed: '실패',
  duplicate: '중복 확인',
} as const satisfies Record<UploadQueueStatus, string>;

const uploadQueueStatusTones = {
  pending: 'neutral',
  uploading: 'warning',
  uploaded: 'success',
  quarantined: 'warning',
  failed: 'blocked',
  duplicate: 'warning',
} as const satisfies Record<UploadQueueStatus, StatusBadgeTone>;

export function DocumentUploadPanel({
  onUploadComplete,
  selectedMatter,
  sourceMode,
}: DocumentUploadPanelProps) {
  const resolvedSourceMode = sourceMode ?? matterAppSourceMode();
  const uploadSourceReady = isMatterUploadSourceMode(resolvedSourceMode);
  const [fileEntries, setFileEntries] = React.useState<UploadFileEntry[]>([]);
  const [title, setTitle] = React.useState('');
  const [tagInput, setTagInput] = React.useState('');
  const [metadataProfile, setMetadataProfile] = React.useState(defaultUploadMetadataProfile);
  const [taxonomyCatalog, setTaxonomyCatalog] = React.useState<EnterpriseApprovedDmsTaxonomyDto[]>(
    [],
  );
  const [isUploading, setIsUploading] = React.useState(false);
  const [isDragActive, setIsDragActive] = React.useState(false);
  const [batchActionPending, setBatchActionPending] = React.useState(false);
  const [activeBatch, setActiveBatch] = React.useState<BulkUploadBatchDto | null>(null);
  const [uploadQueue, setUploadQueue] = React.useState<UploadQueueRow[]>([]);
  const [duplicateDecisionRequest, setDuplicateDecisionRequest] =
    React.useState<DuplicateDecisionRequest | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const files = React.useMemo(() => fileEntries.map((entry) => entry.file), [fileEntries]);
  const canUpload = Boolean(
    selectedMatter &&
    fileEntries.length > 0 &&
    uploadSourceReady &&
    !isUploading &&
    !batchActionPending,
  );

  const requestDuplicateDecision = React.useCallback(
    (fileName: string, candidates: UploadDuplicateCandidateDto[]) =>
      new Promise<DuplicateDecisionSelection>((resolve) => {
        setDuplicateDecisionRequest({ candidates, fileName, resolve });
      }),
    [],
  );

  React.useEffect(() => {
    if (!selectedMatter || !uploadSourceReady) {
      setTaxonomyCatalog([]);
      return;
    }
    let active = true;
    listApprovedEnterpriseDmsTaxonomies()
      .then((catalog) => {
        if (active) setTaxonomyCatalog(catalog.taxonomies);
      })
      .catch(() => {
        if (active) setTaxonomyCatalog([]);
      });
    return () => {
      active = false;
    };
  }, [selectedMatter, uploadSourceReady]);

  function handleDuplicateDecision(selection: DuplicateDecisionSelection) {
    const request = duplicateDecisionRequest;
    if (!request) return;
    request.resolve(selection);
    setDuplicateDecisionRequest(null);
  }

  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    setFileEntries(uploadFileEntriesFromFileList(event.currentTarget.files));
  }

  async function handleDrop(event: React.DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsDragActive(false);
    const droppedEntries = await uploadFileEntriesFromDataTransfer(event.dataTransfer);
    setFileEntries(droppedEntries);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMatter || fileEntries.length === 0 || !uploadSourceReady) return;

    setIsUploading(true);
    setStatusMessage(null);
    setErrorMessage(null);
    setActiveBatch(null);
    setUploadQueue(
      fileEntries.map((entry) => ({
        fileName: entry.file.name,
        message: '대기 중',
        ...(entry.sourceRelativePath ? { sourceRelativePath: entry.sourceRelativePath } : {}),
        status: 'pending',
      })),
    );
    try {
      if (shouldUseBatchUpload(files)) {
        await submitBatchUpload(fileEntries);
        return;
      }

      let successCount = 0;
      let quarantinedCount = 0;
      let failureCount = 0;
      const failedEntries: UploadFileEntry[] = [];
      const uploadTags = parseUploadTags(tagInput);
      for (const [index, entry] of fileEntries.entries()) {
        const selectedFile = entry.file;
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
            failedEntries.push(entry);
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
            ...(entry.sourceRelativePath ? { sourceRelativePath: entry.sourceRelativePath } : {}),
            ...(uploadTags.length > 0 ? { tags: uploadTags } : {}),
            ...(duplicateSelection?.decision === 'new_document'
              ? { duplicateDecision: 'new_document' }
              : {}),
            ...(fileEntries.length === 1 && title.trim() ? { title: title.trim() } : {}),
          });
          if (isQuarantinedIntakeResponse(result)) {
            quarantinedCount += 1;
            setUploadQueue((current) =>
              updateUploadQueue(current, index, {
                message: quarantinedIntakeStatusMessage(),
                status: 'quarantined',
                title: selectedFile.name,
              }),
            );
            onUploadComplete?.(result);
            continue;
          }
          const uploadedPath = result.folderPath ?? entry.sourceRelativePath;
          successCount += 1;
          setUploadQueue((current) =>
            updateUploadQueue(current, index, {
              documentId: result.documentId,
              duplicateCount: result.duplicates.length,
              message: uploadStatusMessage(result),
              ...(uploadedPath ? { sourceRelativePath: uploadedPath } : {}),
              status: 'uploaded',
              title: result.title,
            }),
          );
          onUploadComplete?.(result);
        } catch (error) {
          failureCount += 1;
          failedEntries.push(entry);
          setUploadQueue((current) =>
            updateUploadQueue(current, index, {
              message: safeApiErrorMessage(error),
              status: 'failed',
            }),
          );
        }
      }
      setStatusMessage(bulkUploadStatusMessage(successCount, failureCount, quarantinedCount));
      if (successCount + quarantinedCount > 0) {
        setFileEntries(failedEntries);
        if (failedEntries.length === 0) setTitle('');
      }
      if (successCount + quarantinedCount === 0 && failureCount > 0) {
        setErrorMessage('업로드된 파일이 없습니다.');
      }
    } finally {
      setIsUploading(false);
    }
  }

  async function submitBatchUpload(selectedEntries: UploadFileEntry[]) {
    if (!selectedMatter) return;
    setStatusMessage('배치 업로드 세션을 준비하고 있습니다.');
    const selectedFiles = selectedEntries.map((entry) => entry.file);
    const batch = await stageBulkUploadBatch(
      selectedMatter.matterReference,
      selectedFiles,
      {
        ...uploadMetadataProfileFields(metadataProfile),
        ...(parseUploadTags(tagInput).length > 0 ? { tags: parseUploadTags(tagInput) } : {}),
        ...(selectedEntries.length === 1 && title.trim() ? { title: title.trim() } : {}),
      },
      {
        sourceRelativePaths: selectedEntries.map(
          (entry) => entry.sourceRelativePath ?? entry.file.name,
        ),
      },
    );
    setActiveBatch(batch);
    setUploadQueue(batchToUploadQueue(batch));
    const completed = await pollBulkUploadBatch(
      selectedMatter.matterReference,
      batch.batchId,
      (next) => {
        setActiveBatch(next);
        setUploadQueue(batchToUploadQueue(next));
      },
    );
    setActiveBatch(completed);
    setUploadQueue(batchToUploadQueue(completed));
    setStatusMessage(batchUploadStatusMessage(completed));
    if (
      acceptedBatchItems(completed) > 0 &&
      completed.failedItems === 0 &&
      completed.duplicateItems === 0
    ) {
      setFileEntries([]);
      setTitle('');
    }
    if (
      acceptedBatchItems(completed) === 0 &&
      completed.failedItems + completed.duplicateItems > 0
    ) {
      setErrorMessage('업로드 완료 항목이 없습니다.');
    }
  }

  async function retryBatchItems(kind: 'failed' | 'duplicate') {
    if (!selectedMatter || !activeBatch) return;
    const targets = activeBatch.items.filter((item) => item.status === kind);
    if (targets.length === 0) return;
    setBatchActionPending(true);
    setIsUploading(true);
    setErrorMessage(null);
    setStatusMessage(
      kind === 'duplicate'
        ? '중복 항목을 새 문서로 등록하고 있습니다.'
        : '실패 항목을 다시 요청하고 있습니다.',
    );
    try {
      let latest = activeBatch;
      for (const item of targets) {
        latest = await retryBulkUploadBatchItem(
          selectedMatter.matterReference,
          activeBatch.batchId,
          item.itemId,
          kind === 'duplicate'
            ? {
                fields: {
                  ...uploadMetadataProfileFields(metadataProfile),
                  duplicateDecision: 'new_document',
                },
              }
            : {},
        );
      }
      setActiveBatch(latest);
      setUploadQueue(batchToUploadQueue(latest));
      const completed = await pollBulkUploadBatch(
        selectedMatter.matterReference,
        latest.batchId,
        (next) => {
          setActiveBatch(next);
          setUploadQueue(batchToUploadQueue(next));
        },
      );
      setActiveBatch(completed);
      setUploadQueue(batchToUploadQueue(completed));
      setStatusMessage(batchUploadStatusMessage(completed));
      if (
        acceptedBatchItems(completed) > 0 &&
        completed.failedItems === 0 &&
        completed.duplicateItems === 0
      ) {
        setFileEntries([]);
        setTitle('');
      }
    } catch (error) {
      setErrorMessage(safeApiErrorMessage(error));
    } finally {
      setBatchActionPending(false);
      setIsUploading(false);
    }
  }

  if (!selectedMatter) {
    return (
      <EmptyState
        variant="pre-search"
        title="Matter 코드를 먼저 선택해 주세요."
        description="파일은 선택한 Matter 코드의 권한 범위 안에서만 업로드할 수 있습니다."
      />
    );
  }

  if (!uploadSourceReady) {
    return (
      <EmptyState
        variant="policy-blocked"
        title="업로드 가능 여부 확인 필요"
        description="Matter 관리 시스템에서 업로드 가능한 Matter 코드로 확인된 뒤 파일 업로드를 시작할 수 있습니다."
      />
    );
  }

  const folderInputProps: React.InputHTMLAttributes<HTMLInputElement> & {
    directory: string;
    webkitdirectory: string;
  } = {
    directory: '',
    multiple: true,
    onChange: handleFileInputChange,
    type: 'file',
    webkitdirectory: '',
  };

  return (
    <form
      className="space-y-4"
      onDragLeave={() => setIsDragActive(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragActive(true);
      }}
      onDrop={(event) => {
        void handleDrop(event);
      }}
      onSubmit={handleSubmit}
    >
      <div className="rounded-md border bg-muted/30 px-3 py-2">
        <p className="text-sm font-semibold text-foreground">{selectedMatter.matterCode}</p>
        <p className="truncate text-xs text-muted-foreground">{selectedMatter.matterName}</p>
      </div>

      <div
        className={`grid gap-3 rounded-md border border-dashed p-3 ${
          isDragActive ? 'border-primary bg-primary/5' : 'bg-background'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <FolderUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground">파일 및 폴더</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-foreground">파일</span>
            <Input type="file" multiple onChange={handleFileInputChange} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-foreground">폴더</span>
            <Input {...folderInputProps} />
          </label>
        </div>
      </div>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-foreground">제목</span>
        <Input
          value={title}
          placeholder="단일 파일에서만 적용됩니다. 비워두면 파일명으로 저장됩니다."
          disabled={files.length > 1}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-foreground">태그</span>
        <Input
          value={tagInput}
          placeholder="쉼표로 구분"
          onChange={(event) => setTagInput(event.target.value)}
        />
      </label>

      <UploadMetadataProfile
        profile={metadataProfile}
        onChange={setMetadataProfile}
        taxonomyCatalog={taxonomyCatalog}
      />

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
                {uploadFileEntryLabel(fileEntries[index])}
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

      {activeBatch ? (
        <BatchUploadControls
          batch={activeBatch}
          disabled={isUploading || batchActionPending}
          onRetryDuplicates={() => retryBatchItems('duplicate')}
          onRetryFailed={() => retryBatchItems('failed')}
        />
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

function BatchUploadControls({
  batch,
  disabled,
  onRetryDuplicates,
  onRetryFailed,
}: {
  batch: BulkUploadBatchDto;
  disabled?: boolean;
  onRetryDuplicates: () => void;
  onRetryFailed: () => void;
}) {
  if (batch.failedItems === 0 && batch.duplicateItems === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2">
      {batch.failedItems > 0 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={onRetryFailed}
        >
          <RotateCw className="h-4 w-4" aria-hidden="true" />
          실패 항목 재시도
        </Button>
      ) : null}
      {batch.duplicateItems > 0 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={onRetryDuplicates}
        >
          <RotateCw className="h-4 w-4" aria-hidden="true" />
          중복 항목 새 문서로 등록
        </Button>
      ) : null}
    </div>
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
      <div className="flex min-w-0 items-baseline gap-x-2 overflow-hidden border-b px-3 py-2">
        <p className="shrink-0 text-sm font-semibold">업로드 진행 상태</p>
        <p className="min-w-0 truncate whitespace-nowrap text-xs text-muted-foreground">
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
              {item.sourceRelativePath ? (
                <p className="mt-1 text-xs text-muted-foreground">폴더 {item.sourceRelativePath}</p>
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

function shouldUseBatchUpload(files: readonly File[]): boolean {
  return files.length > 1 || files.some((file) => file.name.toLowerCase().endsWith('.zip'));
}

export function normalizeUploadSourceRelativePath(value: string | undefined): string | undefined {
  const normalized = (value ?? '')
    .replaceAll('\\', '/')
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== '.' && part !== '..')
    .join('/');
  return normalized.length > 0 ? normalized : undefined;
}

export function parseUploadTags(value: string): string[] {
  const seen = new Set<string>();
  for (const tag of value
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)) {
    seen.add(tag);
  }
  return [...seen].slice(0, 50);
}

export function uploadFileEntriesFromFiles(files: readonly File[]): UploadFileEntry[] {
  return files.map((file) => {
    const sourceRelativePath = normalizeUploadSourceRelativePath(
      (file as FileWithWebkitRelativePath).webkitRelativePath,
    );
    return sourceRelativePath ? { file, sourceRelativePath } : { file };
  });
}

function uploadFileEntriesFromFileList(fileList: FileList | null): UploadFileEntry[] {
  return uploadFileEntriesFromFiles(Array.from(fileList ?? []));
}

async function uploadFileEntriesFromDataTransfer(
  dataTransfer: DataTransfer,
): Promise<UploadFileEntry[]> {
  const entries = await Promise.all(
    Array.from(dataTransfer.items)
      .map((item) => {
        const itemWithEntry = item as unknown as WebkitEntryGetter;
        return itemWithEntry.webkitGetAsEntry?.() ?? null;
      })
      .filter((entry): entry is BrowserFileSystemEntry => entry !== null)
      .map((entry) => uploadFileEntriesFromFileSystemEntry(entry)),
  );
  const flattened = entries.flat();
  return flattened.length > 0 ? flattened : uploadFileEntriesFromFileList(dataTransfer.files);
}

async function uploadFileEntriesFromFileSystemEntry(
  entry: BrowserFileSystemEntry,
  parentPath = '',
): Promise<UploadFileEntry[]> {
  const sourcePath = normalizeUploadSourceRelativePath(
    parentPath ? `${parentPath}/${entry.name}` : entry.name,
  );
  if (!sourcePath) return [];
  if (entry.isFile) {
    const file = await readFileSystemFile(entry as BrowserFileSystemFileEntry);
    return [{ file, sourceRelativePath: sourcePath }];
  }
  if (!entry.isDirectory) return [];
  const children = await readAllDirectoryEntries(entry as BrowserFileSystemDirectoryEntry);
  const nested = await Promise.all(
    children.map((child) => uploadFileEntriesFromFileSystemEntry(child, sourcePath)),
  );
  return nested.flat();
}

function readFileSystemFile(entry: BrowserFileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

async function readAllDirectoryEntries(
  entry: BrowserFileSystemDirectoryEntry,
): Promise<BrowserFileSystemEntry[]> {
  const reader = entry.createReader();
  const entries: BrowserFileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<BrowserFileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) return entries;
    entries.push(...batch);
  }
}

function uploadFileEntryLabel(entry: UploadFileEntry | undefined): string {
  if (!entry) return '';
  return entry.sourceRelativePath ?? entry.file.name;
}

function batchToUploadQueue(batch: BulkUploadBatchDto): UploadQueueRow[] {
  return batch.items.map(batchItemToUploadQueueRow);
}

function batchItemToUploadQueueRow(item: BulkUploadBatchItemDto): UploadQueueRow {
  const row: UploadQueueRow = {
    fileName: item.originalFilename,
    message: batchItemStatusMessage(item),
    status: batchItemUploadStatus(item),
    title: item.originalFilename,
  };
  if (item.documentId) row.documentId = item.documentId;
  return row;
}

function batchItemUploadStatus(item: BulkUploadBatchItemDto): UploadQueueStatus {
  if (item.status === 'done') return 'uploaded';
  if (item.status === 'quarantined') return 'quarantined';
  if (item.status === 'duplicate') return 'duplicate';
  if (item.status === 'failed') return 'failed';
  if (item.status === 'uploaded') return 'uploading';
  return 'pending';
}

function batchItemStatusMessage(item: BulkUploadBatchItemDto): string {
  if (item.status === 'done') return '배치 업로드 완료.';
  if (item.status === 'quarantined') return '보안 검사가 완료될 때까지 문서함에 표시되지 않습니다.';
  if (item.status === 'duplicate') return item.errorReason ?? '중복 결정이 필요합니다.';
  if (item.status === 'failed')
    return item.errorReason ?? item.errorCode ?? '업로드에 실패했습니다.';
  if (item.status === 'uploaded') return '서버 배치에서 처리 중입니다.';
  return '배치 대기 중입니다.';
}

async function pollBulkUploadBatch(
  matterReference: string,
  batchId: string,
  onUpdate: (batch: BulkUploadBatchDto) => void,
): Promise<BulkUploadBatchDto> {
  let latest = await getBulkUploadBatch(matterReference, batchId);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    onUpdate(latest);
    if (latest.pendingItems === 0 && latest.uploadedItems === 0) return latest;
    await delay(500);
    latest = await getBulkUploadBatch(matterReference, batchId);
  }
  return latest;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
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

export function isQuarantinedIntakeResponse(
  result: UploadDocumentResponseDto | QuarantinedIntakeResponseDto,
): result is QuarantinedIntakeResponseDto {
  return result.status === 'quarantined';
}

export function quarantinedIntakeStatusMessage(): string {
  return '보안 검사가 완료될 때까지 문서함에 표시되지 않습니다.';
}

export function versionUploadStatusMessage(result: AddDocumentVersionResponseDto): string {
  const duplicateMessage =
    result.duplicates.length > 0
      ? ` 중복 후보 ${result.duplicates.length}건이 감지되었습니다.`
      : '';
  return `v${result.versionNo} 새 버전 추가 완료.${duplicateMessage}`;
}

export function bulkUploadStatusMessage(
  successCount: number,
  failureCount: number,
  quarantinedCount = 0,
): string {
  if (quarantinedCount > 0 && successCount === 0 && failureCount === 0) {
    return `${quarantinedCount}개 보안 검사 대기 중입니다.`;
  }
  if (quarantinedCount > 0 && failureCount === 0) {
    return `${successCount}개 업로드 완료, ${quarantinedCount}개 보안 검사 대기 중입니다.`;
  }
  if (quarantinedCount > 0) {
    return `${successCount}개 업로드 완료, ${quarantinedCount}개 보안 검사 대기, ${failureCount}개 실패. 실패 항목을 확인해 주세요.`;
  }
  if (successCount > 0 && failureCount > 0) {
    return `${successCount}개 업로드 완료, ${failureCount}개 실패. 실패 항목을 확인해 주세요.`;
  }
  if (successCount > 0) return `${successCount}개 업로드 완료.`;
  return `${failureCount}개 업로드 실패. 실패 항목을 확인해 주세요.`;
}

export function batchUploadStatusMessage(batch: BulkUploadBatchDto): string {
  const quarantinedItems = batch.items.filter((item) => item.status === 'quarantined').length;
  if (
    quarantinedItems > 0 &&
    batch.doneItems === 0 &&
    batch.failedItems + batch.duplicateItems === 0
  ) {
    return `${quarantinedItems}개 보안 검사 대기 중입니다.`;
  }
  if (quarantinedItems > 0 && batch.failedItems + batch.duplicateItems === 0) {
    return `${batch.doneItems}개 배치 업로드 완료, ${quarantinedItems}개 보안 검사 대기 중입니다.`;
  }
  if (batch.doneItems > 0 && batch.failedItems + batch.duplicateItems > 0) {
    return `${batch.doneItems}개 완료, ${batch.failedItems}개 실패, ${batch.duplicateItems}개 중복 확인 필요.`;
  }
  if (batch.doneItems > 0) return `${batch.doneItems}개 배치 업로드 완료.`;
  if (batch.duplicateItems > 0) return `${batch.duplicateItems}개 중복 확인이 필요합니다.`;
  return `${batch.failedItems}개 배치 업로드 실패.`;
}

function acceptedBatchItems(batch: BulkUploadBatchDto): number {
  return batch.doneItems + batch.items.filter((item) => item.status === 'quarantined').length;
}

async function sha256BrowserFile(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('SHA256_UNAVAILABLE');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
