'use client';

import React from 'react';
import { ChevronRight, Clock3, FileText, ShieldCheck } from 'lucide-react';

export function VaultActivityClient() {
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
          권한이 확인된 실제 파일과 활동만 표시됩니다.
        </p>
      </section>

      <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-4">
          <PermissionBanner />
          <EmptyPanel
            icon={<FileText className="h-4 w-4" />}
            title="파일"
            description="표시할 파일이 없습니다."
          />
          <EmptyPanel
            icon={<Clock3 className="h-4 w-4" />}
            title="활동 기록"
            description="표시할 활동이 없습니다."
          />
        </div>

        <aside className="overflow-hidden rounded-lg border border-[#e5e7eb] bg-white shadow-[0_2px_16px_rgba(45,45,45,0.06)] xl:sticky xl:top-20 xl:self-start">
          <PanelHeader icon={<FileText className="h-4 w-4" />} title="상세 정보" meta="선택된 항목 없음" />
          <div className="border-t border-[#f0f3f9] p-4 text-[13px] leading-6 text-[#4a5a70] sm:p-[18px]">
            실제 파일 또는 활동을 선택하면 상세 정보가 표시됩니다.
          </div>
        </aside>
      </div>
    </main>
  );
}

function PermissionBanner() {
  return (
    <section className="overflow-hidden rounded-lg border border-[#e5e7eb] bg-white shadow-[0_2px_16px_rgba(45,45,45,0.06)]">
      <div className="flex flex-col gap-3 p-4 sm:p-[18px] md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[15px] font-bold text-[#1a1f36]">권한이 확인된 항목만 표시됩니다</div>
          <p className="mt-1 text-[13px] leading-6 text-[#4a5a70]">
            접근 권한과 정보 차단 정책을 통과한 운영 데이터만 이 화면에 나타납니다.
          </p>
        </div>
        <span className="inline-flex h-[34px] shrink-0 items-center justify-center gap-2 rounded-[7px] border border-[#d8e1ef] bg-[#f8fbff] px-3 text-[13px] font-bold leading-none text-[#1448c4]">
          <ShieldCheck className="h-4 w-4" />
          보호됨
        </span>
      </div>
    </section>
  );
}

function EmptyPanel({
  description,
  icon,
  title,
}: {
  description: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#e5e7eb] bg-white shadow-[0_2px_16px_rgba(45,45,45,0.06)]">
      <PanelHeader icon={icon} title={title} meta="실제 데이터만 표시" />
      <div className="border-t border-[#f0f3f9] p-4 text-[13px] leading-6 text-[#4a5a70] sm:p-[18px]">
        {description}
      </div>
    </section>
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
