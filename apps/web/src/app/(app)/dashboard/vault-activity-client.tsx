'use client';

import React, { useMemo, useState } from 'react';
import {
  ChevronRight,
  Clock3,
  FileText,
  List,
  Pencil,
} from 'lucide-react';

type ActivityId = 'file' | 'nda' | 'citation' | 'disposal' | 'hold';

type ActivityDetail = {
  copy: string;
  keys: Array<[string, string]>;
  refs: Array<[string, string]>;
  target: string;
  time: string;
  title: string;
};

const activityDetails = {
  file: {
    time: '18:42',
    title: '새 파일이 추가됨',
    target: '주식매매계약서_v3.pdf 업로드',
    copy: '주식매매계약서_v3.pdf가 자료실에 추가되었습니다. 접근 권한이 있는 팀원에게만 보입니다.',
    refs: [
      ['파일', 'DOC-204'],
      ['활동', 'ACT-001'],
    ],
    keys: [
      ['수행자', '정서연'],
      ['대상', '주식매매계약서_v3.pdf'],
      ['처리', '업로드 완료'],
      ['영향', '팀원 열람 가능'],
    ],
  },
  nda: {
    time: '18:31',
    title: 'NDA 동의 대기 중',
    target: '외부 검토자 김민준 님의 접근 보류',
    copy: '김민준 님은 자료실을 볼 수 있지만, NDA 동의 전에는 파일을 다운로드할 수 없습니다.',
    refs: [
      ['공유', 'EXT-ROOM-B'],
      ['기록', 'NDA-WATCH-019'],
    ],
    keys: [
      ['담당자', '딜팀'],
      ['대상', '외부 검토자 김민준'],
      ['조건', 'NDA 동의 필요'],
      ['영향', '다운로드 보류'],
    ],
  },
  citation: {
    time: '18:17',
    title: 'AI 요약 출처 확인됨',
    target: '요약에 사용된 12개 파일 출처 확인',
    copy: 'AI 요약에 사용된 문장이 허용된 파일 출처와 연결되어 있습니다.',
    refs: [
      ['출처', 'CIT-012'],
      ['AI', '요약 검토'],
    ],
    keys: [
      ['수행자', 'AI 검토 기능'],
      ['대상', '계약 검토 요약'],
      ['조건', '허용된 파일만 사용'],
      ['영향', '요약 표시 가능'],
    ],
  },
  disposal: {
    time: '17:58',
    title: '폐기 승인 필요',
    target: '보존 기간이 끝난 파일 3개 검토 대기',
    copy: '보존 기간이 끝난 파일은 승인 전까지 폐기되지 않습니다.',
    refs: [
      ['승인', 'APR-014'],
      ['기록', 'DISPOSAL-HOLD'],
    ],
    keys: [
      ['담당자', '기록 관리자'],
      ['대상', '폐기 검토 파일 3개'],
      ['조건', '관리자 승인 필요'],
      ['영향', '폐기 보류'],
    ],
  },
  hold: {
    time: '17:44',
    title: '삭제 금지 범위 변경',
    target: '주요 파일 4개가 삭제 금지로 지정됨',
    copy: '분쟁 가능성이 있는 주요 파일 4개가 삭제 금지로 지정되었습니다.',
    refs: [
      ['기록', 'HOLD-044'],
      ['파일', '4개'],
    ],
    keys: [
      ['수행자', '기록 관리자'],
      ['대상', '주요 파일 4개'],
      ['조건', '삭제 금지 우선'],
      ['영향', '파일 삭제 차단'],
    ],
  },
} satisfies Record<ActivityId, ActivityDetail>;

const activityOrder: ActivityId[] = ['file', 'nda', 'citation', 'disposal', 'hold'];

const matterFacts: Array<[string, string]> = [
  ['담당팀', '법무 운영팀'],
  ['보존 기간', '7년'],
  ['공유 상태', '워터마크 적용'],
  ['다음 작업', '외부 검토자 NDA 확인'],
];

export function VaultActivityClient() {
  const [selectedActivityId, setSelectedActivityId] = useState<ActivityId>('file');
  const selectedActivity = useMemo(
    () => activityDetails[selectedActivityId],
    [selectedActivityId],
  );

  return (
    <main className="mx-auto w-full max-w-[1480px]">
      <section className="border-b border-[#e8ecf4] pb-4">
        <nav
          aria-label="이동 경로"
          className="flex flex-wrap items-center gap-1.5 text-[13px] text-[#4a5a70]"
        >
          <span>Vault</span>
          <ChevronRight className="h-4 w-4" />
          <strong className="text-[#1a1f36]">홈</strong>
        </nav>
        <h1 className="mt-2 text-xl font-bold leading-[1.35] tracking-normal text-[#1a1f36]">홈</h1>
        <p className="mt-1.5 max-w-[860px] text-sm leading-6 text-[#4a5a70]">
          이 사건의 파일, 접근 권한, 최근 활동을 한곳에서 확인합니다.
        </p>
      </section>

      <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-4">
          <PermissionBanner />
          <MatterPanel />
          <ActivityPanel selectedActivityId={selectedActivityId} onSelect={setSelectedActivityId} />
        </div>

        <DetailInspector activity={selectedActivity} />
      </div>
    </main>
  );
}

