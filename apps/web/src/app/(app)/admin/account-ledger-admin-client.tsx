'use client';

import * as React from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import type { OrgDirectorySubjectDto } from '@amic-vault/shared';
import { OrgSubjectPicker } from '@/components/access/org-subject-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { assignAccountLedgerId } from '@/lib/api/account-ledger';
import { safeApiErrorMessage } from '@/lib/api/error-messages';

function subjectLabel(subject: OrgDirectorySubjectDto | null): string {
  if (!subject) return '사용자 미선택';
  return subject.safeLabel || subject.displayName || subject.displayEmail || '선택된 사용자';
}

export function AccountLedgerAdminClient() {
  const [selectedSubject, setSelectedSubject] = React.useState<OrgDirectorySubjectDto | null>(null);
  const [accountLedgerId, setAccountLedgerId] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const canSubmit = Boolean(selectedSubject) && accountLedgerId.trim().length >= 3 && !isSaving;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSubject) return;
    setIsSaving(true);
    setStatus(null);
    setError(null);
    try {
      await assignAccountLedgerId(selectedSubject.subjectId, {
        accountLedgerId: accountLedgerId.trim(),
      });
      setStatus('배정되었습니다.');
    } catch (caught) {
      setError(safeApiErrorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SectionCard
      icon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
      title="계정 원장 ID"
      meta="전역 유일 로그인 ID"
      actions={
        <StatusBadge tone={selectedSubject ? 'success' : 'neutral'}>
          {selectedSubject ? '사용자 선택됨' : '대기'}
        </StatusBadge>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <OrgSubjectPicker
          onSubjectSelected={(subject) => {
            setSelectedSubject(subject);
            setStatus(null);
            setError(null);
          }}
          purpose="user-admin"
          selectedSubject={selectedSubject}
          subjectType="user"
        />
        <form className="grid content-start gap-3" onSubmit={(event) => void handleSubmit(event)}>
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="truncate font-medium text-foreground">{subjectLabel(selectedSubject)}</p>
            {selectedSubject?.role ? (
              <p className="mt-1 text-xs text-muted-foreground">{selectedSubject.role}</p>
            ) : null}
          </div>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-foreground">원장 ID</span>
            <Input
              autoComplete="off"
              inputMode="text"
              maxLength={80}
              onChange={(event) => {
                setAccountLedgerId(event.target.value);
                setStatus(null);
                setError(null);
              }}
              placeholder="amic-user-001"
              value={accountLedgerId}
            />
          </label>
          <Button disabled={!canSubmit} type="submit">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            배정
          </Button>
          {status ? <p className="text-sm text-emerald-700">{status}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </form>
      </div>
    </SectionCard>
  );
}
