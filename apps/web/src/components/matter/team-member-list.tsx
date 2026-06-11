'use client';

import React, { useEffect, useState } from 'react';
import { Save, UserMinus } from 'lucide-react';
import type {
  ErrorCode,
  MatterMemberAccessLevel,
  MatterMemberDto,
  MatterMemberRole,
  UpdateMatterMemberDto,
} from '@amic-vault/shared';
import { matterMemberAccessLevels, matterMemberRoles } from '@amic-vault/shared';
import { Button } from '../ui/button';

type Drafts = Record<
  string,
  { matterRole: MatterMemberRole; accessLevel: MatterMemberAccessLevel }
>;

export interface TeamMemberListProps {
  members: MatterMemberDto[];
  canManage: boolean;
  errorCode?: ErrorCode | null;
  busyUserId?: string | null;
  onUpdateMember?: (userId: string, input: UpdateMatterMemberDto) => void;
  onRemoveMember?: (userId: string) => void;
}

function safeError(errorCode?: ErrorCode | null): string | null {
  if (!errorCode) return null;
  if (errorCode === 'PERMISSION_DENIED' || errorCode === 'ETHICAL_WALL_BLOCKED')
    return 'Request denied';
  return 'Request failed';
}

function initialDrafts(members: readonly MatterMemberDto[]): Drafts {
  return Object.fromEntries(
    members.map((member) => [
      member.userId,
      { matterRole: member.matterRole, accessLevel: member.accessLevel },
    ]),
  );
}

export function TeamMemberList({
  members,
  canManage,
  errorCode,
  busyUserId,
  onUpdateMember,
  onRemoveMember,
}: TeamMemberListProps) {
  const [drafts, setDrafts] = useState<Drafts>(() => initialDrafts(members));
  const error = safeError(errorCode);

  useEffect(() => {
    setDrafts(initialDrafts(members));
  }, [members]);

  function updateDraft(
    userId: string,
    field: 'matterRole' | 'accessLevel',
    value: MatterMemberRole | MatterMemberAccessLevel,
  ) {
    setDrafts((current) => ({
      ...current,
      [userId]: {
        matterRole: current[userId]?.matterRole ?? 'member',
        accessLevel: current[userId]?.accessLevel ?? 'read',
        [field]: value,
      },
    }));
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-normal">Team</h2>
        {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
      </div>
      <div className="overflow-hidden rounded-md border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Access</th>
              {canManage ? (
                <th className="w-28 px-4 py-3 text-right font-medium">Actions</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const draft = drafts[member.userId] ?? {
                matterRole: member.matterRole,
                accessLevel: member.accessLevel,
              };
              const changed =
                draft.matterRole !== member.matterRole || draft.accessLevel !== member.accessLevel;
              const busy = busyUserId === member.userId;
              return (
                <tr key={member.userId} className="border-t">
                  <td className="px-4 py-3 font-mono text-xs">{member.userId}</td>
                  <td className="px-4 py-3">
                    {canManage ? (
                      <select
                        className="h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={draft.matterRole}
                        disabled={busy}
                        onChange={(event) =>
                          updateDraft(
                            member.userId,
                            'matterRole',
                            event.target.value as MatterMemberRole,
                          )
                        }
                      >
                        {matterMemberRoles.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    ) : (
                      member.matterRole
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {canManage ? (
                      <select
                        className="h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={draft.accessLevel}
                        disabled={busy || draft.matterRole === 'limited_reviewer'}
                        onChange={(event) =>
                          updateDraft(
                            member.userId,
                            'accessLevel',
                            event.target.value as MatterMemberAccessLevel,
                          )
                        }
                      >
                        {matterMemberAccessLevels.map((level) => (
                          <option key={level} value={level}>
                            {level}
                          </option>
                        ))}
                      </select>
                    ) : (
                      member.accessLevel
                    )}
                  </td>
                  {canManage ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          aria-label="Save team member"
                          title="Save team member"
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={!changed || busy}
                          onClick={() => onUpdateMember?.(member.userId, draft)}
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button
                          aria-label="Remove team member"
                          title="Remove team member"
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => onRemoveMember?.(member.userId)}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {members.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={canManage ? 4 : 3}>
                  No members
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
