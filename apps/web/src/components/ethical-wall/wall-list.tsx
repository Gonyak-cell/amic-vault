import React from 'react';
import { UserMinus } from 'lucide-react';
import type { EthicalWallDetailDto } from '@amic-vault/shared';
import { Button } from '@/components/ui/button';

export interface WallListProps {
  items: EthicalWallDetailDto[];
  busyMembershipId?: string | null;
  onRemoveMembership?: (wallId: string, membershipId: string) => void;
}

export function WallList({ items, busyMembershipId, onRemoveMembership }: WallListProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-normal">Walls</h2>
      <div className="overflow-hidden rounded-md border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Wall</th>
              <th className="px-4 py-3 font-medium">Matter</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Memberships</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.wall.wallId} className="border-t align-top">
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{item.wall.wallName}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {item.wall.wallId}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{item.wall.matterId}</td>
                <td className="px-4 py-3">{item.wall.status}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-2">
                    {item.memberships.map((membership) => (
                      <div
                        key={membership.membershipId}
                        className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2"
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="font-mono text-xs">{membership.subjectId}</span>
                          <span className="text-xs text-muted-foreground">
                            {membership.subjectType}:{membership.membershipType}
                          </span>
                        </div>
                        <Button
                          aria-label="Remove wall membership"
                          title="Remove wall membership"
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
                      <span className="text-sm text-muted-foreground">No memberships</span>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={4}>
                  No walls
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
