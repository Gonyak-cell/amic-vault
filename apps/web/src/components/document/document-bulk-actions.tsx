'use client';

import * as React from 'react';
import { CheckCircle2, Loader2, RotateCcw, X } from 'lucide-react';
import type {
  DocumentBulkActionBatchDto,
  DocumentBulkActionDto,
  DocumentDto,
  DocumentFolderDto,
} from '@amic-vault/shared';
import {
  createDocumentBulkActionBatch,
  getDocumentBulkActionBatch,
  listDocumentFolders,
  retryDocumentBulkActionBatch,
} from '@/lib/api-client';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import {
  documentStatusLabels,
  documentStatusTransitionTargets,
} from '@/lib/document-status-transitions';
import { Button } from '@/components/ui/button';

type BulkActionKind = DocumentBulkActionDto['kind'];
type BulkTransitionStatus = Extract<DocumentBulkActionDto, { kind: 'transition_status' }>['status'];

export interface DocumentBulkActionsProps {
  documents: readonly DocumentDto[];
  onClear: () => void;
  onCompleted: () => void;
}

const terminalStatuses = new Set(['completed', 'partial', 'failed']);
const bulkSelectClassName =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

export function commonBulkStatusTargets(
  documents: readonly DocumentDto[],
): readonly BulkTransitionStatus[] {
  if (documents.length === 0) return [];
  const [first, ...rest] = documents;
  if (!first) return [];
  return documentStatusTransitionTargets(first)
    .filter(
      (status): status is BulkTransitionStatus =>
        status !== 'deleted' && status !== 'disposal_locked',
    )
    .filter((status) =>
      rest.every((document) => documentStatusTransitionTargets(document).includes(status)),
    );
}

function sameMatterId(documents: readonly DocumentDto[]): string | null {
  const matterId = documents[0]?.matterId;
  return matterId && documents.every((document) => document.matterId === matterId)
    ? matterId
    : null;
}

function actionLabel(action: DocumentBulkActionDto): string {
  if (action.kind === 'move_folder') return '폴더 이동';
  if (action.kind === 'add_tag') return '태그 추가';
  if (action.kind === 'remove_tag') return '태그 제거';
  return `상태 변경 · ${documentStatusLabels[action.status]}`;
}

function itemErrorLabel(code: string | null): string {
  if (code === 'PERMISSION_DENIED' || code === 'ETHICAL_WALL_BLOCKED') {
    return '접근 권한을 확인할 수 없습니다.';
  }
  if (code === 'DOCUMENT_LOCKED') return '보존 또는 잠금 상태로 변경할 수 없습니다.';
  return '현재 상태에서 변경할 수 없습니다.';
}

