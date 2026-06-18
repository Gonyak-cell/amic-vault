'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, UserPlus } from 'lucide-react';
import type { EthicalWallDetailDto, WallMembershipType } from '@amic-vault/shared';
import { wallMembershipTypes } from '@amic-vault/shared';
import { WallList } from '@/components/ethical-wall/wall-list';
import { WallPolicyInspector } from '@/components/ethical-wall/wall-policy-inspector';
import { MatterCodePicker } from '@/components/matter/matter-code-picker';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar } from '@/components/ui/filter-bar';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import {
  addEthicalWallMembership,
  createEthicalWall,
  listEthicalWalls,
  removeEthicalWallMembership,
} from '@/lib/api/ethical-walls';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import { useI18n, type Language } from '@/lib/i18n';
import type { MatterCodeOption } from '@/lib/matter-app';

const wallCopy: Record<
  Language,
  {
    title: string;
    description: string;
    searchCard: string;
    searchMeta: string;
    matterFilter: string;
    filterTitle: string;
    advancedFilter: string;
    advancedActions: string;
    advancedActionsMeta: string;
    policyActions: string;
    policyActionsMeta: string;
    selectedMatter: string;
    noMatterSelected: string;
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
    description: '권한이 확인된 정보 장벽과 구성원 차단 상태만 표시합니다.',
    searchCard: '정보 장벽 조회',
    searchMeta: '운영 데이터 기준',
    matterFilter: 'Matter Code',
    filterTitle: '검색',
    advancedFilter: '고급 참조 필터',
    advancedActions: '보안 운영 참조 입력',
    advancedActionsMeta: '사용자 선택 API가 연결되기 전까지 보안 관리자만 사용합니다.',
    policyActions: '정책 작업',
    policyActionsMeta: 'Matter Code 기준',
    selectedMatter: '선택된 Matter',
    noMatterSelected: 'Matter Code를 먼저 선택하세요.',
    matterRef: 'Matter 참조',
    wallName: '정보 장벽 이름',
    reason: '설정 사유',
    createTitle: '정보 장벽 추가',
    wallRef: '정보 장벽 참조',
    userRef: '사용자 참조',
    membershipType: '구성원 유형',
    addMemberTitle: '구성원 추가',
    membershipLabels: {
      insider: '차단 예외',
      excluded: '접근 차단',
    },
  },
  en: {
    title: 'Information barriers',
    description:
      'Displays permission-checked information barriers and membership blocking status only.',
    searchCard: 'Information barrier lookup',
    searchMeta: 'Operational data',
    matterFilter: 'Matter Code',
    filterTitle: 'Search',
    advancedFilter: 'Advanced reference filter',
    advancedActions: 'Security operations reference input',
    advancedActionsMeta:
      'Security administrators only until user picker APIs are available.',
    policyActions: 'Policy actions',
    policyActionsMeta: 'Matter Code based',
    selectedMatter: 'Selected Matter',
    noMatterSelected: 'Select a Matter Code first.',
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
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [filterMatter, setFilterMatter] = useState<MatterCodeOption | null>(null);
  const [newWallMatter, setNewWallMatter] = useState<MatterCodeOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyMembershipId, setBusyMembershipId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newWall, setNewWall] = useState({ wallName: '', reason: '' });
  const [newMembership, setNewMembership] = useState({
    wallId: '',
    subjectId: '',
    membershipType: 'excluded' as WallMembershipType,
  });
  const selectedWall = useMemo(
    () => items.find((item) => item.wall.wallId === selectedWallId) ?? null,
    [items, selectedWallId],
  );

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
      setSelectedWallId(result.items[0]?.wall.wallId ?? null);
    } catch (caught) {
      setItems([]);
      setSelectedWallId(null);
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
    await load(filterMatter?.matterReference ?? '');
  }

  async function submitWall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newWallMatter) {
      setError(copy.noMatterSelected);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createEthicalWall({
        matterId: newWallMatter.matterReference,
        wallName: newWall.wallName.trim(),
        reason: newWall.reason.trim(),
        members: [],
      });
      setNewWall({ wallName: '', reason: '' });
      setNewWallMatter(null);
      await load(filterMatter?.matterReference ?? '');
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
      await load(filterMatter?.matterReference ?? '');
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
      await load(filterMatter?.matterReference ?? '');
    } catch (caught) {
      setError(safeApiErrorMessage(caught));
    } finally {
      setBusyMembershipId(null);
    }
  }

  return (
    <PageShell>
      <PageHeader title={copy.title} description={copy.description} />

      <form onSubmit={submitFilter}>
        <FilterBar
          actions={
            <Button
              aria-label={copy.filterTitle}
              title={copy.filterTitle}
              type="submit"
              disabled={busy}
            >
              <Search className="h-4 w-4" />
              {copy.filterTitle}
            </Button>
          }
          label={copy.searchCard}
          title={copy.searchCard}
          description={copy.searchMeta}
        >
          <div className="sm:col-span-full">
            <MatterCodePicker
              selectedMatter={filterMatter}
              onMatterSelected={setFilterMatter}
            />
          </div>
        </FilterBar>
      </form>

      {error ? <EmptyState variant="api-error" title={error} className="items-start text-left" /> : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <WallList
          items={items}
          busyMembershipId={busyMembershipId}
          onRemoveMembership={removeMembership}
          onSelectWall={(item) => setSelectedWallId(item.wall.wallId)}
          selectedWallId={selectedWallId}
        />
        <WallPolicyInspector item={selectedWall} />
      </section>

      <SectionCard title={copy.policyActions} meta={copy.policyActionsMeta}>
        <form className="grid gap-3" onSubmit={submitWall}>
          <MatterCodePicker selectedMatter={newWallMatter} onMatterSelected={setNewWallMatter} />
          {newWallMatter ? (
            <div className="rounded-md border bg-muted/20 p-3 text-sm">
              <span className="font-medium text-foreground">{copy.selectedMatter}</span>
              <span className="ml-2 text-muted-foreground">
                {newWallMatter.matterCode} · {newWallMatter.matterName}
              </span>
            </div>
          ) : null}
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
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
            <Button
              aria-label={copy.createTitle}
              title={copy.createTitle}
              type="submit"
              disabled={busy || !newWallMatter}
            >
              <Plus className="h-4 w-4" />
              {copy.createTitle}
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title={copy.advancedActions} meta={copy.advancedActionsMeta}>
        <details>
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            {copy.advancedActions}
          </summary>
          <div className="mt-4 grid gap-3">
            <form
              className="grid gap-3 rounded-md border bg-muted/20 p-3 lg:grid-cols-[1fr_1fr_12rem_auto]"
              onSubmit={submitMembership}
            >
              <Input
                aria-label={copy.wallRef}
                placeholder={copy.wallRef}
                value={newMembership.wallId}
                onChange={(event) =>
                  setNewMembership({ ...newMembership, wallId: event.target.value })
                }
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
                {copy.addMemberTitle}
              </Button>
            </form>
          </div>
        </details>
      </SectionCard>
    </PageShell>
  );
}