function PermissionBanner() {
  return (
    <section className="overflow-hidden rounded-lg border border-[#e5e7eb] bg-white shadow-[0_2px_16px_rgba(45,45,45,0.06)]">
      <div className="flex flex-col gap-3 p-4 sm:p-[18px] md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[15px] font-bold text-[#1a1f36]">이 사건에 접근할 수 있습니다</div>
          <p className="mt-1 text-[13px] leading-6 text-[#4a5a70]">
            현재 계정의 권한과 정보 차단 설정을 확인했습니다. 허용된 파일과 활동만 표시됩니다.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-[34px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[7px] border border-[#e8ecf4] bg-white px-3 text-[13px] font-bold leading-none text-[#1a1f36] transition hover:bg-[#f1f5fb]"
        >
          <Pencil className="h-4 w-4" />
          접근 권한 보기
        </button>
      </div>
    </section>
  );
}

function MatterPanel() {
  return (
    <section className="overflow-hidden rounded-lg border border-[#e5e7eb] bg-white shadow-[0_2px_16px_rgba(45,45,45,0.06)]">
      <PanelHeader
        icon={<List className="h-4 w-4" />}
        title="사건 정보"
        meta="파일 보관, 담당자, 보존 상태"
      />
      <div className="border-t border-[#f0f3f9] p-4 sm:p-[18px]">
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <h2 className="text-xl font-bold leading-tight tracking-normal text-[#1a1f36]">
              계약 검토 자료실
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#4a5a70]">
              계약서와 검토 자료를 모아두고, 누가 어떤 파일을 열람했는지 확인하는 공간입니다.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <RecordRef label="파일" value="DOC-204" />
              <RecordRef label="활동" value="ACT-001" />
              <RecordRef label="보류" value="HOLD-017" />
            </div>
          </div>
          <KeyGrid items={matterFacts} />
        </div>
      </div>
    </section>
  );
}

function ActivityPanel({
  onSelect,
  selectedActivityId,
}: {
  onSelect: (activityId: ActivityId) => void;
  selectedActivityId: ActivityId;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#e5e7eb] bg-white shadow-[0_2px_16px_rgba(45,45,45,0.06)]">
      <PanelHeader
        icon={<Clock3 className="h-4 w-4" />}
        title="활동 기록"
        meta="최근 파일 및 권한 활동"
      />
      <div className="border-t border-[#f0f3f9]">
        {activityOrder.map((activityId) => {
          const activity = activityDetails[activityId];
          const active = selectedActivityId === activityId;
          return (
            <button
              key={activityId}
              type="button"
              onClick={() => onSelect(activityId)}
              className={`grid w-full grid-cols-[54px_minmax(0,1fr)] gap-2 border-b border-[#f0f3f9] px-3.5 py-3 text-left transition-colors last:border-b-0 sm:grid-cols-[92px_minmax(0,1fr)] sm:gap-4 sm:px-[18px] ${
                active ? 'bg-[#f1f5fb]' : 'bg-white hover:bg-[#f8fafd]'
              }`}
            >
              <span className="font-mono text-[12px] font-semibold text-[#4a5a70]">{activity.time}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-[#1a1f36]">{activity.title}</span>
                <span className="block truncate text-[12px] text-[#4a5a70] sm:whitespace-normal">
                  {activity.target}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DetailInspector({ activity }: { activity: ActivityDetail }) {
  return (
    <aside className="overflow-hidden rounded-lg border border-[#e5e7eb] bg-white shadow-[0_2px_16px_rgba(45,45,45,0.06)] xl:sticky xl:top-20 xl:self-start">
      <PanelHeader icon={<FileText className="h-4 w-4" />} title="상세 정보" meta="선택한 활동" />
      <div className="border-t border-[#f0f3f9] p-4 sm:p-[18px]">
        <h3 className="text-[15px] font-bold text-[#1a1f36]">{activity.title}</h3>
        <p className="mt-2 text-[13px] leading-6 text-[#4a5a70]">{activity.copy}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {activity.refs.map(([label, value]) => (
            <RecordRef key={`${label}-${value}`} label={label} value={value} />
          ))}
        </div>

        <div className="my-4 h-px bg-[#f0f3f9]" />
        <KeyGrid items={activity.keys} />

        <div className="my-4 h-px bg-[#f0f3f9]" />
        <div className="grid gap-3 border-t border-[#f0f3f9] pt-4">
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span className="text-[#4a5a70]">외부 공유 공간</span>
            <strong className="text-right text-[#1a1f36]">외부 검토자 김민준</strong>
          </div>
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span className="text-[#4a5a70]">만료</span>
            <strong className="text-right text-[#1a1f36]">2026-06-15 13:00 KST</strong>
          </div>
          <div className="flex flex-wrap gap-2">
            <RecordRef label="기록" value="WM-EXT-044" />
            <RecordRef label="기록" value="DLT-0091" />
          </div>
        </div>
      </div>
    </aside>
  );
}

function PanelHeader({ icon, meta, title }: { icon: React.ReactNode; meta: string; title: string }) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-3 px-4 py-3.5 sm:px-[18px]">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="text-[#1464e8]">{icon}</span>
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-bold tracking-normal text-[#1a1f36]">{title}</h2>
          <p className="truncate text-[11px] text-[#4a5a70]">{meta}</p>
        </div>
      </div>
    </div>
  );
}

function RecordRef({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 text-[11px] font-bold text-[#4a5a70]">
      <b className="font-extrabold text-[#1464e8]">{label}</b>
      <code className="truncate font-mono text-[11px]">{value}</code>
    </span>
  );
}

function KeyGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={`${label}-${value}`} className="min-w-0">
          <dt className="truncate text-[11px] font-bold text-[#4a5a70]">{label}</dt>
          <dd className="mt-1 break-words text-sm font-bold text-[#1a1f36]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
