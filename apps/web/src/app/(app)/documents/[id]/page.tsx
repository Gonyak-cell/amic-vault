'use client';

import { DocumentActionCenter } from '@/components/document/document-action-center';
import { PageShell } from '@/components/ui/page-shell';

export default function DocumentDetailPage({ params }: { params: { id: string } }) {
  return (
    <PageShell>
      <DocumentActionCenter documentId={params.id} />
    </PageShell>
  );
}
