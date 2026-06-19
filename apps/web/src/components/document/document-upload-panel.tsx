'use client';

import * as React from 'react';
import type { UploadDocumentResponseDto } from '@amic-vault/shared';
import { FileUp, Loader2 } from 'lucide-react';
import { uploadDocument } from '@/lib/api-client';
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

export interface DocumentUploadPanelProps {
  onUploadComplete?: (result: UploadDocumentResponseDto) => void;
  selectedMatter: MatterCodeOption | null;
  sourceMode?: MatterAppSourceMode;
}

type UploadQueueStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';

interface UploadQueueRow {
  fileName: string;
  message: string;
  status: UploadQueueStatus;
}

export function DocumentUploadPanel({
  onUploadComplete,
  selectedMatter,
  sourceMode,
}: DocumentUploadPanelProps) {
  const resolvedSourceMode = sourceMode ?? matterAppSourceMode();
  const uploadSourceReady = isMatterUploadSourceMode(resolvedSourceMode);
  const prepInputId = React.useId();
  const [files, setFiles] = React.useState<File[]>([]);
  const [title, setTitle] = React.useState('');
  const [prepEnabled, setPrepEnabled] = React.useState(true);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadQueue, setUploadQueue] = React.useState<UploadQueueRow[]>([]);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const canUpload = Boolean(selectedMatter && files.length > 0 && uploadSourceReady && !isUploading);

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
          updateUploadQueue(current, index, { message: '업로드 중', status: 'uploading' }),
        );
        try {
          const result = await uploadDocument(selectedMatter.matterReference, selectedFile, {
            aiAllowed: prepEnabled,
            ...(files.length === 1 && title.trim() ? { title: title.trim() } : {}),
          });
          successCount += 1;
          setUploadQueue((current) =>
            updateUploadQueue(current, index, {
              message: uploadStatusMessage(result),
              status: 'uploaded',
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

      <label
        htmlFor={prepInputId}
        className="flex min-h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium text-foreground"
      >
        <input
          id={prepInputId}
          type="checkbox"
          className="h-4 w-4 accent-primary"
          checked={prepEnabled}
          onChange={(event) => setPrepEnabled(event.currentTarget.checked)}
        />
        파일 정리 준비
      </label>

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
        <div className="rounded-md border bg-background">
          <div className="border-b px-3 py-2 text-sm font-semibold">업로드 큐</div>
          <ul className="divide-y">
            {uploadQueue.map((item, index) => (
              <li
                key={`${item.fileName}-${index}`}
                className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"
              >
                <span className="truncate font-medium">{item.fileName}</span>
                <span className={item.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>
                  {item.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}

function updateUploadQueue(
  queue: UploadQueueRow[],
  index: number,
  patch: Pick<UploadQueueRow, 'message' | 'status'>,
): UploadQueueRow[] {
  return queue.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
}

export function uploadStatusMessage(result: UploadDocumentResponseDto): string {
  return result.aiAllowed
    ? `${result.title} 업로드 완료. 파일 정리 준비가 자동으로 시작됩니다.`
    : `${result.title} 업로드 완료. 파일 정리 준비는 제외되었습니다.`;
}

export function bulkUploadStatusMessage(successCount: number, failureCount: number): string {
  if (successCount > 0 && failureCount > 0) {
    return `${successCount}개 업로드 완료, ${failureCount}개 실패. 실패 항목을 확인해 주세요.`;
  }
  if (successCount > 0) return `${successCount}개 업로드 완료.`;
  return `${failureCount}개 업로드 실패. 실패 항목을 확인해 주세요.`;
}
