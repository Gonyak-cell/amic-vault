'use client';

import Script from 'next/script';
import type {
  MatterSuggestionDto,
  MatterSuggestionListDto,
  OutlookFilingRequestStatusDto,
  OutlookSendFileRequestStatusDto,
  OutlookSendPolicyDecisionDto,
  OutlookSendWarningReasonCode,
} from '@amic-vault/shared';
import {
  AlertTriangle,
  CheckCircle2,
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
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import {
  createOutlookSendFileRequest,
  createOutlookFilingRequest,
  evaluateOutlookSendPolicy,
  getOutlookFilingRequestStatus,
  getOutlookMatterSuggestions,
} from '@/lib/api/outlook-addin';
import {
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
  const [clientState, setClientState] = useState<ClientState>(initialSnapshot ? 'ready' : 'loading');
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
  const [acknowledgedWarningCodes, setAcknowledgedWarningCodes] = useState<
    Set<OutlookSendWarningReasonCode>
  >(() => new Set());
  const [busyAction, setBusyAction] = useState<
    'load' | 'suggest' | 'file' | 'status' | 'send-policy' | 'send-file' | null
  >(null);
  const [safeError, setSafeError] = useState<string | null>(null);

  const selectedCount = selectedAttachmentHashes.size;
  const canFile = Boolean(snapshot && selectedMatterId && busyAction !== 'file');
  const canEvaluateSend = Boolean(snapshot && busyAction !== 'send-policy');
  const canCreateSendFile = Boolean(
    snapshot && selectedMatterId && sendPolicy?.decision !== 'block' && busyAction !== 'send-file',
  );

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
          : response.items[0]?.matterId ?? '',
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
        buildCreateSendFileRequest(
          snapshot,
          selectedMatterId,
          selectedAttachmentHashes,
          [...acknowledgedWarningCodes],
        ),
      );
      setSendStatus(nextStatus);
    } catch (error) {
      setSafeError(safeApiErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }, [acknowledgedWarningCodes, selectedAttachmentHashes, selectedMatterId, snapshot]);

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

  const statusTone = useMemo(() => statusToneClass(status?.status), [status?.status]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f5f7f8] text-[#16242b]">
      <Script
        src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"
        strategy="afterInteractive"
        onLoad={() => {
          void loadOfficeItem();
        }}
      />
      <div className="mx-auto box-border flex min-h-screen w-full max-w-[520px] flex-col gap-3 p-3">
        <header className="flex items-center justify-between border-b border-[#d6dde0] pb-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-[#47626c]">AMIC Vault</p>
            <h1 className="truncate text-lg font-semibold leading-6">Outlook Filing</h1>
          </div>
          <StatePill state={clientState} />
        </header>

        {safeError ? (
          <div className="flex items-center gap-2 rounded-md border border-[#e0c7c9] bg-[#fff7f7] px-3 py-2 text-sm text-[#8a1f2a]">
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
            <span>{safeError}</span>
          </div>
        ) : null}

        <Card className="rounded-md shadow-none">
          <CardHeader className="flex-row items-center gap-2 p-3">
            <Inbox className="h-4 w-4 text-[#1d5b63]" aria-hidden />
            <CardTitle className="text-sm">메일</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 p-3 pt-0 text-sm">
            {snapshot ? <MessageSummary snapshot={snapshot} /> : <UnavailableState />}
          </CardContent>
        </Card>

        <Card className="rounded-md shadow-none">
          <CardHeader className="flex-row items-center justify-between gap-2 p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#8a5a10]" aria-hidden />
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
              <p className="rounded-md border border-dashed border-[#d8e0e3] px-3 py-3 text-sm text-[#5c6e75]">
                정책 대기
              </p>
            )}
            {sendStatus ? (
              <div className="rounded-md border border-[#c9dce0] bg-[#f0f8fa] px-3 py-2 text-xs text-[#1d5b63]">
                send-and-file {sendStatus.status} · {shortHash(sendStatus.id.replaceAll('-', ''))}
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
                  className="flex cursor-pointer items-start gap-2 rounded-md border border-[#d8e0e3] bg-white px-3 py-2 text-sm"
                >
                  <input
                    type="radio"
                    name="outlook-matter"
                    className="mt-1 h-4 w-4 accent-[#174f56]"
                    checked={selectedMatterId === suggestion.matterId}
                    onChange={() => setSelectedMatterId(suggestion.matterId)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{suggestion.matterName}</span>
                    <span className="block text-xs text-[#5c6e75]">{suggestion.matterCode}</span>
                  </span>
                  <span className="rounded-sm bg-[#e9f1f2] px-1.5 py-0.5 text-xs text-[#1d5b63]">
                    {Math.round(suggestion.score)}
                  </span>
                </label>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-[#d8e0e3] px-3 py-3 text-sm text-[#5c6e75]">
                추천 없음
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-md shadow-none">
          <CardHeader className="flex-row items-center gap-2 p-3">
            <Paperclip className="h-4 w-4 text-[#1d5b63]" aria-hidden />
            <CardTitle className="text-sm">첨부</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 p-3 pt-0">
            {snapshot?.attachmentRefs.length ? (
              snapshot.attachmentRefs.map((attachment, index) => (
                <label
                  key={attachment.attachmentIdHash}
                  className="flex items-center gap-2 rounded-md border border-[#d8e0e3] bg-white px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#174f56]"
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
                  <span className="ml-auto text-xs text-[#5c6e75]">
                    {formatBytes(attachment.sizeBytes)}
                    {attachment.mimeType ? ` · ${attachment.mimeType}` : ''}
                  </span>
                </label>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-[#d8e0e3] px-3 py-3 text-sm text-[#5c6e75]">
                첨부 없음
              </p>
            )}
          </CardContent>
        </Card>

        <section className="mt-auto grid gap-2 border-t border-[#d6dde0] pt-3">
          {status ? (
            <div className={`rounded-md border px-3 py-2 text-sm ${statusTone}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{status.status}</span>
                <span className="font-mono text-xs">{shortHash(status.id.replaceAll('-', ''))}</span>
              </div>
              <div className="mt-1 text-xs">
                Matter {shortHash(status.matterId.replaceAll('-', ''))}
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
          <p className="text-xs text-[#5c6e75]">
            선택 Matter {selectedMatterId ? shortHash(selectedMatterId.replaceAll('-', '')) : '없음'} ·
            첨부 {selectedCount}
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
        <div className="col-span-2 rounded-md bg-[#eef3f4] px-3 py-2">
          <dt className="text-xs text-[#5c6e75]">Received</dt>
          <dd className="font-mono text-xs">{new Date(snapshot.message.receivedAt).toLocaleString('ko-KR')}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[#eef3f4] px-3 py-2">
      <dt className="text-xs text-[#5c6e75]">{label}</dt>
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
      ? 'border-[#b9dfce] bg-[#effaf4] text-[#1d6b4e]'
      : policy.decision === 'warn'
        ? 'border-[#ead6a8] bg-[#fff9e9] text-[#80580d]'
        : 'border-[#e0c7c9] bg-[#fff7f7] text-[#8a1f2a]';
  return (
    <div className={`rounded-md border px-3 py-2 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{policy.decision}</span>
        <span className="font-mono text-xs">{shortHash(policy.decisionId.replaceAll('-', ''))}</span>
      </div>
      {policy.warningReasonCodes.length > 0 ? (
        <div className="mt-2 grid gap-1">
          {policy.warningReasonCodes.map((code) => (
            <label key={code} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-[#174f56]"
                checked={acknowledgedWarningCodes.has(code)}
                onChange={() => onToggleWarning(code)}
              />
              <span>{code}</span>
            </label>
          ))}
        </div>
      ) : null}
      {policy.deniedReasonCode ? <div className="mt-1 text-xs">{policy.deniedReasonCode}</div> : null}
    </div>
  );
}

function UnavailableState() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-[#d8e0e3] px-3 py-3 text-sm text-[#5c6e75]">
      <XCircle className="h-4 w-4 shrink-0" aria-hidden />
      <span>Office 항목 없음</span>
    </div>
  );
}

function StatePill({ state }: { state: ClientState }) {
  if (state === 'ready') {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm bg-[#ddf2ea] px-2 py-1 text-xs font-medium text-[#1d6b4e]">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        ready
      </span>
    );
  }
  if (state === 'loading') {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm bg-[#eef3f4] px-2 py-1 text-xs font-medium text-[#47626c]">
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        loading
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-[#fff0dd] px-2 py-1 text-xs font-medium text-[#89520d]">
      <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
      unavailable
    </span>
  );
}

function statusToneClass(status: OutlookFilingRequestStatusDto['status'] | undefined): string {
  if (status === 'completed') return 'border-[#b9dfce] bg-[#effaf4] text-[#1d6b4e]';
  if (status === 'denied' || status === 'failed') return 'border-[#e0c7c9] bg-[#fff7f7] text-[#8a1f2a]';
  if (status === 'cancelled') return 'border-[#d6dde0] bg-[#f4f6f7] text-[#5c6e75]';
  return 'border-[#c9dce0] bg-[#f0f8fa] text-[#1d5b63]';
}
