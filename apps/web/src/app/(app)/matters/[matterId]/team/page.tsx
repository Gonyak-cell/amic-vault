'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  AddMatterMemberDto,
  ErrorCode,
  MatterMemberDto,
  UpdateMatterMemberDto,
} from '@amic-vault/shared';
import { AddMemberDialog } from '@/components/matter/add-member-dialog';
import { TeamMemberList } from '@/components/matter/team-member-list';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import {
  addMatterMember,
  ApiClientError,
  listMatterMembers,
  removeMatterMember,
  updateMatterMember,
} from '@/lib/api-client';
import { useI18n } from '@/lib/i18n';

function errorCode(error: unknown): ErrorCode | null {
  return error instanceof ApiClientError ? error.code : 'VALIDATION_FAILED';
}

export default function MatterTeamPage({ params }: { params: { matterId: string } }) {
  const { language } = useI18n();
  const [members, setMembers] = useState<MatterMemberDto[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [listError, setListError] = useState<ErrorCode | null>(null);
  const [addError, setAddError] = useState<ErrorCode | null>(null);

  const loadMembers = useCallback(() => {
    setLoaded(false);
    setListError(null);
    listMatterMembers(params.matterId)
      .then((result) => {
        setMembers(result.items);
        setCanManage(result.canManage);
      })
      .catch((error) => {
        setMembers([]);
        setCanManage(false);
        setListError(errorCode(error));
      })
      .finally(() => setLoaded(true));
  }, [params.matterId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  async function handleAdd(input: AddMatterMemberDto): Promise<boolean> {
    setAddBusy(true);
    setAddError(null);
    try {
      const created = await addMatterMember(params.matterId, input);
      setMembers((current) => [
        ...current.filter((member) => member.userId !== created.userId),
        created,
      ]);
      return true;
    } catch (error) {
      setAddError(errorCode(error));
      return false;
    } finally {
      setAddBusy(false);
    }
  }

  async function handleUpdate(userId: string, input: UpdateMatterMemberDto) {
    setBusyUserId(userId);
    setListError(null);
    try {
      const updated = await updateMatterMember(params.matterId, userId, input);
      setMembers((current) =>
        current.map((member) => (member.userId === updated.userId ? updated : member)),
      );
    } catch (error) {
      setListError(errorCode(error));
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRemove(userId: string) {
    setBusyUserId(userId);
    setListError(null);
    try {
      await removeMatterMember(params.matterId, userId);
      setMembers((current) => current.filter((member) => member.userId !== userId));
    } catch (error) {
      setListError(errorCode(error));
    } finally {
      setBusyUserId(null);
    }
  }

  const title = language === 'ko' ? '팀 관리' : 'Team access';

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', language === 'ko' ? '사건' : 'Matter', title]}
        title={title}
        description="권한이 확인된 팀원과 접근 설정만 표시됩니다."
      />
      {listError && !loaded ? <EmptyState variant="api-error" title="팀 정보를 표시할 수 없습니다." /> : null}
      {canManage ? (
        <AddMemberDialog
          disabled={!loaded || Boolean(busyUserId) || addBusy}
          errorCode={addError}
          matterId={params.matterId}
          onAddMember={handleAdd}
        />
      ) : null}
      <TeamMemberList
        members={members}
        canManage={canManage}
        errorCode={listError}
        busyUserId={busyUserId}
        onUpdateMember={handleUpdate}
        onRemoveMember={handleRemove}
      />
    </PageShell>
  );
}
