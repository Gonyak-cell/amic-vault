import Link from 'next/link';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SearchFoldersClient } from './search-folders-client';

export default function SearchFoldersPage() {
  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', '검색 폴더']}
        title="검색 폴더"
        description="저장된 검색 조건을 폴더처럼 열어 권한이 확인된 문서 결과로 바로 돌아갑니다."
        actions={
          <Button asChild>
            <Link href="/search">
              <Search className="h-4 w-4" />
              문서 검색
            </Link>
          </Button>
        }
      />
      <SearchFoldersClient />
    </PageShell>
  );
}
