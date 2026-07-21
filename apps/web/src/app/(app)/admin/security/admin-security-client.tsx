'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RotateCcw, ShieldAlert, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import {
  breakGlassReasonCodes,
  type BreakGlassReasonCode,
  type BreakGlassRequestDto,
  type BreakGlassRequestStatus,
  type DlpBehaviorAlertDto,
  type MfaEnrollResponseDto,
  type UserRole,
  type UserSummary,
} from '@amic-vault/shared';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableEmptyRow,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/status-badge';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import {
  approveBreakGlassRequest,
  createBreakGlassRequest,
  listBreakGlassRequests,
  revokeBreakGlassRequest,
} from '@/lib/api/break-glass';
import { listDlpBehaviorAlerts } from '@/lib/api/dlp';
import { deactivateUser, listUsers, reactivateUser } from '@/lib/api/user-lifecycle';
import { activateMfa, enrollMfa, getCurrentUser } from '@/lib/auth';
import { qrSvgDataUri } from '@/lib/qr-code';

const roleLabels = {
  firm_admin: '운영 관리자',
  security_admin: '보안 관리자',
  knowledge_manager: '지식 관리자',
  matter_owner: '사건 책임자',
  matter_member: '구성원',
  limited_reviewer: '제한 검토자',
  external_user: '외부 사용자',
} as const satisfies Record<UserRole, string>;

const userStatusMeta = {
  active: { label: '활성', tone: 'success' },
  inactive: { label: '비활성', tone: 'blocked' },
  locked: { label: '잠김', tone: 'warning' },
} as const satisfies Record<UserSummary['status'], { label: string; tone: StatusBadgeTone }>;

const breakGlassStatusMeta = {
  pending: { label: '승인 대기', tone: 'warning' },
  approved: { label: '승인됨', tone: 'success' },
  revoked: { label: '회수됨', tone: 'blocked' },
  expired: { label: '만료됨', tone: 'neutral' },
} as const satisfies Record<BreakGlassRequestStatus, { label: string; tone: StatusBadgeTone }>;

const reasonLabels = {
  client_emergency: '고객 긴급 대응',
  court_deadline: '법원 기한',
  privileged_access_review: '특권 검토',
  security_review: '보안 검토',
} as const satisfies Record<BreakGlassReasonCode, string>;

