import { Injectable } from '@nestjs/common';
import type { OutlookDeniedReasonCode } from '@amic-vault/shared';

export const OUTLOOK_GRAPH_ATTACHMENT_TRANSPORT = Symbol('OUTLOOK_GRAPH_ATTACHMENT_TRANSPORT');

export interface OutlookGraphAttachmentTransportInput {
  tenantId: string;
  actorUserId: string;
  acquisitionId: string;
  filingRequestId: string;
  mailboxFingerprintHash: string;
  messageHash: string;
  attachmentIdHash: string;
}

export interface OutlookGraphAttachmentTransportAcquired {
  status: 'acquired';
  contentSha256: string;
  sizeBytes: number;
}

export interface OutlookGraphAttachmentTransportDenied {
  status: 'denied';
  reasonCode: OutlookDeniedReasonCode;
}

export type OutlookGraphAttachmentTransportResult =
  | OutlookGraphAttachmentTransportAcquired
  | OutlookGraphAttachmentTransportDenied;

export interface OutlookGraphAttachmentTransport {
  acquire(
    input: OutlookGraphAttachmentTransportInput,
  ): Promise<OutlookGraphAttachmentTransportResult>;
}

@Injectable()
export class DisabledOutlookGraphAttachmentTransport implements OutlookGraphAttachmentTransport {
  async acquire(
    input: OutlookGraphAttachmentTransportInput,
  ): Promise<OutlookGraphAttachmentTransportResult> {
    void input;
    return { status: 'denied', reasonCode: 'integration_gate_closed' };
  }
}
