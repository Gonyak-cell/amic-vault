'use client';

import React from 'react';
import { UserMinus } from 'lucide-react';
import type { EthicalWallDetailDto, WallMembershipType } from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { useI18n, type Language } from '@/lib/i18n';

export interface WallListProps {
  items: EthicalWallDetailDto[];
  busyMembershipId?: string | null;
  onRemoveMembership?: (wallId: string, membershipId: string) => void;
}

const copyByLanguage: Record<
  Language,
  {
    title: string;
    barrier: string;
    matter: string;
    status: string;
    members: string;
    remove: string;
    emptyMembers: string;
    emptyBarriers: string;
    ref: string;
    user: string;
    membershipLabels: Record<WallMembershipType, string>;
  }
> = {
  ko: {
    title: '정보 장벽 목록',
    barrier: '차단 규칙',
    matter: 'Matter',
    status: '상태',
    members: '구성원',
    remove: '구성원 제거',
    emptyMembers: '등록된 구성원이 없습니다.',
    emptyBarriers: '등록된 정보 장벽이 없습니다.',
    ref: 'ID',
    user: '사용자',
    membershipLabels: {
      insider: '차단 예외',
      excluded: '접근 차단',
    },
  },
  en: {
    title: 'Information barriers',
    barrier: 'Barrier',
    matter: 'Matter',
    status: 'Status',
    members: 'Members',
    remove: 'Remove member',
    emptyMembers: 'No members yet.',
    emptyBarriers: 'No information barriers yet.',
    ref: 'Ref',
    user: 'User',
    membershipLabels: {
      insider: 'Insider',
      excluded: 'Blocked',
    },
  },
};

export function WallList({ items, busyMembershipId, onRemoveMembership }: WallListProps) {
  const { language } = useI18n();
  const copy = copyByLanguage[language];
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-normal">{copy.title}</h2>
      <div className="overflow-hidden rounded-md border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">{copy.barrier}</th>
              <th className="px-4 py-3 font-medium">{copy.matter}</th>
              <th className="px-4 py-3 font-medium">{copy.status}</th>
              <th className="px-4 py-3 font-medium">{copy.members}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.wall.wallId} className="border-t align-top">
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{item.wall.wallName}</span>
                    <span className="text-xs text-muted-foreground">
                      {copy.ref} {formatRef(item.wall.wallId)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {copy.ref} {formatRef(item.wall.matterId)}
                </td>
                <td className="px-4 py-3">{item.wall.status}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-2">
                    {item.memberships.map((membership) => (
                      <div
                        key={membership.membershipId}
                        className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2"
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="text-xs">
                            {copy.user} {formatRef(membership.subjectId)}
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
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={4}>
                  {copy.emptyBarriers}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatRef(value: string): string {
  return value.length > 8 ? value.slice(0, 8) : value;
}
