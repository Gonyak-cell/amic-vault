import React from 'react';
import { FileText } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';

export default function FilesPage() {
  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', '파일']}
        title="파일"
        description="파일 목록 API가 연결되기 전까지 운영 데이터만 표시합니다."
      />
      <SectionCard icon={<FileText className="h-4 w-4" />} title="파일 목록" meta="운영 데이터 미연결">
        <EmptyState
          variant="api-unavailable"
          title="파일 목록을 표시할 수 없습니다."
        />
      </SectionCard>
    </PageShell>
  );
}
