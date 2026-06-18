'use client';

import React, { FormEvent, useState } from 'react';
import { UserPlus } from 'lucide-react';
import type {
  AddMatterMemberDto,
  ErrorCode,
  MatterMemberAccessLevel,
  MatterMemberRole,
} from '@amic-vault/shared';
import { matterMemberAccessLevels, matterMemberRoles } from '@amic-vault/shared';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useI18n, type Language } from '@/lib/i18n';

export interface AddMemberDialogProps {
  allowAdvancedReferenceInput?: boolean;
  disabled?: boolean;
  errorCode?: ErrorCode | null;
  onAddMember?: (input: AddMatterMemberDto) => void;
}

type AddMemberCopy = {
  userRef: string;
  unavailableTitle: string;
  unavailableDescription: string;
  advancedTitle: string;
  advancedDescription: string;
  role: string;
  access: string;
  add: string;
  denied: string;
  failed: string;
  roleLabels: Record<MatterMemberRole, string>;
  accessLabels: Record<MatterMemberAccessLevel, string>;
};

const addMemberCopy: Record<Language, AddMemberCopy> = {
  ko: {
    userRef: '승인된 사용자 참조',
    unavailableTitle: '구성원 선택 준비 중',
    unavailableDescription:
      '조직 구성원 선택 API가 연결되기 전까지 내부 사용자 참조 직접 입력은 운영 화면에 표시하지 않습니다.',
    advancedTitle: '고급 사용자 참조 입력',
    advancedDescription:
      '조직 구성원 선택 API가 연결되기 전까지 승인된 권한 관리자만 임시로 사용합니다.',
    role: '역할',
    access: '접근 권한',
    add: '구성원 추가',
    denied: '이 작업을 할 권한이 없습니다.',
    failed: '요청을 처리하지 못했습니다. 다시 시도해 주세요.',
    roleLabels: {
      owner: '소유자',
      member: '팀원',
      limited_reviewer: '제한된 검토자',
    },
    accessLabels: {
      read: '보기',
      edit: '편집',
    },
  },
  en: {
    userRef: 'Approved user reference',
    unavailableTitle: 'Member picker pending',
    unavailableDescription:
      'Direct internal user reference entry stays hidden in production until the organization member picker is available.',
    advancedTitle: 'Advanced user reference input',
    advancedDescription:
      'Temporarily available only to approved access administrators until the organization member picker is available.',
    role: 'Role',
    access: 'Access',
    add: 'Add member',
    denied: 'Request denied.',
    failed: 'Request failed.',
    roleLabels: {
      owner: 'Owner',
      member: 'Member',
      limited_reviewer: 'Limited reviewer',
    },
    accessLabels: {
      read: 'View',
      edit: 'Edit',
    },
  },
};

function safeError(errorCode: ErrorCode | null | undefined, copy: AddMemberCopy): string | null {
  if (!errorCode) return null;
  if (errorCode === 'PERMISSION_DENIED' || errorCode === 'ETHICAL_WALL_BLOCKED') return copy.denied;
  return copy.failed;
}

export function AddMemberDialog({
  allowAdvancedReferenceInput = false,
  disabled,
  errorCode,
  onAddMember,
}: AddMemberDialogProps) {
  const { language } = useI18n();
  const copy = addMemberCopy[language];
  const [userId, setUserId] = useState('');
  const [matterRole, setMatterRole] = useState<MatterMemberRole>('member');
  const [accessLevel, setAccessLevel] = useState<MatterMemberAccessLevel>('read');
  const error = safeError(errorCode, copy);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUserId = userId.trim();
    if (!trimmedUserId) return;
    onAddMember?.({ userId: trimmedUserId, matterRole, accessLevel });
  }

  return (
    <section className="rounded-md border bg-card p-4">
      {allowAdvancedReferenceInput ? (
        <details>
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            {copy.advancedTitle}
          </summary>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.advancedDescription}</p>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-[minmax(18rem,1fr)_10rem_8rem_auto]"
            onSubmit={submit}
          >
            <Input
              aria-label={copy.userRef}
              value={userId}
              disabled={disabled}
              placeholder={copy.userRef}
              onChange={(event) => setUserId(event.target.value)}
            />
            <select
              aria-label={copy.role}
              className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={matterRole}
              disabled={disabled}
              onChange={(event) => {
                const nextRole = event.target.value as MatterMemberRole;
                setMatterRole(nextRole);
                if (nextRole === 'limited_reviewer') setAccessLevel('read');
              }}
            >
              {matterMemberRoles.map((role) => (
                <option key={role} value={role}>
                  {copy.roleLabels[role]}
                </option>
              ))}
            </select>
            <select
              aria-label={copy.access}
              className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={accessLevel}
              disabled={disabled || matterRole === 'limited_reviewer'}
              onChange={(event) => setAccessLevel(event.target.value as MatterMemberAccessLevel)}
            >
              {matterMemberAccessLevels.map((level) => (
                <option key={level} value={level}>
                  {copy.accessLabels[level]}
                </option>
              ))}
            </select>
            <Button
              aria-label={copy.add}
              title={copy.add}
              type="submit"
              disabled={disabled || userId.trim().length === 0}
            >
              <UserPlus className="h-4 w-4" />
              {copy.add}
            </Button>
            {error ? (
              <p className="text-sm font-medium text-destructive sm:col-span-4">{error}</p>
            ) : null}
          </form>
        </details>
      ) : (
        <div className="space-y-2">
          <h2 className="text-sm font-medium tracking-normal">{copy.unavailableTitle}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{copy.unavailableDescription}</p>
          {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
        </div>
      )}
    </section>
  );
}
