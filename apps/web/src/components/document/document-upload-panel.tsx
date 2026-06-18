'use client';

import * as React from 'react';
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
  selectedMatter: MatterCodeOption | null;
  sourceMode?: MatterAppSourceMode;
}

export function DocumentUploadPanel({ selectedMatter, sourceMode }: DocumentUploadPanelProps) {
  const resolvedSourceMode = sourceMode ?? matterAppSourceMode();
  const uploadSourceReady = isMatterUploadSourceMode(resolvedSourceMode);
  const [file, setFile] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState('');
  const [isUploading, setIsUploading] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const canUpload = Boolean(selectedMatter && file && uploadSourceReady && !isUploading);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMatter || !file || !uploadSourceReady) return;

    setIsUploading(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const result = await uploadDocument(selectedMatter.matterReference, file, {
        ...(title.trim() ? { title: title.trim() } : {}),
      });
      setFile(null);
      setTitle('');
      setStatusMessage(`${result.title} 업로드 완료`);
    } catch (error) {
      setErrorMessage(safeApiErrorMessage(error));
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
          onChange={(event) => setFile(event.currentTarget.files?.item(0) ?? null)}
        />
      </label>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-foreground">제목</span>
        <Input
          value={title}
          placeholder="비워두면 파일명으로 저장됩니다."
          onChange={(event) => setTitle(event.target.value)}
        />
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
    </form>
  );
}
