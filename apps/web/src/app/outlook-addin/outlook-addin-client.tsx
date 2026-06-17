'use client';

import Script from 'next/script';
import type {
  MatterSuggestionDto,
  MatterSuggestionListDto,
  OutlookDocumentInsertionDto,
  OutlookFilingRequestStatusDto,
  OutlookFolderMappingDto,
  OutlookSendFileRequestStatusDto,
  OutlookSendPolicyDecisionDto,
  OutlookSendWarningReasonCode,
  SearchResultDto,
} from '@amic-vault/shared';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Folder,
  Inbox,
  Paperclip,
  RefreshCw,
  Send,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import {
  createOutlookDocumentInsertion,
  createOutlookFolderMapping,
  createOutlookSendFileRequest,
  createOutlookFilingRequest,
  evaluateOutlookSendPolicy,
  getOutlookFilingRequestStatus,
  getOutlookMatterSuggestions,
  searchOutlookInsertableDocuments,
  updateOutlookFolderMapping,
} from '@/lib/api/outlook-addin';
import {
  buildCreateFolderMappingRequest,
  buildCreateDocumentInsertionRequest,
  buildCreateFilingRequest,
  buildCreateSendFileRequest,
  buildMatterSuggestionQuery,
  buildOutlookItemSnapshot,
  buildSendPolicyRequest,
  formatBytes,
  shortHash,
  type OfficeMailboxLike,
  type OutlookItemSnapshot,
} from '@/lib/outlook-addin/outlook-item';

interface OfficeHostLike {
  context?: {
    mailbox?: OfficeMailboxLike;
  };
  onReady?: (callback: () => void) => void;
}

declare global {
  interface Window {
    Office?: OfficeHostLike;
  }
}

type ClientState = 'loading' | 'ready' | 'unavailable';

interface OutlookAddinClientProps {
  initialSnapshot?: OutlookItemSnapshot;
  initialSuggestions?: MatterSuggestionDto[];
  initialStatus?: OutlookFilingRequestStatusDto;
}

