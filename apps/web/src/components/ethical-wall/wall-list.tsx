'use client';

import React from 'react';
import { UserMinus } from 'lucide-react';
import type { EthicalWallDetailDto, WallMembershipType } from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { useI18n, type Language } from '@/lib/i18n';

export interface WallListProps {
  items: EthicalWallDetailDto[];
  busyMembershipId?: string | null;
  onRemoveMembership?: (wallId: string, membershipId: string) => void;
  onSelectWall?: (wall: EthicalWallDetailDto) => void;
  selectedWallId?: string | null;
}

const copyByLanguage: Record<
  Language,
  {
    title: string;
    barrier: string;
    status: string;
    members: string;
    caption: string;
    remove: string;
    emptyMembers: string;
    emptyTitle: string;
    emptyDescription: string;
    memberUnavailable: string;
    active: string;
    released: string;
    subjectLabels: Record<string, string>;
    membershipLabels: Record<WallMembershipType, string>;
  }
> = {
  ko: {
    title: '정보 장벽 목록',
    barrier: '차단 규칙',
    status: '상태',
    members: '구성원',
    caption: '정보 장벽 목록 표',
    remove: '구성원 제거',
    emptyMembers: '등록된 구성원이 없습니다.',
    emptyTitle: '등록된 정보 장벽이 없습니다.',
    emptyDescription: '운영 데이터가 연결되면 접근 제한 규칙만 표시됩니다.',
    memberUnavailable: '표시 가능한 구성원 정보 없음',
    active: '활성',
    released: '해제됨',
    subjectLabels: {
      user: '사용자',
      group: '그룹',
    },
    membershipLabels: {
      insider: '차단 예외',
      excluded: '접근 차단',
    },
  },
  en: {
    title: 'Information barriers',
    barrier: 'Barrier',
    status: 'Status',
    members: 'Members',
    caption: 'Information barriers table',
    remove: 'Remove member',
    emptyMembers: 'No members yet.',
    emptyTitle: 'No information barriers yet.',
    emptyDescription: 'Only permission-checked barrier rules will appear here.',
    memberUnavailable: 'No display member available',
    active: 'Active',
    released: 'Released',
    subjectLabels: {
      user: 'User',
      group: 'Group',
    },
    membershipLabels: {
      insider: 'Insider',
      excluded: 'Blocked',
    },
  },
};

export function WallList({
  items,
  busyMembershipId,
  onRemoveMembership,
  onSelectWall,
  selectedWallId = null,
}: WallListProps) {
  const { language } = useI18n();
  const copy = copyByLanguage[language];
  if (items.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-normal">{copy.title}</h2>
        <EmptyState variant="no-data" title={copy.emptyTitle} description={copy.emptyDescription} />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-normal">{copy.title}</h2>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="min-w-[720px] w-full border-collapse text-sm">
          <caption className="sr-only">{copy.caption}</caption>
          <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">{copy.barrier}</th>
              <th className="px-4 py-3 font-medium">{copy.status}</th>
              <th className="px-4 py-3 font-medium">{copy.members}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                aria-selected={selectedWallId === item.wall.wallId}
                className="cursor-pointer border-t align-top transition-colors hover:bg-muted/50 aria-selected:bg-primary/5"
                key={item.wall.wallId}
                onClick={() => onSelectWall?.(item)}
                onKeyDown={(keyboardEvent) => {
                  if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
                    keyboardEvent.preventDefault();
                    onSelectWall?.(item);
                  }
                }}
                tabIndex={onSelectWall ? 0 : undefined}
              >
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{item.wall.wallName}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge tone={item.wall.status === 'active' ? 'success' : 'blocked'}>
                    {item.wall.status === 'active' ? copy.active : copy.released}
                  </StatusBadge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-2">
                    {item.memberships.map((membership) => (
                      <div
                        key={membership.membershipId}
                        className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2"
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="text-xs">
                            {copy.subjectLabels[membership.subjectType] ?? copy.memberUnavailable}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {copy.membershipLabels[membership.membershipType]}
                          </span>
                        </div>
                        <Button
                          aria-label={copy.remove}
                          title={copy.remove}
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busyMembershipId === membership.membershipId}
                          onClick={() =>
                            onRemoveMembership?.(item.wall.wallId, membership.membershipId)
                          }
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {item.memberships.length === 0 ? (
                      <span className="text-sm text-muted-foreground">{copy.emptyMembers}</span>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
