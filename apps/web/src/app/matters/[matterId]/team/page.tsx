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

  async function handleAdd(input: AddMatterMemberDto) {
    setAddError(null);
    try {
      const created = await addMatterMember(params.matterId, input);
      setMembers((current) => [
        ...current.filter((member) => member.userId !== created.userId),
        created,
      ]);
    } catch (error) {
      setAddError(errorCode(error));
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

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-5 px-6 py-6">
      <section className="flex items-center justify-between gap-4 border-b pb-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {language === 'ko' ? 'Matter ID' : 'Matter ID'} {params.matterId.slice(0, 8)}
          </p>
          <h1 className="text-2xl font-semibold tracking-normal">
            {language === 'ko' ? '팀 관리' : 'Team access'}
          </h1>
        </div>
      </section>
      {canManage ? (
        <AddMemberDialog
          disabled={!loaded || Boolean(busyUserId)}
          errorCode={addError}
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
    </main>
  );
}
