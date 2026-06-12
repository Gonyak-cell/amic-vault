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

export function WallAdminClient() {
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
        <h1 className="text-2xl font-semibold tracking-normal">Walls</h1>
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={submitFilter}>
          <Input
            aria-label="Matter filter"
            placeholder="Matter UUID"
            value={matterFilter}
            onChange={(event) => setMatterFilter(event.target.value)}
          />
          <Button aria-label="Filter walls" title="Filter walls" type="submit" disabled={busy}>
            <Search className="h-4 w-4" />
          </Button>
        </form>
      </section>

      <form
        className="grid gap-3 rounded-md border bg-card p-4 lg:grid-cols-[1fr_1fr_1fr_auto]"
        onSubmit={submitWall}
      >
        <Input
          aria-label="Wall matter ID"
          placeholder="Matter UUID"
          value={newWall.matterId}
          onChange={(event) => setNewWall({ ...newWall, matterId: event.target.value })}
        />
        <Input
          aria-label="Wall name"
          placeholder="Wall name"
          value={newWall.wallName}
          onChange={(event) => setNewWall({ ...newWall, wallName: event.target.value })}
        />
        <Input
          aria-label="Wall reason code"
          placeholder="Reason code"
          value={newWall.reason}
          onChange={(event) => setNewWall({ ...newWall, reason: event.target.value })}
        />
        <Button aria-label="Create wall" title="Create wall" type="submit" disabled={busy}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>

      <form
        className="grid gap-3 rounded-md border bg-card p-4 lg:grid-cols-[1fr_1fr_12rem_auto]"
        onSubmit={submitMembership}
      >
        <Input
          aria-label="Membership wall ID"
          placeholder="Wall UUID"
          value={newMembership.wallId}
          onChange={(event) => setNewMembership({ ...newMembership, wallId: event.target.value })}
        />
        <Input
          aria-label="Membership user ID"
          placeholder="User UUID"
          value={newMembership.subjectId}
          onChange={(event) =>
            setNewMembership({ ...newMembership, subjectId: event.target.value })
          }
        />
        <select
          aria-label="Membership type"
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
              {type}
            </option>
          ))}
        </select>
        <Button
          aria-label="Add wall membership"
          title="Add wall membership"
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
