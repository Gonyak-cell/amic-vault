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
  disabled?: boolean;
  errorCode?: ErrorCode | null;
  onAddMember?: (input: AddMatterMemberDto) => void;
}

type AddMemberCopy = {
  userRef: string;
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
    userRef: '사용자 ID',
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
    userRef: 'User ref',
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
  if (errorCode === 'PERMISSION_DENIED' || errorCode === 'ETHICAL_WALL_BLOCKED')
    return copy.denied;
  return copy.failed;
}

export function AddMemberDialog({ disabled, errorCode, onAddMember }: AddMemberDialogProps) {
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
    <form
      className="grid gap-3 rounded-md border bg-card p-4 sm:grid-cols-[minmax(18rem,1fr)_10rem_8rem_auto]"
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
        disabled={disabled}
      >
        <UserPlus className="h-4 w-4" />
      </Button>
      {error ? <p className="text-sm font-medium text-destructive sm:col-span-4">{error}</p> : null}
    </form>
  );
}