export function OutlookAddinClient({
  initialSnapshot,
  initialSuggestions = [],
  initialStatus,
}: OutlookAddinClientProps) {
  const [clientState, setClientState] = useState<ClientState>(
    initialSnapshot ? 'ready' : 'loading',
  );
  const [snapshot, setSnapshot] = useState<OutlookItemSnapshot | null>(initialSnapshot ?? null);
  const [suggestions, setSuggestions] = useState<MatterSuggestionDto[]>(initialSuggestions);
  const [selectedMatterId, setSelectedMatterId] = useState<string>(
    initialSuggestions[0]?.matterId ?? '',
  );
  const [selectedAttachmentHashes, setSelectedAttachmentHashes] = useState<Set<string>>(
    () =>
      new Set(
        (initialSnapshot?.attachmentRefs ?? [])
          .filter((attachment) => attachment.selectedForFiling)
          .map((attachment) => attachment.attachmentIdHash),
      ),
  );
  const [status, setStatus] = useState<OutlookFilingRequestStatusDto | undefined>(initialStatus);
  const [sendPolicy, setSendPolicy] = useState<OutlookSendPolicyDecisionDto | undefined>();
  const [sendStatus, setSendStatus] = useState<OutlookSendFileRequestStatusDto | undefined>();
  const [folderMapping, setFolderMapping] = useState<OutlookFolderMappingDto | undefined>();
  const [documentQuery, setDocumentQuery] = useState('');
  const [documentResults, setDocumentResults] = useState<SearchResultDto[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [documentInsertion, setDocumentInsertion] = useState<
    OutlookDocumentInsertionDto | undefined
  >();
  const [acknowledgedWarningCodes, setAcknowledgedWarningCodes] = useState<
    Set<OutlookSendWarningReasonCode>
  >(() => new Set());
  const [busyAction, setBusyAction] = useState<
    | 'load'
    | 'suggest'
    | 'file'
    | 'status'
    | 'send-policy'
    | 'send-file'
    | 'folder-map'
    | 'folder-approve'
    | 'doc-search'
    | 'insert-doc'
    | null
  >(null);
  const [safeError, setSafeError] = useState<string | null>(null);

  const selectedCount = selectedAttachmentHashes.size;
  const canFile = Boolean(snapshot && selectedMatterId && busyAction !== 'file');
  const canEvaluateSend = Boolean(snapshot && busyAction !== 'send-policy');
  const canCreateSendFile = Boolean(
    snapshot && selectedMatterId && sendPolicy?.decision !== 'block' && busyAction !== 'send-file',
  );
  const canCreateFolderMapping = Boolean(
    snapshot?.folderRefHash && selectedMatterId && busyAction !== 'folder-map',
  );
  const canApproveFolderMapping = Boolean(
    folderMapping &&
    (folderMapping.approvalStatus === 'pending_user' ||
      folderMapping.approvalStatus === 'pending_admin' ||
      folderMapping.approvalStatus === 'disabled') &&
    busyAction !== 'folder-approve',
  );
  const selectedDocument = documentResults.find((item) => item.documentId === selectedDocumentId);
  const canSearchDocuments = Boolean(documentQuery.trim() && busyAction !== 'doc-search');
  const canInsertDocument = Boolean(snapshot && selectedDocument && busyAction !== 'insert-doc');

  const loadOfficeItem = useCallback(async () => {
    if (initialSnapshot) return;
    setBusyAction('load');
    setSafeError(null);
    const load = async () => {
      try {
        if (!window.Office?.context?.mailbox) {
          setClientState('unavailable');
          return;
        }
        const nextSnapshot = await buildOutlookItemSnapshot(window.Office.context.mailbox);
        setSnapshot(nextSnapshot);
        setSelectedAttachmentHashes(
          new Set(
            nextSnapshot.attachmentRefs
              .filter((attachment) => attachment.selectedForFiling)
              .map((attachment) => attachment.attachmentIdHash),
          ),
        );
        setClientState('ready');
      } catch {
        setClientState('unavailable');
        setSafeError('Access unavailable');
      } finally {
        setBusyAction(null);
      }
    };

    if (window.Office?.onReady) {
      window.Office.onReady(() => {
        void load();
      });
    } else {
      await load();
    }
  }, [initialSnapshot]);

  const refreshSuggestions = useCallback(async () => {
    if (!snapshot) return;
    setBusyAction('suggest');
    setSafeError(null);
    try {
      const response: MatterSuggestionListDto = await getOutlookMatterSuggestions(
        buildMatterSuggestionQuery(snapshot),
      );
      setSuggestions(response.items);
      setSelectedMatterId((current) =>
        response.items.some((item) => item.matterId === current)
          ? current
          : (response.items[0]?.matterId ?? ''),
      );
    } catch (error) {
      setSafeError(safeApiErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }, [snapshot]);

  const submitFiling = useCallback(async () => {
    if (!snapshot || !selectedMatterId) return;
    setBusyAction('file');
    setSafeError(null);
    try {
      const nextStatus = await createOutlookFilingRequest(
        buildCreateFilingRequest(snapshot, selectedMatterId, selectedAttachmentHashes),
      );
      setStatus(nextStatus);
    } catch (error) {
      setSafeError(safeApiErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }, [selectedAttachmentHashes, selectedMatterId, snapshot]);

  const checkSendPolicy = useCallback(async () => {
    if (!snapshot) return;
    setBusyAction('send-policy');
    setSafeError(null);
    try {
      const decision = await evaluateOutlookSendPolicy(
        buildSendPolicyRequest(snapshot, selectedMatterId || undefined, selectedAttachmentHashes),
      );
      setSendPolicy(decision);
      setAcknowledgedWarningCodes(new Set());
    } catch (error) {
      setSafeError(safeApiErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }, [selectedAttachmentHashes, selectedMatterId, snapshot]);

  const submitSendFile = useCallback(async () => {
    if (!snapshot || !selectedMatterId) return;
    setBusyAction('send-file');
    setSafeError(null);
    try {
      const nextStatus = await createOutlookSendFileRequest(
        buildCreateSendFileRequest(snapshot, selectedMatterId, selectedAttachmentHashes, [
          ...acknowledgedWarningCodes,
        ]),
      );
      setSendStatus(nextStatus);
    } catch (error) {
      setSafeError(safeApiErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }, [acknowledgedWarningCodes, selectedAttachmentHashes, selectedMatterId, snapshot]);

  const submitFolderMapping = useCallback(async () => {
    if (!snapshot || !selectedMatterId || !snapshot.folderRefHash) return;
    setBusyAction('folder-map');
    setSafeError(null);
    try {
      setFolderMapping(
        await createOutlookFolderMapping(
          buildCreateFolderMappingRequest(snapshot, selectedMatterId, {
            mappingMode: 'manual',
            autoFileRequested: false,
          }),
        ),
      );
    } catch (error) {
      setSafeError(safeApiErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }, [selectedMatterId, snapshot]);

  const approveFolderMapping = useCallback(async () => {
    if (!folderMapping) return;
    setBusyAction('folder-approve');
    setSafeError(null);
    try {
      setFolderMapping(
        await updateOutlookFolderMapping(folderMapping.mappingId, {
          approvalDecision: 'approve',
          autoFileEnabled: false,
          clientRequestId: `oa09-approve:${Date.now().toString(36)}:${shortHash(
            folderMapping.mappingId.replaceAll('-', ''),
          )}`,
        }),
      );
    } catch (error) {
      setSafeError(safeApiErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }, [folderMapping]);

  const refreshDocumentResults = useCallback(async () => {
    const query = documentQuery.trim();
    if (!query) return;
    setBusyAction('doc-search');
    setSafeError(null);
    try {
      const response = await searchOutlookInsertableDocuments({
        query,
        mode: 'keyword',
        filters: { versionStatus: 'current' },
        page: 1,
        pageSize: 5,
      });
      setDocumentResults(response.results);
      setSelectedDocumentId((current) =>
        response.results.some((item) => item.documentId === current)
          ? current
          : (response.results[0]?.documentId ?? ''),
      );
      setDocumentInsertion(undefined);
    } catch (error) {
      setSafeError(safeApiErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }, [documentQuery]);

  const submitDocumentInsertion = useCallback(async () => {
    if (!snapshot || !selectedDocument) return;
    setBusyAction('insert-doc');
    setSafeError(null);
    try {
      const nextInsertion = await createOutlookDocumentInsertion(
        buildCreateDocumentInsertionRequest(snapshot, {
          documentId: selectedDocument.documentId,
          versionId: selectedDocument.versionId,
        }),
      );
      setDocumentInsertion(nextInsertion);
    } catch (error) {
      setSafeError(safeApiErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }, [selectedDocument, snapshot]);

  const refreshStatus = useCallback(async () => {
    if (!status) return;
    setBusyAction('status');
    setSafeError(null);
    try {
      setStatus(await getOutlookFilingRequestStatus(status.id));
    } catch (error) {
      setSafeError(safeApiErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }, [status]);

  useEffect(() => {
    if (initialSnapshot) return;
    const timeout = window.setTimeout(() => {
      if (!window.Office) setClientState('unavailable');
    }, 2400);
    return () => window.clearTimeout(timeout);
  }, [initialSnapshot]);

  useEffect(() => {
    if (!snapshot || initialSuggestions.length > 0) return;
    void refreshSuggestions();
  }, [initialSuggestions.length, refreshSuggestions, snapshot]);

  useEffect(() => {
    setSendPolicy(undefined);
    setSendStatus(undefined);
    setAcknowledgedWarningCodes(new Set());
  }, [selectedAttachmentHashes, selectedMatterId, snapshot]);

  useEffect(() => {
    setFolderMapping(undefined);
  }, [selectedMatterId, snapshot]);

  const statusTone = useMemo(() => statusToneClass(status?.status), [status?.status]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <Script
        src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"
        strategy="afterInteractive"
        onLoad={() => {
          void loadOfficeItem();
        }}
      />
      <div className="mx-auto box-border flex min-h-screen w-full max-w-[520px] flex-col gap-3 p-3">
        <header className="flex items-center justify-between border-b pb-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
              AMIC Vault
            </p>
            <h1 className="truncate text-lg font-semibold leading-6">Outlook Filing</h1>
          </div>
          <StatePill state={clientState} />
        </header>

        {safeError ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
            <span>{safeError}</span>
          </div>
        ) : null}

        <Card className="rounded-md shadow-none">
          <CardHeader className="flex-row items-center gap-2 p-3">
            <Inbox className="h-4 w-4 text-primary" aria-hidden />
            <CardTitle className="text-sm">메일</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 p-3 pt-0 text-sm">
            {snapshot ? <MessageSummary snapshot={snapshot} /> : <UnavailableState />}
          </CardContent>
        </Card>

        <Card className="rounded-md shadow-none">
          <CardHeader className="flex-row items-center justify-between gap-2 p-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" aria-hidden />
              <CardTitle className="text-sm">Vault 문서</CardTitle>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={() => void refreshDocumentResults()}
              disabled={!canSearchDocuments}
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              검색
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2 p-3 pt-0 text-sm">
            <Input
              value={documentQuery}
              onChange={(event) => setDocumentQuery(event.target.value)}
              className="h-9 bg-card"
              maxLength={120}
              placeholder="문서 검색"
            />
            {documentResults.length > 0 ? (
              <div className="grid gap-2">
                {documentResults.map((result) => (
                  <label
                    key={result.documentId}
                    className="flex cursor-pointer items-start gap-2 rounded-md border bg-background px-3 py-2"
                  >
                    <input
                      type="radio"
                      name="outlook-document"
                      className="mt-1 h-4 w-4 accent-primary"
                      checked={selectedDocumentId === result.documentId}
                      onChange={() => {
                        setSelectedDocumentId(result.documentId);
                        setDocumentInsertion(undefined);
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{result.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {result.documentType} · 문서 후보
                      </span>
                    </span>
                    <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-xs text-primary">
                      {Math.round(result.score)}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                문서 없음
              </p>
            )}
            {documentInsertion ? (
              <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
                insert {documentInsertion.status} · 요청 기록됨
              </div>
            ) : null}
            <Button
              type="button"
              className="h-10"
              onClick={() => void submitDocumentInsertion()}
              disabled={!canInsertDocument}
            >
              <FileText className="h-4 w-4" aria-hidden />
              내부 참조
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-md shadow-none">
          <CardHeader className="flex-row items-center justify-between gap-2 p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden />
              <CardTitle className="text-sm">Send</CardTitle>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={() => void checkSendPolicy()}
              disabled={!canEvaluateSend}
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              정책
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2 p-3 pt-0 text-sm">
            {sendPolicy ? (
              <SendPolicyPanel
                policy={sendPolicy}
                acknowledgedWarningCodes={acknowledgedWarningCodes}
                onToggleWarning={(code) =>
                  setAcknowledgedWarningCodes((current) => {
                    const next = new Set(current);
                    if (next.has(code)) next.delete(code);
                    else next.add(code);
                    return next;
                  })
                }
              />
            ) : (
              <p className="rounded-md border border-dashed bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                정책 대기
              </p>
            )}
            {sendStatus ? (
              <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
                send-and-file {sendStatus.status} · 요청 기록됨
              </div>
            ) : null}
            <Button
              type="button"
              className="h-10"
              onClick={() => void submitSendFile()}
              disabled={!canCreateSendFile}
            >
              <Send className="h-4 w-4" aria-hidden />
              Send+File
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-md shadow-none">
          <CardHeader className="flex-row items-center justify-between gap-2 p-3">
            <CardTitle className="text-sm">Matter</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={() => void refreshSuggestions()}
              disabled={!snapshot || busyAction === 'suggest'}
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              새로고침
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2 p-3 pt-0">
            {suggestions.length > 0 ? (
              suggestions.map((suggestion) => (
                <label
                  key={suggestion.matterId}
                  className="flex cursor-pointer items-start gap-2 rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <input
                    type="radio"
                    name="outlook-matter"
                    className="mt-1 h-4 w-4 accent-primary"
                    checked={selectedMatterId === suggestion.matterId}
                    onChange={() => setSelectedMatterId(suggestion.matterId)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{suggestion.matterName}</span>
                    <span className="block text-xs text-muted-foreground">{suggestion.matterCode}</span>
                  </span>
                  <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-xs text-primary">
                    {Math.round(suggestion.score)}
                  </span>
                </label>
              ))
            ) : (
              <p className="rounded-md border border-dashed bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                추천 없음
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-md shadow-none">
          <CardHeader className="flex-row items-center justify-between gap-2 p-3">
            <div className="flex items-center gap-2">
              <Folder className="h-4 w-4 text-primary" aria-hidden />
              <CardTitle className="text-sm">폴더 매핑</CardTitle>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={() => void submitFolderMapping()}
              disabled={!canCreateFolderMapping}
            >
              <Folder className="h-4 w-4" aria-hidden />
              생성
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2 p-3 pt-0 text-sm">
            {snapshot?.folderRefHash ? (
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Folder" value="연결됨" />
                <Metric label="Matter" value={selectedMatterId ? '선택됨' : '없음'} />
              </div>
            ) : (
              <p className="rounded-md border border-dashed bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                폴더 ref 없음
              </p>
            )}
            {folderMapping ? (
              <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
                {folderMapping.approvalStatus} · 매핑 기록됨
                {folderMapping.autoFileEnabled ? ' · auto-file' : ''}
              </div>
            ) : null}
            <Button
              type="button"
              className="h-10"
              onClick={() => void approveFolderMapping()}
              disabled={!canApproveFolderMapping}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              승인
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-md shadow-none">
          <CardHeader className="flex-row items-center gap-2 p-3">
            <Paperclip className="h-4 w-4 text-primary" aria-hidden />
            <CardTitle className="text-sm">첨부</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 p-3 pt-0">
            {snapshot?.attachmentRefs.length ? (
              snapshot.attachmentRefs.map((attachment, index) => (
                <label
                  key={attachment.attachmentIdHash}
                  className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={selectedAttachmentHashes.has(attachment.attachmentIdHash)}
                    onChange={() =>
                      setSelectedAttachmentHashes((current) => {
                        const next = new Set(current);
                        if (next.has(attachment.attachmentIdHash)) {
                          next.delete(attachment.attachmentIdHash);
                        } else {
                          next.add(attachment.attachmentIdHash);
                        }
                        return next;
                      })
                    }
                  />
                  <span className="font-medium">첨부 {index + 1}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatBytes(attachment.sizeBytes)}
                    {attachment.mimeType ? ` · ${attachment.mimeType}` : ''}
                  </span>
                </label>
              ))
            ) : (
              <p className="rounded-md border border-dashed bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                첨부 없음
              </p>
            )}
          </CardContent>
        </Card>

        <section className="mt-auto grid gap-2 border-t pt-3">
          {status ? (
            <div className={`rounded-md border px-3 py-2 text-sm ${statusTone}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{status.status}</span>
                <span className="text-xs">요청 기록됨</span>
              </div>
              <div className="mt-1 text-xs">
                파일링 요청이 Matter에 연결됨
                {status.filedAttachmentCount !== undefined
                  ? ` · 첨부 ${status.filedAttachmentCount}`
                  : ''}
                {status.deniedReasonCode ? ` · ${status.deniedReasonCode}` : ''}
              </div>
            </div>
          ) : null}
          <div className="flex min-w-0 gap-2">
            <Button
              type="button"
              className="h-10 min-w-0 flex-1"
              onClick={() => void submitFiling()}
              disabled={!canFile}
            >
              <Send className="h-4 w-4" aria-hidden />
              파일링
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 w-12 shrink-0 px-0"
              onClick={() => void refreshStatus()}
              disabled={!status || busyAction === 'status'}
              aria-label="상태 새로고침"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            선택 Matter {selectedMatterId ? '있음' : '없음'} · 첨부 {selectedCount}
          </p>
        </section>
      </div>
    </main>
  );
}

function MessageSummary({ snapshot }: { snapshot: OutlookItemSnapshot }) {
  return (
    <dl className="grid grid-cols-2 gap-2">
      <Metric label="Message" value={snapshot.itemHashPreview} />
      <Metric label="Mailbox" value={snapshot.mailboxHashPreview} />
      <Metric label="Domains" value={String(snapshot.participantDomainHashCount)} />
      <Metric label="External" value={snapshot.message.hasExternalParticipants ? 'Yes' : 'No'} />
      <Metric label="Attachments" value={String(snapshot.attachmentSummary.count)} />
      <Metric label="Selected" value={String(snapshot.attachmentSummary.selectedCount)} />
      {snapshot.message.receivedAt ? (
        <div className="col-span-2 rounded-md bg-muted/60 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Received</dt>
          <dd className="font-mono text-xs">
            {new Date(snapshot.message.receivedAt).toLocaleString('ko-KR')}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/60 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-xs">{value}</dd>
    </div>
  );
}

function SendPolicyPanel({
  policy,
  acknowledgedWarningCodes,
  onToggleWarning,
}: {
  policy: OutlookSendPolicyDecisionDto;
  acknowledgedWarningCodes: ReadonlySet<OutlookSendWarningReasonCode>;
  onToggleWarning: (code: OutlookSendWarningReasonCode) => void;
}) {
  const tone =
    policy.decision === 'allow'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : policy.decision === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-destructive/40 bg-destructive/5 text-destructive';
  return (
    <div className={`rounded-md border px-3 py-2 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{policy.decision}</span>
        <span className="text-xs">정책 확인됨</span>
      </div>
      {policy.warningReasonCodes.length > 0 ? (
        <div className="mt-2 grid gap-1">
          {policy.warningReasonCodes.map((code) => (
            <label key={code} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-primary"
                checked={acknowledgedWarningCodes.has(code)}
                onChange={() => onToggleWarning(code)}
              />
              <span>{code}</span>
            </label>
          ))}
        </div>
      ) : null}
      {policy.deniedReasonCode ? (
        <div className="mt-1 text-xs">{policy.deniedReasonCode}</div>
      ) : null}
    </div>
  );
}

function UnavailableState() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
      <XCircle className="h-4 w-4 shrink-0" aria-hidden />
      <span>Office 항목 없음</span>
    </div>
  );
}

function StatePill({ state }: { state: ClientState }) {
  if (state === 'ready') {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        ready
      </span>
    );
  }
  if (state === 'loading') {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        loading
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
      <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
      unavailable
    </span>
  );
}

function statusToneClass(status: OutlookFilingRequestStatusDto['status'] | undefined): string {
  if (status === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'denied' || status === 'failed')
    return 'border-destructive/40 bg-destructive/5 text-destructive';
  if (status === 'cancelled') return 'border-border bg-muted text-muted-foreground';
  return 'border-primary/20 bg-primary/5 text-primary';
}
