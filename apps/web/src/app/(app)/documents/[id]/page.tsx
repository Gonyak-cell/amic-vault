'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  DocumentActionCenter,
  editIntentFromParams,
  searchHitContextFromParams,
} from '@/components/document/document-action-center';
import { PageShell } from '@/components/ui/page-shell';

export default function DocumentDetailPage({ params }: { params: { id: string } }) {
  return (
    <PageShell>
      <Suspense fallback={<DocumentDetailFallback documentId={params.id} />}>
        <DocumentDetailContent documentId={params.id} />
      </Suspense>
    </PageShell>
  );
}

function DocumentDetailContent({ documentId }: { documentId: string }) {
  const searchParams = useSearchParams();
  return (
    <DocumentActionCenter
      documentId={documentId}
      editIntent={editIntentFromParams(searchParams)}
      searchHitContext={searchHitContextFromParams(searchParams)}
    />
  );
}

function DocumentDetailFallback({ documentId }: { documentId: string }) {
  return <DocumentActionCenter disableInitialLoad documentId={documentId} />;
}