function defaultExpiryLocal(): string {
  const date = new Date(Date.now() + 4 * 60 * 60 * 1000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function expiryToIso(value: string): string {
  return new Date(value).toISOString().replace('Z', '+00:00');
}

function formatDateTime(value: string | null): string {
  if (!value) return '기록 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0B';
  if (value < 1024) return `${Math.round(value)}B`;
  const units = ['KB', 'MB', 'GB', 'TB'] as const;
  let scaled = value;
  let unit: (typeof units)[number] = units[0];
  for (const nextUnit of units) {
    scaled /= 1024;
    unit = nextUnit;
    if (scaled < 1024 || nextUnit === 'TB') break;
  }
  return `${scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1)}${unit}`;
}

function effectiveBreakGlassStatus(request: BreakGlassRequestDto): BreakGlassRequestStatus {
  if (
    (request.status === 'pending' || request.status === 'approved') &&
    new Date(request.expiresAt).getTime() <= Date.now()
  ) {
    return 'expired';
  }
  return request.status;
}

function mergeUser(users: UserSummary[], nextUser: UserSummary): UserSummary[] {
  return users.map((user) => (user.userId === nextUser.userId ? nextUser : user));
}

function mergeBreakGlass(
  requests: BreakGlassRequestDto[],
  nextRequest: BreakGlassRequestDto,
): BreakGlassRequestDto[] {
  if (requests.some((request) => request.requestId === nextRequest.requestId)) {
    return requests.map((request) =>
      request.requestId === nextRequest.requestId ? nextRequest : request,
    );
  }
  return [nextRequest, ...requests];
}

export interface AdminSecurityClientProps {
  initialCurrentUser?: UserSummary | null;
  initialMfaEnrollment?: MfaEnrollResponseDto | null;
  initialUsers?: UserSummary[];
  initialBreakGlassRequests?: BreakGlassRequestDto[];
  initialDlpAlerts?: DlpBehaviorAlertDto[];
}

export function AdminSecurityClient({
  initialCurrentUser = null,
  initialMfaEnrollment = null,
  initialUsers = [],
  initialBreakGlassRequests = [],
  initialDlpAlerts = [],
}: AdminSecurityClientProps = {}) {
  const [currentUser, setCurrentUser] = useState<UserSummary | null>(initialCurrentUser);
  const [mfaEnrollment, setMfaEnrollment] = useState<MfaEnrollResponseDto | null>(
    initialMfaEnrollment,
  );
  const [mfaCode, setMfaCode] = useState('');
  const [mfaMessage, setMfaMessage] = useState<string | null>(null);
  const [users, setUsers] = useState<UserSummary[]>(initialUsers);
  const [requests, setRequests] = useState<BreakGlassRequestDto[]>(initialBreakGlassRequests);
  const [dlpAlerts, setDlpAlerts] = useState<DlpBehaviorAlertDto[]>(initialDlpAlerts);
  const [busy, setBusy] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    wallId: '',
    reasonCode: 'security_review' as BreakGlassReasonCode,
    expiresAt: defaultExpiryLocal(),
  });

  const activeUserCount = useMemo(
    () => users.filter((user) => user.status === 'active').length,
    [users],
  );
  const pendingRequestCount = useMemo(
    () => requests.filter((request) => effectiveBreakGlassStatus(request) === 'pending').length,
    [requests],
  );
  const openDlpAlertCount = useMemo(
    () => dlpAlerts.filter((alert) => alert.status === 'open').length,
    [dlpAlerts],
  );
  const canDeactivateUsers = currentUser?.role === 'firm_admin';
  const currentUserMfaEnabled = currentUser?.mfaEnabled === true;

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [current, listedUsers, listedRequests, listedDlpAlerts] = await Promise.all([
        getCurrentUser(),
        listUsers(),
        listBreakGlassRequests(),
        listDlpBehaviorAlerts(),
      ]);
      setCurrentUser(current.user);
      setUsers(listedUsers.items);
      setRequests(listedRequests.items);
      setDlpAlerts(listedDlpAlerts.items);
    } catch (caught) {
      setError(safeApiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runRowAction(id: string, action: () => Promise<void>) {
    setRowBusyId(id);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(safeApiErrorMessage(caught));
    } finally {
      setRowBusyId(null);
    }
  }

  async function handleStartMfaEnrollment() {
    await runRowAction('mfa:enroll', async () => {
      const enrolled = await enrollMfa();
      setMfaEnrollment(enrolled);
      setMfaCode('');
      setMfaMessage('Authenticator 앱에서 QR을 스캔한 뒤 6자리 코드를 입력하세요.');
    });
  }

  async function handleActivateMfa(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mfaEnrollment) return;
    await runRowAction('mfa:activate', async () => {
      await activateMfa({ secretId: mfaEnrollment.secretId, code: mfaCode });
      setMfaEnrollment(null);
      setMfaCode('');
      setMfaMessage('MFA가 활성화되었습니다. 다음 로그인부터 인증 코드가 필요합니다.');
      if (currentUser) {
        const updated = { ...currentUser, mfaEnabled: true };
        setCurrentUser(updated);
        setUsers((current) => mergeUser(current, updated));
      }
    });
  }

  async function handleDeactivate(user: UserSummary) {
    await runRowAction(user.userId, async () => {
      const updated = await deactivateUser(user.userId);
      setUsers((current) => mergeUser(current, updated));
    });
  }

  async function handleReactivate(user: UserSummary) {
    await runRowAction(user.userId, async () => {
      const updated = await reactivateUser(user.userId);
      setUsers((current) => mergeUser(current, updated));
    });
  }

  async function handleCreateRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runRowAction('break-glass:create', async () => {
      const created = await createBreakGlassRequest({
        wallId: form.wallId.trim(),
        reasonCode: form.reasonCode,
        expiresAt: expiryToIso(form.expiresAt),
      });
      setRequests((current) => mergeBreakGlass(current, created));
      setForm((current) => ({ ...current, wallId: '' }));
    });
  }

  async function handleApprove(request: BreakGlassRequestDto) {
    await runRowAction(request.requestId, async () => {
      const updated = await approveBreakGlassRequest(request.requestId);
      setRequests((current) => mergeBreakGlass(current, updated));
    });
  }

  async function handleRevoke(request: BreakGlassRequestDto) {
    await runRowAction(request.requestId, async () => {
      const updated = await revokeBreakGlassRequest(request.requestId, {
        reasonCode: 'security_review',
      });
      setRequests((current) => mergeBreakGlass(current, updated));
    });
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['문서 보관', '관리', '보안']}
        title="보안 운영"
        description="구성원 접근 상태와 break-glass 요청을 한 화면에서 확인하고 처리합니다."
        actions={
          <Button onClick={() => void refresh()} disabled={busy} type="button" variant="outline">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            새로고침
          </Button>
        }
      />

      {error ? (
        <EmptyState variant="api-error" title={error} className="items-start text-left" />
      ) : null}

      <SectionCard
        icon={<ShieldAlert className="h-4 w-4" aria-hidden="true" />}
        title="DLP 대량 다운로드"
        meta={`${openDlpAlertCount}건 감지`}
        actions={
          <StatusBadge tone={openDlpAlertCount > 0 ? 'warning' : 'success'}>모니터링</StatusBadge>
        }
      >
        <DataTable caption="DLP 대량 다운로드 감지 목록" minWidthClassName="min-w-[860px]">
          <DataTableHeader>
            <DataTableRow>
              <DataTableHead>사용자</DataTableHead>
              <DataTableHead>다운로드</DataTableHead>
              <DataTableHead>임계</DataTableHead>
              <DataTableHead>윈도</DataTableHead>
              <DataTableHead>감지</DataTableHead>
            </DataTableRow>
          </DataTableHeader>
          <DataTableBody>
            {dlpAlerts.length === 0 ? (
              <DataTableEmptyRow colSpan={5}>대량 다운로드 감지 내역이 없습니다.</DataTableEmptyRow>
            ) : (
              dlpAlerts.map((alert) => (
                <DataTableRow key={alert.alertId}>
                  <DataTableCell>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{alert.actorSafeLabel}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {alert.actorDisplayEmail ?? alert.actorUserId}
                      </p>
                    </div>
                  </DataTableCell>
                  <DataTableCell>
                    {alert.eventCount}건 · {formatBytes(alert.totalBytes)}
                  </DataTableCell>
                  <DataTableCell>
                    {alert.thresholdCount}건 · {formatBytes(alert.thresholdBytes)}
                  </DataTableCell>
                  <DataTableCell>
                    {formatDateTime(alert.windowStart)} - {formatDateTime(alert.windowEnd)}
                  </DataTableCell>
                  <DataTableCell>
                    <StatusBadge tone={alert.status === 'open' ? 'warning' : 'neutral'}>
                      {formatDateTime(alert.createdAt)}
                    </StatusBadge>
                  </DataTableCell>
                </DataTableRow>
              ))
            )}
          </DataTableBody>
        </DataTable>
      </SectionCard>

      <SectionCard
        icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
        title="내 MFA 등록"
        meta={currentUserMfaEnabled ? '설정됨' : '설정 필요'}
        actions={
          <StatusBadge tone={currentUserMfaEnabled ? 'success' : 'warning'}>
            {currentUserMfaEnabled ? '활성' : '미설정'}
          </StatusBadge>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.55fr)]">
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Google Authenticator 또는 호환 앱에 AMIC Vault 계정을 등록하고, 활성화 코드를
              확인합니다.
            </p>
            {mfaMessage ? <p className="font-medium text-foreground">{mfaMessage}</p> : null}
            {currentUserMfaEnabled && !mfaEnrollment ? (
              <p className="font-medium text-foreground">현재 계정은 MFA가 활성화되어 있습니다.</p>
            ) : null}
          </div>
          <div className="space-y-3">
            {!mfaEnrollment ? (
              <Button
                disabled={currentUserMfaEnabled || rowBusyId === 'mfa:enroll' || !currentUser}
                onClick={() => void handleStartMfaEnrollment()}
                type="button"
                className="w-full"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                MFA 등록 시작
              </Button>
            ) : (
              <form className="space-y-4" onSubmit={(event) => void handleActivateMfa(event)}>
                <div className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
                  <img
                    alt="Google Authenticator QR"
                    className="h-36 w-36 rounded-md border bg-white p-2"
                    src={qrSvgDataUri(mfaEnrollment.otpauthUri)}
                  />
                  <div className="min-w-0 space-y-2">
                    <p className="text-sm font-medium text-foreground">수동 입력 키</p>
                    <code className="block break-all rounded-md border bg-muted px-3 py-2 text-xs">
                      {mfaEnrollment.manualEntryKey}
                    </code>
                    <p className="text-xs text-muted-foreground">
                      복구 코드는 등록 완료 전 안전한 내부 보관 위치에 저장하세요.
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {mfaEnrollment.recoveryCodes.map((code) => (
                    <code key={code} className="rounded-md border bg-muted px-2 py-1 text-xs">
                      {code}
                    </code>
                  ))}
                </div>
                <label className="grid gap-1.5 text-sm font-medium">
                  6자리 인증 코드
                  <input
                    autoComplete="one-time-code"
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(event) =>
                      setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    pattern="[0-9]{6}"
                    required
                    value={mfaCode}
                  />
                </label>
                <Button className="w-full" disabled={rowBusyId === 'mfa:activate'} type="submit">
                  인증 후 활성화
                </Button>
              </form>
            )}
          </div>
        </div>
      </SectionCard>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <SectionCard
          icon={<UserCheck className="h-4 w-4" aria-hidden="true" />}
          title="사용자 접근"
          meta={`${activeUserCount}명 활성`}
          actions={
            <StatusBadge tone={canDeactivateUsers ? 'success' : 'warning'}>
              {canDeactivateUsers ? 'firm_admin' : '읽기 전용'}
            </StatusBadge>
          }
        >
          <DataTable caption="사용자 접근 목록" minWidthClassName="min-w-[760px]">
            <DataTableHeader>
              <DataTableRow>
                <DataTableHead>구성원</DataTableHead>
                <DataTableHead>역할</DataTableHead>
                <DataTableHead>상태</DataTableHead>
                <DataTableHead>MFA</DataTableHead>
                <DataTableHead>최근 로그인</DataTableHead>
                <DataTableHead className="text-right">작업</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {users.length === 0 ? (
                <DataTableEmptyRow colSpan={6}>
                  표시할 구성원이 없습니다. 새로고침 후에도 비어 있으면 계정 동기화 상태를
                  확인하세요.
                </DataTableEmptyRow>
              ) : (
                users.map((user) => {
                  const status = userStatusMeta[user.status];
                  const disabled = rowBusyId === user.userId || !canDeactivateUsers;
                  return (
                    <DataTableRow key={user.userId}>
                      <DataTableCell>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{user.displayName}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {user.displayEmail}
                          </p>
                        </div>
                      </DataTableCell>
                      <DataTableCell>{roleLabels[user.role]}</DataTableCell>
                      <DataTableCell>
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      </DataTableCell>
                      <DataTableCell>{user.mfaEnabled ? '설정됨' : '미설정'}</DataTableCell>
                      <DataTableCell>{formatDateTime(user.lastLoginAt)}</DataTableCell>
                      <DataTableCell className="text-right">
                        {user.status === 'active' ? (
                          <Button
                            aria-label={`${user.displayName} 비활성화`}
                            className="h-9 w-9 px-0"
                            disabled={disabled}
                            onClick={() => void handleDeactivate(user)}
                            size="sm"
                            title="비활성화"
                            type="button"
                            variant="outline"
                          >
                            <UserX className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        ) : (
                          <Button
                            aria-label={`${user.displayName} 재활성화`}
                            className="h-9 w-9 px-0"
                            disabled={disabled || user.status === 'locked'}
                            onClick={() => void handleReactivate(user)}
                            size="sm"
                            title="재활성화"
                            type="button"
                            variant="outline"
                          >
                            <RotateCcw className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                      </DataTableCell>
                    </DataTableRow>
                  );
                })
              )}
            </DataTableBody>
          </DataTable>
        </SectionCard>

        <SectionCard
          icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
          title="Break-glass 요청"
          meta={`${pendingRequestCount}건 승인 대기`}
        >
          <form className="grid gap-3" onSubmit={(event) => void handleCreateRequest(event)}>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Ethical wall ID</span>
              <input
                className="h-10 rounded-md border bg-background px-3 text-sm"
                onChange={(event) =>
                  setForm((current) => ({ ...current, wallId: event.target.value }))
                }
                placeholder="wall UUID"
                required
                value={form.wallId}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">사유</span>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    reasonCode: event.target.value as BreakGlassReasonCode,
                  }))
                }
                value={form.reasonCode}
              >
                {breakGlassReasonCodes.map((reason) => (
                  <option key={reason} value={reason}>
                    {reasonLabels[reason]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">만료</span>
              <input
                className="h-10 rounded-md border bg-background px-3 text-sm"
                min={defaultExpiryLocal().slice(0, 10)}
                onChange={(event) =>
                  setForm((current) => ({ ...current, expiresAt: event.target.value }))
                }
                required
                type="datetime-local"
                value={form.expiresAt}
              />
            </label>
            <Button disabled={rowBusyId === 'break-glass:create'} type="submit" className="w-full">
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
              요청 생성
            </Button>
          </form>
        </SectionCard>
      </section>

      <SectionCard
        icon={<ShieldAlert className="h-4 w-4" aria-hidden="true" />}
        title="승인 대기열"
        meta="두 명의 비요청자 승인이 필요합니다."
      >
        <DataTable caption="Break-glass 요청 목록" minWidthClassName="min-w-[880px]">
          <DataTableHeader>
            <DataTableRow>
              <DataTableHead>요청</DataTableHead>
              <DataTableHead>상태</DataTableHead>
              <DataTableHead>승인</DataTableHead>
              <DataTableHead>만료</DataTableHead>
              <DataTableHead>사유</DataTableHead>
              <DataTableHead className="text-right">작업</DataTableHead>
            </DataTableRow>
          </DataTableHeader>
          <DataTableBody>
            {requests.length === 0 ? (
              <DataTableEmptyRow colSpan={6}>
                승인 대기 중인 break-glass 요청이 없습니다.
              </DataTableEmptyRow>
            ) : (
              requests.map((request) => {
                const statusKey = effectiveBreakGlassStatus(request);
                const status = breakGlassStatusMeta[statusKey];
                const actionBusy = rowBusyId === request.requestId;
                const canApprove = request.status === 'pending' && statusKey !== 'expired';
                const canRevoke =
                  (request.status === 'pending' || request.status === 'approved') &&
                  statusKey !== 'expired';
                return (
                  <DataTableRow key={request.requestId}>
                    <DataTableCell>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{request.requestId}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          matter {request.matterId}
                        </p>
                      </div>
                    </DataTableCell>
                    <DataTableCell>
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </DataTableCell>
                    <DataTableCell>{request.approvalCount}/2</DataTableCell>
                    <DataTableCell>{formatDateTime(request.expiresAt)}</DataTableCell>
                    <DataTableCell>{reasonLabels[request.reasonCode]}</DataTableCell>
                    <DataTableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          aria-label="Break-glass 요청 승인"
                          className="h-9 w-9 px-0"
                          disabled={!canApprove || actionBusy}
                          onClick={() => void handleApprove(request)}
                          size="sm"
                          title="승인"
                          type="button"
                          variant="outline"
                        >
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          aria-label="Break-glass 요청 회수"
                          className="h-9 w-9 px-0"
                          disabled={!canRevoke || actionBusy}
                          onClick={() => void handleRevoke(request)}
                          size="sm"
                          title="회수"
                          type="button"
                          variant="outline"
                        >
                          <UserX className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </DataTableCell>
                  </DataTableRow>
                );
              })
            )}
          </DataTableBody>
        </DataTable>
      </SectionCard>
    </PageShell>
  );
}
