export const fileSecurityScanQueueName = 'security.file-scan';
export const fileSecurityScanDeadLetterQueueName = 'security.file-scan.dead';

export interface FileSecurityScanJobPayload {
  tenantId: string;
  quarantineRef: string;
  expectedSha256: string;
}
