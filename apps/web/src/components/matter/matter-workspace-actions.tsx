'use client';

import * as React from 'react';
import Link from 'next/link';
import { Activity, Archive, BriefcaseBusiness, FileSearch, Search } from 'lucide-react';
import type { MatterDto } from '@amic-vault/shared';
import {
  matterFileCabinetUrl,
  matterRecordsUrl,
  matterSearchUrl,
} from '@/components/matter/matter-dms-links';
import { Button } from '@/components/ui/button';

interface WorkspaceAction {
  description: string;
  href: string;
  icon: React.ReactNode;
  label: string;
}

export function MatterWorkspaceActions({ matter }: { matter: MatterDto }) {
  const actions: WorkspaceAction[] = [
    {
      description: '이 Matter Code로 문서함과 업로드 흐름을 엽니다.',
      href: matterFileCabinetUrl(matter),
      icon: <FileSearch className="h-4 w-4" />,
      label: '파일함',
    },
    {
      description: '본문, 제목, 메타데이터 검색을 이 Matter Code로 좁힙니다.',
      href: matterSearchUrl(matter),
      icon: <Search className="h-4 w-4" />,
      label: '검색',
    },
    {
      description: '추출, OCR, 파일 정리, 보존 조치 작업을 확인합니다.',
      href: '/work',
      icon: <BriefcaseBusiness className="h-4 w-4" />,
      label: '작업함',
    },
    {
      description: '사건 표시명을 기준으로 보존 작업 준비 화면을 엽니다.',
      href: matterRecordsUrl(matter),
      icon: <Archive className="h-4 w-4" />,
      label: '기록 보존',
    },
    {
      description: 'Matter 감사 타임라인과 전체 활동 기록 콘솔로 이동합니다.',
      href: '/audit',
      icon: <Activity className="h-4 w-4" />,
      label: '감사 기록',
    },
  ];

  return (
    <nav aria-label="Matter Code 기준 작업" className="flex min-w-0 flex-wrap justify-end gap-2">
      {actions.map((action) => (
        <Button
          asChild
          className="shrink-0"
          key={action.label}
          size="sm"
          title={action.description}
          variant="outline"
        >
          <Link href={action.href}>
            {action.icon}
            {action.label}
          </Link>
        </Button>
      ))}
    </nav>
  );
}