export function DocumentBulkActions({ documents, onClear, onCompleted }: DocumentBulkActionsProps) {
  const [kind, setKind] = React.useState<BulkActionKind>('add_tag');
  const [tag, setTag] = React.useState('');
  const [folderId, setFolderId] = React.useState('');
  const [status, setStatus] = React.useState<BulkTransitionStatus | ''>('');
  const [folders, setFolders] = React.useState<DocumentFolderDto[]>([]);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [receipt, setReceipt] = React.useState<DocumentBulkActionBatchDto | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const completionNotifiedRef = React.useRef<string | null>(null);
  const confirmTriggerRef = React.useRef<HTMLButtonElement>(null);
  const confirmCancelRef = React.useRef<HTMLButtonElement>(null);
  const confirmDialogRef = React.useRef<HTMLDivElement>(null);
  const matterId = sameMatterId(documents);
  const statusTargets = commonBulkStatusTargets(documents);

  React.useEffect(() => {
    if (kind !== 'move_folder' || !matterId) {
      setFolders([]);
      setFolderId('');
      return;
    }
    let active = true;
    listDocumentFolders(matterId)
      .then((items) => {
        if (active) setFolders(items);
      })
      .catch(() => {
        if (active) setFolders([]);
      });
    return () => {
      active = false;
    };
  }, [kind, matterId]);

  React.useEffect(() => {
    if (!confirmOpen) return;
    confirmCancelRef.current?.focus();
    const handleDialogKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConfirmOpen(false);
        window.requestAnimationFrame(() => confirmTriggerRef.current?.focus());
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = [
        ...(confirmDialogRef.current?.querySelectorAll<HTMLButtonElement>(
          'button:not([disabled])',
        ) ?? []),
      ];
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleDialogKeyboard);
    return () => window.removeEventListener('keydown', handleDialogKeyboard);
  }, [confirmOpen]);

  React.useEffect(() => {
    if (!receipt || terminalStatuses.has(receipt.status)) {
      if (
        receipt &&
        receipt.succeededCount > 0 &&
        completionNotifiedRef.current !== receipt.batchId
      ) {
        completionNotifiedRef.current = receipt.batchId;
        onCompleted();
      }
      return;
    }
    const timer = window.setTimeout(() => {
      void getDocumentBulkActionBatch(receipt.batchId)
        .then(setReceipt)
        .catch((error) => setErrorMessage(safeApiErrorMessage(error)));
    }, 800);
    return () => window.clearTimeout(timer);
  }, [onCompleted, receipt]);

  React.useEffect(() => {
    if (status && !statusTargets.includes(status)) setStatus('');
  }, [status, statusTargets]);

  function selectedAction(): DocumentBulkActionDto | null {
    if (kind === 'move_folder') {
      return matterId && folderId ? { kind, folderId } : null;
    }
    if (kind === 'add_tag' || kind === 'remove_tag') {
      const normalized = tag.trim();
      return normalized ? { kind, tag: normalized } : null;
    }
    return status ? { kind, status } : null;
  }

  async function submit() {
    const action = selectedAction();
    if (!action || pending) return;
    setPending(true);
    setErrorMessage(null);
    try {
      const nextReceipt = await createDocumentBulkActionBatch({
        idempotencyKey: crypto.randomUUID(),
        documentIds: documents.map((document) => document.documentId),
        action,
      });
      setReceipt(nextReceipt);
      setConfirmOpen(false);
    } catch (error) {
      setErrorMessage(safeApiErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function retryFailed() {
    if (!receipt || pending) return;
    setPending(true);
    setErrorMessage(null);
    try {
      setReceipt(await retryDocumentBulkActionBatch(receipt.batchId, {}));
    } catch (error) {
      setErrorMessage(safeApiErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  const action = selectedAction();
  const running = receipt && (receipt.status === 'queued' || receipt.status === 'running');
  const failedItems = receipt?.items.filter((item) => item.status === 'failed') ?? [];
  const documentById = new Map(documents.map((document) => [document.documentId, document]));

  return (
    <section className="border-y bg-muted/30 px-3 py-3" aria-label="선택 문서 일괄 작업">
      <div className="flex flex-col gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            현재 페이지 {documents.length}건 선택
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            실행 시 각 문서의 권한, 보존, 상태를 다시 확인합니다. 페이지를 이동해도 시작된 작업은
            취소되지 않습니다.
          </p>
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <label className="text-xs font-medium text-muted-foreground">
            작업
            <select
              className={`${bulkSelectClassName} mt-1`}
              disabled={Boolean(running)}
              value={kind}
              onChange={(event) => setKind(event.target.value as BulkActionKind)}
            >
              <option value="add_tag">태그 추가</option>
              <option value="remove_tag">태그 제거</option>
              <option value="move_folder" disabled={!matterId}>
                폴더 이동{matterId ? '' : ' · 같은 Matter만'}
              </option>
              <option value="transition_status" disabled={statusTargets.length === 0}>
                상태 변경
              </option>
            </select>
          </label>
          {kind === 'move_folder' ? (
            <label className="text-xs font-medium text-muted-foreground">
              대상 폴더
              <select
                className={`${bulkSelectClassName} mt-1`}
                disabled={Boolean(running) || !matterId}
                value={folderId}
                onChange={(event) => setFolderId(event.target.value)}
              >
                <option value="">선택</option>
                {folders.map((folder) => (
                  <option key={folder.folderId} value={folder.folderId}>
                    {folder.path}
                  </option>
                ))}
              </select>
            </label>
          ) : kind === 'transition_status' ? (
            <label className="text-xs font-medium text-muted-foreground">
              변경 상태
              <select
                className={`${bulkSelectClassName} mt-1`}
                disabled={Boolean(running)}
                value={status}
                onChange={(event) => setStatus(event.target.value as BulkTransitionStatus)}
              >
                <option value="">선택</option>
                {statusTargets.map((target) => (
                  <option key={target} value={target}>
                    {documentStatusLabels[target]}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="text-xs font-medium text-muted-foreground">
              태그
              <input
                className={`${bulkSelectClassName} mt-1`}
                disabled={Boolean(running)}
                maxLength={80}
                placeholder="예: 검토완료"
                value={tag}
                onChange={(event) => setTag(event.target.value)}
              />
            </label>
          )}
          <Button
            className="self-end"
            disabled={!action || Boolean(running)}
            onClick={() => setConfirmOpen(true)}
            ref={confirmTriggerRef}
            size="sm"
            type="button"
          >
            검토
          </Button>
          <Button
            className="self-end"
            disabled={Boolean(running)}
            onClick={onClear}
            size="sm"
            type="button"
            variant="outline"
          >
            <X aria-hidden="true" className="h-4 w-4" />
            선택 해제
          </Button>
        </div>
      </div>

      <div className="mt-3" aria-live="polite">
        {running ? (
          <p className="flex items-center text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="mr-2 h-4 w-4" />
            처리 중 · {receipt.succeededCount + receipt.failedCount}/{receipt.totalCount}건
          </p>
        ) : receipt ? (
          <div className="space-y-2 rounded-md border bg-background px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center text-sm font-medium text-foreground">
                <CheckCircle2 aria-hidden="true" className="mr-2 h-4 w-4" />
                처리 결과 · 성공 {receipt.succeededCount}건 · 실패 {receipt.failedCount}건
              </p>
              {failedItems.length > 0 ? (
                <Button
                  disabled={pending}
                  onClick={() => void retryFailed()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RotateCcw aria-hidden="true" className="h-4 w-4" />
                  실패 항목 재시도
                </Button>
              ) : null}
            </div>
            {failedItems.length > 0 ? (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {failedItems.map((item) => (
                  <li key={item.itemId}>
                    {documentById.get(item.documentId)?.title ?? '선택 문서'} ·{' '}
                    {itemErrorLabel(item.errorCode)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {errorMessage ? <p className="mt-2 text-sm text-destructive">{errorMessage}</p> : null}
      </div>

      {confirmOpen && action ? (
        <div
          ref={confirmDialogRef}
          aria-labelledby="document-bulk-action-confirm-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6"
          role="dialog"
        >
          <div className="w-full max-w-lg rounded-md border bg-background shadow-lg">
            <div className="border-b px-4 py-3">
              <p
                className="text-sm font-semibold text-foreground"
                id="document-bulk-action-confirm-title"
              >
                일괄 작업 확인
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                현재 페이지에서 선택한 {documents.length}건에 {actionLabel(action)} 작업을
                요청합니다.
              </p>
            </div>
            <div className="space-y-2 px-4 py-4 text-sm text-muted-foreground">
              <p>각 문서는 실행 시점의 권한과 보존 정책으로 독립 처리됩니다.</p>
              <p>일부 항목이 실패하면 성공 항목과 실패 항목을 영수증에 함께 표시합니다.</p>
            </div>
            <div className="flex justify-end gap-2 border-t px-4 py-3">
              <Button
                disabled={pending}
                onClick={() => {
                  setConfirmOpen(false);
                  window.requestAnimationFrame(() => confirmTriggerRef.current?.focus());
                }}
                ref={confirmCancelRef}
                type="button"
                variant="outline"
              >
                취소
              </Button>
              <Button disabled={pending} onClick={() => void submit()} type="button">
                {pending ? '요청 중' : `${documents.length}건 실행`}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
