'use client';

import * as React from 'react';
import type {
  EmailMatterFilingDto,
  EmailMatterSuggestionDto,
  UploadEmailToMatterResponseDto,
} from '@amic-vault/shared';
import { Loader2, MailPlus } from 'lucide-react';
import {
  ApiClientError,
  fileEmailToMatter,
  getEmailMatterSuggestions,
  undoEmailAutofile,
  uploadRawEmailToMatter,
} from '@/lib/api-client';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { EmailUploadReceipt, type EmailUploadMatter } from './email-upload-receipt';

export const emailUploadAccept = '.eml,.msg,message/rfc822,application/vnd.ms-outlook';

export type { EmailUploadMatter } from './email-upload-receipt';

export interface EmailUploadCardProps {
  matter: EmailUploadMatter | null;
  onFiled?: (filing: EmailMatterFilingDto) => void;
  tenantDomains?: readonly string[];
  uploadEnabled?: boolean;
}

export function EmailUploadCard({
  matter,
  onFiled,
  tenantDomains = [],
  uploadEnabled = true,
}: EmailUploadCardProps) {
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [uploadResult, setUploadResult] = React.useState<UploadEmailToMatterResponseDto | null>(null);
  const [suggestions, setSuggestions] = React.useState<EmailMatterSuggestionDto[]>([]);
  const [selectedMatterId, setSelectedMatterId] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isFiling, setIsFiling] = React.useState(false);
  const [undoBusyMatterId, setUndoBusyMatterId] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const canUpload = Boolean(matter && selectedFile && uploadEnabled && !isUploading && !isFiling);

  function setFileFromList(fileList: FileList | null) {
    const file = firstSupportedEmailFile(fileList);
    setSelectedFile(file);
    setUploadResult(null);
    setSuggestions([]);
    setSelectedMatterId(matter?.matterId ?? null);
    setStatusMessage(null);
    setErrorMessage(fileList && !file ? 'EML 또는 MSG 파일만 업로드할 수 있습니다.' : null);
  }

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!matter || !selectedFile || !uploadEnabled) return;

    setIsUploading(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const result = await uploadRawEmailToMatter(matter.matterId, selectedFile, {
        ...(tenantDomains.length > 0 ? { tenantDomains: [...tenantDomains] } : {}),
      });
      setUploadResult(result);
      setSelectedMatterId(matter.matterId);
      setStatusMessage(`${selectedFile.name} 업로드 완료`);
      const matterSuggestions = await getEmailMatterSuggestions(result.email.emailId, { limit: 5 });
      setSuggestions([...matterSuggestions.items]);
    } catch (error) {
      setUploadResult(null);
      setSuggestions([]);
      setErrorMessage(emailUploadErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  }

  async function handleConfirmFiling() {
    if (!uploadResult || !selectedMatterId) return;

    setIsFiling(true);
    setErrorMessage(null);
    try {
      const filing = await fileEmailToMatter(uploadResult.email.emailId, { matterId: selectedMatterId });
      setStatusMessage('이메일 파일링 완료');
      if (filing.matterId === matter?.matterId) onFiled?.(filing);
    } catch (error) {
      setErrorMessage(safeApiErrorMessage(error));
    } finally {
      setIsFiling(false);
    }
  }

  async function handleUndoAutofile(matterId: string) {
    if (!uploadResult) return;
    setUndoBusyMatterId(matterId);
    setErrorMessage(null);
    try {
      await undoEmailAutofile(uploadResult.email.emailId, { matterId });
      setStatusMessage('자동 저장을 되돌렸습니다');
      setSuggestions((items) =>
        items.map((item) =>
          item.matterId === matterId ? { ...item, confidenceBand: 'confirm' } : item,
        ),
      );
    } catch (error) {
      setErrorMessage(safeApiErrorMessage(error));
    } finally {
      setUndoBusyMatterId(null);
    }
  }

  if (!matter) {
    return (
      <EmptyState
        variant="pre-search"
        title="Matter code를 먼저 선택해 주세요."
        description="이메일은 선택한 Matter 권한 범위 안에서만 보관할 수 있습니다."
      />
    );
  }

  if (!uploadEnabled) {
    return (
      <EmptyState
        variant="policy-blocked"
        title="이메일 업로드 가능 여부 확인 필요"
        description="Matter 관리 시스템에서 업로드 가능한 Matter code로 확인된 뒤 이메일을 보관할 수 있습니다."
      />
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleUpload}>
      <div className="rounded-md border bg-muted/30 px-3 py-2">
        <p className="text-sm font-semibold text-foreground">{matter.matterCode}</p>
        <p className="truncate text-xs text-muted-foreground">{matter.matterName}</p>
      </div>

      <label
        className="grid gap-2 rounded-md border border-dashed bg-background px-3 py-4"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          setFileFromList(event.dataTransfer.files);
        }}
      >
        <span className="text-sm font-medium text-foreground">이메일 파일</span>
        <Input
          accept={emailUploadAccept}
          type="file"
          onChange={(event) => setFileFromList(event.currentTarget.files)}
        />
        <span className="text-xs text-muted-foreground">EML, MSG</span>
      </label>

      {selectedFile ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
          <MailPlus className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="min-w-0 truncate font-medium">{selectedFile.name}</span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!canUpload}>
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <MailPlus className="h-4 w-4" aria-hidden="true" />
          )}
          이메일 업로드
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

      {uploadResult ? (
        <EmailUploadReceipt
          busy={isFiling}
          currentMatter={matter}
          onConfirm={handleConfirmFiling}
          onSelectMatter={setSelectedMatterId}
          onUndoAutofile={handleUndoAutofile}
          selectedMatterId={selectedMatterId ?? matter.matterId}
          suggestions={suggestions}
          undoBusyMatterId={undoBusyMatterId}
          uploadResult={uploadResult}
        />
      ) : null}
    </form>
  );
}

export function emailUploadErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError && error.code === 'VALIDATION_FAILED') {
    return '이미 보관된 이메일일 수 있습니다. 보관된 이메일 타임라인에서 기존 항목을 확인해 주세요.';
  }
  return safeApiErrorMessage(error);
}

function firstSupportedEmailFile(fileList: FileList | null): File | null {
  const files = Array.from(fileList ?? []);
  return files.find((file) => isSupportedEmailFile(file)) ?? null;
}

function isSupportedEmailFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.eml') || name.endsWith('.msg');
}
