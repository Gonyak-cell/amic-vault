'use client';

import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Inbox,
  Link2,
  RefreshCw,
  Send,
  Share2,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import type {
  CreateExternalAnswerRequestDto,
  CreateExternalLinkRequestDto,
  ExternalLinkCreatedResponseDto,
  ExternalLinkDto,
  ExternalManagementWorkspaceDto,
  ExternalManagementWorkspaceListResponseDto,
  ExternalQaListResponseDto,
  ExternalQaMessageDto,
  ExternalUserDto,
  ExternalWorkspaceDto,
  MatterDto,
  ReviewExternalAnswerRequestDto,
} from '@amic-vault/shared';
import { LinkIssuanceDialog } from '@/components/external/link-issuance-dialog';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import {
  createExternalAnswer,
  createExternalLink,
  createExternalUser,
  createExternalWorkspace,
  listExternalWorkspaces,
  listWorkspaceQa,
  reviewExternalAnswer,
  revokeExternalLink,
} from '@/lib/api/external-portal';
import { getMatter } from '@/lib/api-client';
import { matterAppSourceMode, toMatterCodeOption } from '@/lib/matter-app';

export interface ExternalSharingApi {
  createAnswer: (
    messageId: string,
    input: CreateExternalAnswerRequestDto,
  ) => Promise<ExternalQaMessageDto>;
  createLink: (input: CreateExternalLinkRequestDto) => Promise<ExternalLinkCreatedResponseDto>;
  createUser: (input: {
    workspaceId: string;
    emailHash: string;
    displayRef?: string;
  }) => Promise<ExternalUserDto>;
  createWorkspace: (input: {
    matterId: string;
    workspaceCode: string;
    displayRef: string;
    expiresAt: string;
  }) => Promise<ExternalWorkspaceDto>;
  getMatter: (matterId: string) => Promise<MatterDto>;
  listQa: (workspaceId: string) => Promise<ExternalQaListResponseDto>;
  listWorkspaces: (matterId: string) => Promise<ExternalManagementWorkspaceListResponseDto>;
  reviewAnswer: (
    messageId: string,
    input: ReviewExternalAnswerRequestDto,
  ) => Promise<ExternalQaMessageDto>;
  revokeLink: (linkId: string) => Promise<ExternalLinkDto>;
}

export const externalSharingDefaultApi: ExternalSharingApi = {
  createAnswer: createExternalAnswer,
  createLink: createExternalLink,
  createUser: createExternalUser,
  createWorkspace: createExternalWorkspace,
  getMatter,
  listQa: listWorkspaceQa,
  listWorkspaces: listExternalWorkspaces,
  reviewAnswer: reviewExternalAnswer,
  revokeLink: revokeExternalLink,
};

type LoadState = 'loading' | 'ready' | 'error';
type AnswerVisibilityScope = CreateExternalAnswerRequestDto['visibilityScope'];

const qaStatusLabels = {
  draft: '초안',
  pending_approval: '승인 대기',
  published: '게시됨',
  rejected: '반려됨',
} as const;

const qaVisibilityLabels = {
  asker_only: '질문자 한정',
  workspace: '워크스페이스 전체',
} as const;

