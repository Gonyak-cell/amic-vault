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
        <h1 className="text-2xl font-semibold tracking-normal">Search</h1>
      </section>
      <p className="text-sm text-muted-foreground">Loading</p>
    </main>
  );
}
