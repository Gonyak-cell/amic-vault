'use client';

import React, { useEffect, useState } from 'react';
import { fetchDocumentPreviewRange, issueDocumentPreviewSession } from '@/lib/api-client';

export const previewChunkBytes = 1_048_576;
export const previewMaxBytes = 32 * previewChunkBytes;

export function previewTotalBytes(contentRange: string | null): number | null {
  const match = /^bytes \d+-\d+\/(\d+)$/.exec(contentRange ?? '');
  const value = Number(match?.[1]);
  return Number.isSafeInteger(value) && value > 0 && value <= previewMaxBytes ? value : null;
}

async function loadPreviewBytes(documentId: string, session: Awaited<ReturnType<typeof issueDocumentPreviewSession>>) {
  const first = await fetchDocumentPreviewRange(
    documentId,
    session,
    `bytes=0-${previewChunkBytes - 1}`,
  );
  const total = previewTotalBytes(first.headers.get('content-range'));
  if (!total) throw new Error('preview range is unavailable');
  const chunks: BlobPart[] = [await first.arrayBuffer()];
  for (let start = previewChunkBytes; start < total; start += previewChunkBytes) {
    const end = Math.min(start + previewChunkBytes - 1, total - 1);
    const next = await fetchDocumentPreviewRange(documentId, session, `bytes=${start}-${end}`);
    chunks.push(await next.arrayBuffer());
  }
  return chunks;
}

export async function loadPreviewWithOneRetry(documentId: string): Promise<BlobPart[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await loadPreviewBytes(documentId, await issueDocumentPreviewSession(documentId));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export function PreviewSessionFrame({ documentId, title }: { documentId: string; title: string }) {
  const [src, setSrc] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    async function load() {
      try {
        // A session can expire while the tab is suspended. The loader retries once
        // with a new short-lived credential; it never loops or retains credentials in state.
        const chunks = await loadPreviewWithOneRetry(documentId);
        const nextObjectUrl = URL.createObjectURL(new Blob(chunks, { type: 'application/pdf' }));
        if (!active) {
          URL.revokeObjectURL(nextObjectUrl);
          return;
        }
        objectUrl = nextObjectUrl;
        setSrc(nextObjectUrl);
      } catch {
        if (active) setFailed(true);
      }
    }
    void load();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId]);

  if (failed) {
    return <p className="p-4 text-sm text-muted-foreground">미리보기를 불러올 수 없습니다.</p>;
  }
  if (!src) return <p className="p-4 text-sm text-muted-foreground">미리보기를 준비하고 있습니다.</p>;
  return <iframe className="h-full w-full bg-background" src={src} title={`${title} preview`} />;
}