function futureLocalDateTime(days: number): string {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toIsoDateTime(value: string): string {
  return new Date(value).toISOString();
}

function upsertWorkspace(
  workspaces: ExternalManagementWorkspaceDto[],
  workspace: ExternalWorkspaceDto,
): ExternalManagementWorkspaceDto[] {
  const next = { ...workspace, users: [], links: [] };
  const index = workspaces.findIndex((item) => item.workspaceId === workspace.workspaceId);
  if (index === -1) return [next, ...workspaces];
  return workspaces.map((item) =>
    item.workspaceId === workspace.workspaceId ? { ...item, ...workspace } : item,
  );
}

function addUserToWorkspace(
  workspaces: ExternalManagementWorkspaceDto[],
  user: ExternalUserDto,
): ExternalManagementWorkspaceDto[] {
  return workspaces.map((workspace) =>
    workspace.workspaceId === user.workspaceId
      ? {
          ...workspace,
          users: [
            user,
            ...workspace.users.filter((item) => item.externalUserId !== user.externalUserId),
          ],
        }
      : workspace,
  );
}

function addLinkToWorkspace(
  workspaces: ExternalManagementWorkspaceDto[],
  link: ExternalLinkDto,
): ExternalManagementWorkspaceDto[] {
  return workspaces.map((workspace) =>
    workspace.workspaceId === link.workspaceId
      ? {
          ...workspace,
          links: [link, ...workspace.links.filter((item) => item.linkId !== link.linkId)],
        }
      : workspace,
  );
}

function replaceLinkInWorkspace(
  workspaces: ExternalManagementWorkspaceDto[],
  link: ExternalLinkDto,
): ExternalManagementWorkspaceDto[] {
  return workspaces.map((workspace) =>
    workspace.workspaceId === link.workspaceId
      ? {
          ...workspace,
          links: workspace.links.map((item) => (item.linkId === link.linkId ? link : item)),
        }
      : workspace,
  );
}

export function ExternalSharingClient({
  api = externalSharingDefaultApi,
  disableInitialLoad = false,
  initialMatter = null,
  initialWorkspaces = [],
  matterId,
}: {
  api?: ExternalSharingApi;
  disableInitialLoad?: boolean;
  initialMatter?: MatterDto | null;
  initialWorkspaces?: ExternalManagementWorkspaceDto[];
  matterId: string;
}) {
  const [matter, setMatter] = useState<MatterDto | null>(initialMatter);
  const [workspaces, setWorkspaces] = useState<ExternalManagementWorkspaceDto[]>(initialWorkspaces);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(initialWorkspaces[0]?.workspaceId ?? '');
  const [qaMessages, setQaMessages] = useState<ExternalQaMessageDto[]>([]);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [answerScopes, setAnswerScopes] = useState<Record<string, AnswerVisibilityScope>>({});
  const [loadState, setLoadState] = useState<LoadState>(disableInitialLoad ? 'ready' : 'loading');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workspaceCode, setWorkspaceCode] = useState('');
  const [workspaceDisplayRef, setWorkspaceDisplayRef] = useState('');
  const [workspaceExpiresAt, setWorkspaceExpiresAt] = useState(futureLocalDateTime(14));
  const [emailHash, setEmailHash] = useState('');
  const [displayRef, setDisplayRef] = useState('');

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.workspaceId === selectedWorkspaceId) ?? workspaces[0] ?? null,
    [selectedWorkspaceId, workspaces],
  );
  const matterOption = matter ? toMatterCodeOption(matter, matterAppSourceMode()) : null;
  const questions = qaMessages.filter((message) => message.direction === 'external_question');
  const answersByParent = useMemo(() => {
    const grouped = new Map<string, ExternalQaMessageDto[]>();
    for (const message of qaMessages) {
      if (message.direction !== 'internal_answer' || !message.parentMessageId) continue;
      grouped.set(message.parentMessageId, [...(grouped.get(message.parentMessageId) ?? []), message]);
    }
    return grouped;
  }, [qaMessages]);

  useEffect(() => {
    if (disableInitialLoad) return;
    let active = true;
    setLoadState('loading');
    Promise.all([api.getMatter(matterId), api.listWorkspaces(matterId)])
      .then(([matterResult, workspaceResult]) => {
        if (!active) return;
        setMatter(matterResult);
        setWorkspaces(workspaceResult.workspaces);
        setSelectedWorkspaceId(workspaceResult.workspaces[0]?.workspaceId ?? '');
        setLoadState('ready');
      })
      .catch((caught) => {
        if (!active) return;
        setErrorMessage(safeApiErrorMessage(caught));
        setLoadState('error');
      });
    return () => {
      active = false;
    };
  }, [api, disableInitialLoad, matterId]);

  useEffect(() => {
    if (!selectedWorkspace) {
      setQaMessages([]);
      return;
    }
    let active = true;
    api
      .listQa(selectedWorkspace.workspaceId)
      .then((result) => {
        if (active) setQaMessages(result.messages);
      })
      .catch(() => {
        if (active) setQaMessages([]);
      });
    return () => {
      active = false;
    };
  }, [api, selectedWorkspace]);

  async function refreshWorkspaces() {
    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await api.listWorkspaces(matterId);
      setWorkspaces(result.workspaces);
      setSelectedWorkspaceId((current) => current || result.workspaces[0]?.workspaceId || '');
    } catch (caught) {
      setErrorMessage(safeApiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submitWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !workspaceCode.trim() || !workspaceDisplayRef.trim()) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const created = await api.createWorkspace({
        matterId,
        workspaceCode: workspaceCode.trim().toUpperCase(),
        displayRef: workspaceDisplayRef.trim(),
        expiresAt: toIsoDateTime(workspaceExpiresAt),
      });
      setWorkspaces((current) => upsertWorkspace(current, created));
      setSelectedWorkspaceId(created.workspaceId);
      setWorkspaceCode('');
      setWorkspaceDisplayRef('');
    } catch (caught) {
      setErrorMessage(safeApiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !selectedWorkspace || !emailHash.trim()) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const user = await api.createUser({
        workspaceId: selectedWorkspace.workspaceId,
        emailHash: emailHash.trim().toLowerCase(),
        ...(displayRef.trim() ? { displayRef: displayRef.trim() } : {}),
      });
      setWorkspaces((current) => addUserToWorkspace(current, user));
      setEmailHash('');
      setDisplayRef('');
    } catch (caught) {
      setErrorMessage(safeApiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function revokeLink(link: ExternalLinkDto) {
    if (busy) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const revoked = await api.revokeLink(link.linkId);
      setWorkspaces((current) => replaceLinkInWorkspace(current, revoked));
    } catch (caught) {
      setErrorMessage(safeApiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function answerQuestion(message: ExternalQaMessageDto) {
    const draft = answerDrafts[message.messageId]?.trim();
    if (!draft || busy) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const answer = await api.createAnswer(message.messageId, {
        messageText: draft,
        visibilityScope: answerScopes[message.messageId] ?? 'asker_only',
      });
      setQaMessages((current) => [...current, answer]);
      setAnswerDrafts((current) => ({ ...current, [message.messageId]: '' }));
    } catch (caught) {
      setErrorMessage(safeApiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function reviewAnswer(
    message: ExternalQaMessageDto,
    decision: ReviewExternalAnswerRequestDto['decision'],
  ) {
    if (busy) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const reviewed = await api.reviewAnswer(message.messageId, { decision });
      setQaMessages((current) =>
        current.map((item) => (item.messageId === reviewed.messageId ? reviewed : item)),
      );
    } catch (caught) {
      setErrorMessage(safeApiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['문서 보관', 'Matter', '외부 공유']}
        title="외부 공유"
        {...(matter
          ? { description: [matter.matterCode, matter.safeLabel ?? matter.matterName].join(' · ') }
          : {})}
        actions={
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={refreshWorkspaces}>
            <RefreshCw className="h-4 w-4" />
            새로고침
          </Button>
        }
      />

      {loadState === 'loading' ? <EmptyState variant="api-unavailable" title="외부 공유를 불러오는 중입니다." /> : null}
      {loadState === 'error' ? (
        <EmptyState
          variant="api-error"
          title="외부 공유를 표시할 수 없습니다."
          {...(errorMessage ? { description: errorMessage } : {})}
        />
      ) : null}

      {loadState !== 'error' ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(18rem,22rem)_1fr]">
          <SectionCard icon={<Share2 className="h-4 w-4" />} title="워크스페이스" meta="Matter 외부 공유">
            <form className="grid gap-3" onSubmit={submitWorkspace}>
              <Input
                aria-label="워크스페이스 코드"
                disabled={busy}
                placeholder="EXT-ROOM"
                value={workspaceCode}
                onChange={(event) => setWorkspaceCode(event.target.value)}
              />
              <Input
                aria-label="워크스페이스 표시명"
                disabled={busy}
                placeholder="Client Clean Room"
                value={workspaceDisplayRef}
                onChange={(event) => setWorkspaceDisplayRef(event.target.value)}
              />
              <Input
                aria-label="워크스페이스 만료 시각"
                disabled={busy}
                type="datetime-local"
                value={workspaceExpiresAt}
                onChange={(event) => setWorkspaceExpiresAt(event.target.value)}
              />
              <Button type="submit" disabled={busy || !workspaceCode.trim() || !workspaceDisplayRef.trim()}>
                <Share2 className="h-4 w-4" />
                워크스페이스 생성
              </Button>
            </form>

            <div className="mt-4 grid gap-2">
              {workspaces.map((workspace) => (
                <button
                  key={workspace.workspaceId}
                  type="button"
                  className={`rounded-md border px-3 py-2 text-left text-sm ${
                    selectedWorkspace?.workspaceId === workspace.workspaceId ? 'border-primary bg-primary/5' : 'bg-background'
                  }`}
                  onClick={() => setSelectedWorkspaceId(workspace.workspaceId)}
                >
                  <span className="block truncate font-medium">{workspace.displayRef}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{workspace.workspaceCode}</span>
                </button>
              ))}
              {workspaces.length === 0 ? <p className="text-sm text-muted-foreground">등록된 워크스페이스가 없습니다.</p> : null}
            </div>
          </SectionCard>

          <div className="grid gap-4">
            <SectionCard
              icon={<Users className="h-4 w-4" />}
              title="외부 사용자"
              meta={selectedWorkspace?.displayRef ?? '워크스페이스 선택'}
            >
              <form className="grid gap-3 md:grid-cols-[minmax(18rem,1fr)_minmax(12rem,1fr)_auto]" onSubmit={submitUser}>
                <Input
                  aria-label="수신자 email hash"
                  disabled={busy || !selectedWorkspace}
                  placeholder="64자 email hash"
                  value={emailHash}
                  onChange={(event) => setEmailHash(event.target.value)}
                />
                <Input
                  aria-label="수신자 표시명"
                  disabled={busy || !selectedWorkspace}
                  placeholder="Recipient Ref"
                  value={displayRef}
                  onChange={(event) => setDisplayRef(event.target.value)}
                />
                <Button type="submit" disabled={busy || !selectedWorkspace || !emailHash.trim()}>
                  <UserPlus className="h-4 w-4" />
                  초대
                </Button>
              </form>
              <div className="mt-3 flex flex-wrap gap-2">
                {(selectedWorkspace?.users ?? []).map((user) => (
                  <StatusBadge key={user.externalUserId} tone={user.status === 'active' ? 'success' : 'neutral'}>
                    {user.displayRef ?? user.emailHash.slice(0, 12)}
                  </StatusBadge>
                ))}
              </div>
            </SectionCard>

            <SectionCard icon={<Link2 className="h-4 w-4" />} title="링크" meta="문서 송부">
              <LinkIssuanceDialog
                disabled={busy}
                matterOption={matterOption}
                workspace={selectedWorkspace}
                onCreateLink={api.createLink}
                onCreated={(created) => setWorkspaces((current) => addLinkToWorkspace(current, created.link))}
              />
              <div className="mt-4 grid gap-2">
                {(selectedWorkspace?.links ?? []).map((item) => (
                  <div key={item.linkId} className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.documentId}</p>
                      <p className="text-xs text-muted-foreground">{item.status} · {item.dlpWarningStatus}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy || item.status !== 'active'}
                      onClick={() => revokeLink(item)}
                    >
                      회수
                    </Button>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard icon={<Inbox className="h-4 w-4" />} title="Q&A 인박스" meta="외부 질문">
              <div className="grid gap-3">
                {questions.map((message) => (
                  <div key={message.messageId} className="grid gap-3 rounded-md border px-3 py-2">
                    <div className="grid gap-1">
                      <p className="text-sm text-foreground">{message.messageText}</p>
                      <StatusBadge tone="neutral">질문</StatusBadge>
                    </div>
                    {(answersByParent.get(message.messageId) ?? []).map((answer) => (
                      <div key={answer.messageId} className="grid gap-2 rounded-md border bg-muted/30 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={answer.status === 'published' ? 'success' : answer.status === 'rejected' ? 'blocked' : 'warning'}>
                            {qaStatusLabels[answer.status]}
                          </StatusBadge>
                          <StatusBadge tone="neutral">{qaVisibilityLabels[answer.visibilityScope]}</StatusBadge>
                        </div>
                        <p className="text-sm text-muted-foreground">{answer.messageText}</p>
                        {answer.status === 'pending_approval' ? (
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" disabled={busy} onClick={() => reviewAnswer(answer, 'approve')}>
                              <CheckCircle2 className="h-4 w-4" />
                              승인
                            </Button>
                            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => reviewAnswer(answer, 'reject')}>
                              <XCircle className="h-4 w-4" />
                              반려
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                    <div className="grid gap-2 md:grid-cols-[minmax(12rem,1fr)_minmax(12rem,14rem)_auto]">
                      <Input
                        aria-label="답변"
                        disabled={busy}
                        value={answerDrafts[message.messageId] ?? ''}
                        onChange={(event) =>
                          setAnswerDrafts((current) => ({
                            ...current,
                            [message.messageId]: event.target.value,
                          }))
                        }
                      />
                      <select
                        aria-label="답변 공개범위"
                        className="h-10 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        disabled={busy}
                        value={answerScopes[message.messageId] ?? 'asker_only'}
                        onChange={(event) =>
                          setAnswerScopes((current) => ({
                            ...current,
                            [message.messageId]: event.target.value as AnswerVisibilityScope,
                          }))
                        }
                      >
                        <option value="asker_only">질문자 한정</option>
                        <option value="workspace">워크스페이스 전체</option>
                      </select>
                      <Button
                        type="button"
                        disabled={busy || !answerDrafts[message.messageId]?.trim()}
                        onClick={() => answerQuestion(message)}
                      >
                        <Send className="h-4 w-4" />
                        승인 요청
                      </Button>
                    </div>
                  </div>
                ))}
                {questions.length === 0 ? <p className="text-sm text-muted-foreground">대기 중인 질문이 없습니다.</p> : null}
              </div>
            </SectionCard>
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <Button asChild variant="outline" size="sm">
          <Link href={`/matters/${encodeURIComponent(matterId)}`}>Matter로 돌아가기</Link>
        </Button>
      </div>
    </PageShell>
  );
}
