'use client';

import * as React from 'react';
import { MailPlus } from 'lucide-react';
import type { DocumentUploadCompletionResult } from '@/components/document/document-upload-panel';
import { DocumentUploadPanel } from '@/components/document/document-upload-panel';
import { EmailUploadCard } from '@/components/matter/email-upload-card';
import type { MatterAppSourceMode, MatterCodeOption } from '@/lib/matter-app';
import { DocumentWorkbenchDrawer } from './document-workbench-shell';

export interface DocumentUploadDrawerProps {
  onClose: () => void;
  onUploadComplete: (result: DocumentUploadCompletionResult) => void;
  open: boolean;
  returnFocusRef?: React.RefObject<HTMLButtonElement>;
  selectedMatter: MatterCodeOption | null;
  sourceMode: MatterAppSourceMode;
}

export function DocumentUploadDrawer({
  onClose,
  onUploadComplete,
  open,
  returnFocusRef,
  selectedMatter,
  sourceMode,
}: DocumentUploadDrawerProps) {
  return (
    <DocumentWorkbenchDrawer
      onClose={onClose}
      open={open}
      returnFocusRef={returnFocusRef}
      side="right"
      title="문서 업로드"
    >
      {selectedMatter ? (
        <div className="grid gap-6">
          <DocumentUploadPanel
            onUploadComplete={(result) => {
              onUploadComplete(result);
              onClose();
            }}
            selectedMatter={selectedMatter}
            sourceMode={sourceMode}
          />
          <section className="border-t pt-5" aria-labelledby="workbench-email-upload-title">
            <div className="mb-3 flex items-center gap-2">
              <MailPlus aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
              <h3
                className="text-sm font-semibold text-foreground"
                id="workbench-email-upload-title"
              >
                이메일 업로드
              </h3>
            </div>
            <EmailUploadCard
              matter={{
                matterId: selectedMatter.matterReference,
                matterCode: selectedMatter.matterCode,
                matterName: selectedMatter.matterName,
                clientDisplayName: selectedMatter.clientDisplayName,
              }}
              uploadEnabled
            />
          </section>
        </div>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          Matter를 선택한 뒤 업로드할 수 있습니다.
        </p>
      )}
    </DocumentWorkbenchDrawer>
  );
}
