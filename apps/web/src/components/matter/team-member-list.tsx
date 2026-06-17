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
import { useI18n, type Language } from '@/lib/i18n';
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

type TeamCopy = {
  title: string;
  user: string;
  userFallback: string;
  userHidden: string;
  role: string;
  access: string;
  actions: string;
  save: string;
  remove: string;
  empty: string;
  denied: string;
  failed: string;
  roleLabels: Record<MatterMemberRole, string>;
  accessLabels: Record<MatterMemberAccessLevel, string>;
};

const teamCopy: Record<Language, TeamCopy> = {
  ko: {
    title: '팀 구성원',
    user: '사용자',
    userFallback: '표시 가능한 사용자 정보 없음',
    userHidden: '내부 참조는 표시하지 않음',
    role: '역할',
    access: '접근 권한',
    actions: '작업',
    save: '구성원 저장',
    remove: '구성원 제거',
    empty: '등록된 구성원이 없습니다.',
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
    title: 'Team members',
    user: 'User',
    userFallback: 'No display user available',
    userHidden: 'Internal reference hidden',
    role: 'Role',
    access: 'Access',
    actions: 'Actions',
    save: 'Save member',
    remove: 'Remove member',
    empty: 'No members yet.',
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

function safeError(errorCode: ErrorCode | null | undefined, copy: TeamCopy): string | null {
  if (!errorCode) return null;
  if (errorCode === 'PERMISSION_DENIED' || errorCode === 'ETHICAL_WALL_BLOCKED') return copy.denied;
  return copy.failed;
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
  const { language } = useI18n();
  const copy = teamCopy[language];
  const [drafts, setDrafts] = useState<Drafts>(() => initialDrafts(members));
  const error = safeError(errorCode, copy);

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
        <h2 className="text-lg font-semibold tracking-normal">{copy.title}</h2>
        {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
      </div>
      <div className="overflow-hidden rounded-md border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">{copy.user}</th>
              <th className="px-4 py-3 font-medium">{copy.role}</th>
              <th className="px-4 py-3 font-medium">{copy.access}</th>
              {canManage ? (
                <th className="w-28 px-4 py-3 text-right font-medium">{copy.actions}</th>
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
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="text-sm font-medium">{copy.userFallback}</span>
                      <span className="text-xs text-muted-foreground">{copy.userHidden}</span>
                    </div>
                  </td>
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
                            {copy.roleLabels[role]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      copy.roleLabels[member.matterRole]
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
                            {copy.accessLabels[level]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      copy.accessLabels[member.accessLevel]
                    )}
                  </td>
                  {canManage ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          aria-label={copy.save}
                          title={copy.save}
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={!changed || busy}
                          onClick={() => onUpdateMember?.(member.userId, draft)}
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button
                          aria-label={copy.remove}
                          title={copy.remove}
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
                  {copy.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
