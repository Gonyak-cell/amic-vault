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

export interface AddMemberDialogProps {
  disabled?: boolean;
  errorCode?: ErrorCode | null;
  onAddMember?: (input: AddMatterMemberDto) => void;
}

function safeError(errorCode?: ErrorCode | null): string | null {
  if (!errorCode) return null;
  if (errorCode === 'PERMISSION_DENIED' || errorCode === 'ETHICAL_WALL_BLOCKED')
    return 'Request denied';
  return 'Request failed';
}

export function AddMemberDialog({ disabled, errorCode, onAddMember }: AddMemberDialogProps) {
  const [userId, setUserId] = useState('');
  const [matterRole, setMatterRole] = useState<MatterMemberRole>('member');
  const [accessLevel, setAccessLevel] = useState<MatterMemberAccessLevel>('read');
  const error = safeError(errorCode);

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
        aria-label="User ID"
        value={userId}
        disabled={disabled}
        placeholder="User UUID"
        onChange={(event) => setUserId(event.target.value)}
      />
      <select
        aria-label="Matter role"
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
            {role}
          </option>
        ))}
      </select>
      <select
        aria-label="Access level"
        className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={accessLevel}
        disabled={disabled || matterRole === 'limited_reviewer'}
        onChange={(event) => setAccessLevel(event.target.value as MatterMemberAccessLevel)}
      >
        {matterMemberAccessLevels.map((level) => (
          <option key={level} value={level}>
            {level}
          </option>
        ))}
      </select>
      <Button
        aria-label="Add team member"
        title="Add team member"
        type="submit"
        disabled={disabled}
      >
        <UserPlus className="h-4 w-4" />
      </Button>
      {error ? <p className="text-sm font-medium text-destructive sm:col-span-4">{error}</p> : null}
    </form>
  );
}
