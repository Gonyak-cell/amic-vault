import { Suspense } from 'react';
import { SearchClient } from './search-client';

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchFallback />}>
      <SearchClient />
    </Suspense>
  );
}

function SearchFallback() {
  return (
    <main className="flex flex-col gap-5">
      <section className="flex flex-col gap-2 border-b pb-4">
        <h1 className="text-2xl font-semibold tracking-normal">파일 검색</h1>
      </section>
      <p className="text-sm text-muted-foreground">검색 화면을 불러오는 중입니다.</p>
    </main>
  );
}
