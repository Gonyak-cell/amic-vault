'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Plus, Search, UserPlus } from 'lucide-react';
import type { EthicalWallDetailDto, WallMembershipType } from '@amic-vault/shared';
import { wallMembershipTypes } from '@amic-vault/shared';
import { WallList } from '@/components/ethical-wall/wall-list';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  addEthicalWallMembership,
  createEthicalWall,
  listEthicalWalls,
  removeEthicalWallMembership,
} from '@/lib/api/ethical-walls';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import { useI18n, type Language } from '@/lib/i18n';

const wallCopy: Record<
  Language,
  {
    title: string;
    matterFilter: string;
    filterTitle: string;
    matterRef: string;
    wallName: string;
    reason: string;
    createTitle: string;
    wallRef: string;
    userRef: string;
    membershipType: string;
    addMemberTitle: string;
    membershipLabels: Record<WallMembershipType, string>;
  }
> = {
  ko: {
    title: '정보 장벽',
    matterFilter: 'Matter ID로 찾기',
    filterTitle: '정보 장벽 검색',
    matterRef: 'Matter ID',
    wallName: '정보 장벽 이름',
    reason: '설정 사유',
    createTitle: '정보 장벽 추가',
    wallRef: '정보 장벽 ID',
    userRef: '사용자 ID',
    membershipType: '구성원 유형',
    addMemberTitle: '구성원 추가',
    membershipLabels: {
      insider: '차단 예외',
      excluded: '접근 차단',
    },
  },
  en: {
    title: 'Information barriers',
    matterFilter: 'Find by matter ref',
    filterTitle: 'Search information barriers',
    matterRef: 'Matter ref',
    wallName: 'Barrier name',
    reason: 'Barrier reason',
    createTitle: 'Add information barrier',
    wallRef: 'Barrier ref',
    userRef: 'User ref',
    membershipType: 'Member type',
    addMemberTitle: 'Add member',
    membershipLabels: {
      insider: 'Insider',
      excluded: 'Blocked',
    },
  },
};

export function WallAdminClient() {
  const { language } = useI18n();
  const copy = wallCopy[language];
  const [items, setItems] = useState<EthicalWallDetailDto[]>([]);
  const [matterFilter, setMatterFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyMembershipId, setBusyMembershipId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newWall, setNewWall] = useState({ matterId: '', wallName: '', reason: '' });
  const [newMembership, setNewMembership] = useState({
    wallId: '',
    subjectId: '',
    membershipType: 'excluded' as WallMembershipType,
  });

  const load = useCallback(async (matterId: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await listEthicalWalls({
        matterId: matterId.trim() || undefined,
        status: 'active',
        limit: 50,
      });
      setItems(result.items);
    } catch (caught) {
      setItems([]);
      setError(safeApiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load('');
  }, [load]);

  async function submitFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await load(matterFilter);
  }

  async function submitWall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createEthicalWall({
        matterId: newWall.matterId.trim(),
        wallName: newWall.wallName.trim(),
        reason: newWall.reason.trim(),
        members: [],
      });
      setNewWall({ matterId: '', wallName: '', reason: '' });
      await load(matterFilter);
    } catch (caught) {
      setError(safeApiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submitMembership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await addEthicalWallMembership(newMembership.wallId.trim(), {
        subjectType: 'user',
        subjectId: newMembership.subjectId.trim(),
        membershipType: newMembership.membershipType,
      });
      setNewMembership({ wallId: '', subjectId: '', membershipType: 'excluded' });
      await load(matterFilter);
    } catch (caught) {
      setError(safeApiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function removeMembership(wallId: string, membershipId: string) {
    setBusyMembershipId(membershipId);
    setError(null);
    try {
      await removeEthicalWallMembership(wallId, membershipId);
      await load(matterFilter);
    } catch (caught) {
      setError(safeApiErrorMessage(caught));
    } finally {
      setBusyMembershipId(null);
    }
  }

  return (
    <main className="flex flex-col gap-5">
      <section className="flex flex-col gap-2 border-b pb-4">
        <h1 className="text-2xl font-semibold tracking-normal">{copy.title}</h1>
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={submitFilter}>
          <Input
            aria-label={copy.matterFilter}
            placeholder={copy.matterFilter}
            value={matterFilter}
            onChange={(event) => setMatterFilter(event.target.value)}
          />
          <Button aria-label={copy.filterTitle} title={copy.filterTitle} type="submit" disabled={busy}>
            <Search className="h-4 w-4" />
          </Button>
        </form>
      </section>

      <form
        className="grid gap-3 rounded-md border bg-card p-4 lg:grid-cols-[1fr_1fr_1fr_auto]"
        onSubmit={submitWall}
      >
        <Input
          aria-label={copy.matterRef}
          placeholder={copy.matterRef}
          value={newWall.matterId}
          onChange={(event) => setNewWall({ ...newWall, matterId: event.target.value })}
        />
        <Input
          aria-label={copy.wallName}
          placeholder={copy.wallName}
          value={newWall.wallName}
          onChange={(event) => setNewWall({ ...newWall, wallName: event.target.value })}
        />
        <Input
          aria-label={copy.reason}
          placeholder={copy.reason}
          value={newWall.reason}
          onChange={(event) => setNewWall({ ...newWall, reason: event.target.value })}
        />
        <Button aria-label={copy.createTitle} title={copy.createTitle} type="submit" disabled={busy}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>

      <form
        className="grid gap-3 rounded-md border bg-card p-4 lg:grid-cols-[1fr_1fr_12rem_auto]"
        onSubmit={submitMembership}
      >
        <Input
          aria-label={copy.wallRef}
          placeholder={copy.wallRef}
          value={newMembership.wallId}
          onChange={(event) => setNewMembership({ ...newMembership, wallId: event.target.value })}
        />
        <Input
          aria-label={copy.userRef}
          placeholder={copy.userRef}
          value={newMembership.subjectId}
          onChange={(event) =>
            setNewMembership({ ...newMembership, subjectId: event.target.value })
          }
        />
        <select
          aria-label={copy.membershipType}
          className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={newMembership.membershipType}
          onChange={(event) =>
            setNewMembership({
              ...newMembership,
              membershipType: event.target.value as WallMembershipType,
            })
          }
        >
          {wallMembershipTypes.map((type) => (
            <option key={type} value={type}>
              {copy.membershipLabels[type]}
            </option>
          ))}
        </select>
        <Button
          aria-label={copy.addMemberTitle}
          title={copy.addMemberTitle}
          type="submit"
          disabled={busy}
        >
          <UserPlus className="h-4 w-4" />
        </Button>
      </form>

      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
      <WallList
        items={items}
        busyMembershipId={busyMembershipId}
        onRemoveMembership={removeMembership}
      />
    </main>
  );
}
