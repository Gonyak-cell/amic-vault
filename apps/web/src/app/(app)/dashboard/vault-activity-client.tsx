'use client';

import React, { useState } from 'react';
import {
  Activity,
  Archive,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileSearch,
  LockKeyhole,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

type ActivityTab = 'activity' | 'documents' | 'permissions' | 'ai' | 'records';

const tabs: Array<{ id: ActivityTab; label: string; summary: string }> = [
  {
    id: 'activity',
    label: '최근 활동',
    summary: '실제 감사 이벤트가 연결되면 최근 활동이 표시됩니다.',
  },
  {
    id: 'documents',
    label: '파일',
    summary: '실제 파일 버전과 보존 상태가 연결되면 표시됩니다.',
  },
  {
    id: 'permissions',
    label: '접근 권한',
    summary: '실제 멤버 권한과 정보 차단 상태가 표시됩니다.',
  },
  {
    id: 'ai',
    label: 'AI 검토 근거',
    summary: '승인된 실제 AI 근거 검토가 있을 때만 출처가 표시됩니다.',
  },
  {
    id: 'records',
    label: '보존 관리',
    summary: '실제 보존 기간과 삭제 금지 상태가 연결되면 표시됩니다.',
  },
];

const emptyCopy = {
  profile: {
    title: '사건 선택 필요',
    body: '실제 사건을 선택하면 고객, 권한, 보존 상태가 표시됩니다.',
  },
  activity: {
    title: '실제 사건 데이터가 없습니다.',
    body: '활동 기록은 API에서 수신한 감사 이벤트만 표시합니다.',
  },
  selectedActivity: {
    title: '선택된 활동이 없습니다.',
    body: '활동 기록이 연결되면 세부 메타데이터가 이 영역에 표시됩니다.',
  },
  security: {
    title: '보안 상태 데이터가 없습니다.',
    body: '권한 평가와 정보 차단 상태가 실제 응답으로 연결된 뒤 표시됩니다.',
  },
  summary: {
    title: '요약 수치가 없습니다.',
    body: '파일 수, 제한 건수, 감사 완료율 같은 수치는 실데이터만 표시합니다.',
  },
  diagnostics: {
    title: '진단 결과가 없습니다.',
    body: '보호 상태 점검 결과가 연결되기 전에는 상태를 표시하지 않습니다.',
  },
  profileProperties: {
    title: '표시할 사건 속성이 없습니다.',
    body: '고객명, 사건 번호, 보안 등급은 실제 선택 항목에서만 표시됩니다.',
  },
};

export function VaultActivityClient() {
  const [activeTab, setActiveTab] = useState<ActivityTab>('activity');
  const activeTabSummary = tabs.find((tab) => tab.id === activeTab)?.summary ?? tabs[0].summary;

  return (
    <main className="mx-auto flex w-full max-w-[1480px] flex-col gap-5">
      <section className="flex flex-wrap items-end justify-between gap-4 border-b border-[#e8ecf4] pb-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm text-[#4a5a70]">
            <span>홈</span>
            <ChevronRight className="h-4 w-4" />
            <span>사건</span>
            <ChevronRight className="h-4 w-4" />
            <strong className="text-[#1a1f36]">선택 없음</strong>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[30px] font-semibold leading-tight tracking-normal text-[#1a1f36]">
              사건 대시보드
            </h1>
            <StatusPill>데이터 미연결</StatusPill>
            <StatusPill>실데이터만 표시</StatusPill>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" title="활동 검색">
            <Search className="h-4 w-4" />
            활동 검색
          </Button>
          <Button variant="outline" size="sm" title="기록 내보내기">
            <Archive className="h-4 w-4" />
            기록 내보내기
          </Button>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <MatterProfile />

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-7 border-b border-[#e8ecf4]">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`h-11 border-b-2 text-sm font-semibold transition-colors ${
                  activeTab === tab.id
                    ? 'border-[#1464e8] text-[#1464e8]'
                    : 'border-transparent text-[#4a5a70] hover:text-[#1a1f36]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="rounded-lg border border-[#e5e7eb] bg-white shadow-[0_2px_16px_rgba(45,45,45,0.06)]">
              <PanelHeader
                icon={<Activity className="h-4 w-4" />}
                title="활동 기록"
                meta={activeTabSummary}
              />
              <div className="border-t border-[#f0f3f9]">
                <EmptyState title={emptyCopy.activity.title} body={emptyCopy.activity.body} />
              </div>
            </div>

            <aside className="rounded-lg border border-[#e5e7eb] bg-white shadow-[0_2px_16px_rgba(45,45,45,0.06)]">
              <PanelHeader
                icon={<FileSearch className="h-4 w-4" />}
                title="선택한 활동"
                meta={emptyCopy.selectedActivity.title}
              />
              <div className="border-t border-[#f0f3f9] p-5">
                <EmptyState
                  title={emptyCopy.selectedActivity.title}
                  body={emptyCopy.selectedActivity.body}
                  compact
                />
              </div>
            </aside>
          </section>

          <section className="grid gap-4 2xl:grid-cols-[420px_minmax(0,1fr)]">
            <div className="rounded-lg border border-[#e5e7eb] bg-white shadow-[0_2px_16px_rgba(45,45,45,0.06)]">
              <PanelHeader
                icon={<ShieldCheck className="h-4 w-4" />}
                title="보안 상태"
                meta="데이터 없음"
              />
              <div className="border-t border-[#f0f3f9] p-5">
                <EmptyState title={emptyCopy.security.title} body={emptyCopy.security.body} compact />
              </div>
            </div>

            <div className="rounded-lg border border-[#e5e7eb] bg-white shadow-[0_2px_16px_rgba(45,45,45,0.06)]">
              <PanelHeader
                icon={<CheckCircle2 className="h-4 w-4" />}
                title="요약"
                meta="데이터 없음"
              />
              <div className="border-t border-[#f0f3f9]">
                <EmptyState title={emptyCopy.summary.title} body={emptyCopy.summary.body} />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-[#e5e7eb] bg-white shadow-[0_2px_16px_rgba(45,45,45,0.06)]">
            <PanelHeader icon={<Clock3 className="h-4 w-4" />} title="보호 상태" meta="데이터 없음" />
            <div className="border-t border-[#f0f3f9]">
              <EmptyState title={emptyCopy.diagnostics.title} body={emptyCopy.diagnostics.body} />
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function MatterProfile() {
  return (
    <aside className="rounded-lg border border-[#e5e7eb] bg-white p-6 shadow-[0_2px_16px_rgba(45,45,45,0.06)]">
      <div className="flex flex-col items-center border-b border-[#f0f3f9] pb-6 text-center">
        <div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-[#f1f5fb] text-2xl font-semibold text-[#1464e8]">
          -
        </div>
        <h2 className="mt-4 text-xl font-semibold text-[#1a1f36]">{emptyCopy.profile.title}</h2>
        <p className="mt-1 text-sm text-[#4a5a70]">{emptyCopy.profile.body}</p>
      </div>

      <div className="py-5">
        <div className="mb-3 flex h-10 items-center gap-2 rounded-md border border-[#e8ecf4] bg-white px-3 text-sm text-[#4a5a70]">
          <Search className="h-4 w-4" />
          속성 검색
        </div>
        <EmptyState
          title={emptyCopy.profileProperties.title}
          body={emptyCopy.profileProperties.body}
          compact
        />
      </div>
    </aside>
  );
}

function PanelHeader({ icon, title, meta }: { icon: React.ReactNode; title: string; meta: string }) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-4 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-[#1464e8]">{icon}</span>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-normal text-[#1a1f36]">{title}</h2>
          <p className="truncate text-xs text-[#4a5a70]">{meta}</p>
        </div>
      </div>
      <LockKeyhole className="h-4 w-4 shrink-0 text-[#8a97a8]" />
    </div>
  );
}

function EmptyState({ title, body, compact = false }: { title: string; body: string; compact?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? 'min-h-28 p-3' : 'min-h-44 p-6'
      }`}
    >
      <div className="mb-3 grid h-9 w-9 place-items-center rounded-full bg-[#f1f5fb] text-[#1464e8]">
        <LockKeyhole className="h-4 w-4" />
      </div>
      <p className="text-sm font-semibold text-[#1a1f36]">{title}</p>
      <p className="mt-1 max-w-md text-xs leading-5 text-[#4a5a70]">{body}</p>
    </div>
  );
}

function StatusPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
      {children}
    </span>
  );
}
