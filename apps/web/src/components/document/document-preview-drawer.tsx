'use client';

import * as React from 'react';
import type { DocumentDto } from '@amic-vault/shared';
import { PreviewSessionFrame } from '@/components/document/preview-session-frame';
import { DocumentWorkbenchDrawer } from './document-workbench-shell';

export interface DocumentPreviewDrawerProps {
  document: DocumentDto | null;
  onClose: () => void;
  open: boolean;
  returnFocusRef?: React.RefObject<HTMLButtonElement>;
}

export function DocumentPreviewDrawer({
  document,
  onClose,
  open,
  returnFocusRef,
}: DocumentPreviewDrawerProps) {
  if (!document) return null;
  return (
    <DocumentWorkbenchDrawer
      onClose={onClose}
      open={open}
      returnFocusRef={returnFocusRef}
      side="right"
      title="문서 미리보기"
    >
      <div className="min-h-[65vh] overflow-hidden rounded-md border bg-muted/20">
        <PreviewSessionFrame
          documentId={document.documentId}
          key={document.documentId}
          title={document.title}
        />
      </div>
    </DocumentWorkbenchDrawer>
  );
}
