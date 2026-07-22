export const fileSecurityScanQueueName = 'security.file-scan';
export const fileSecurityScanDeadLetterQueueName = 'security.file-scan.dead';

export interface FileSecurityScanJobPayload {
  tenantId: string;
  quarantineRef: string;
  expectedSha256: string;
}

export function quarantineIngressEnabled(): boolean {
  return process.env.FILE_SECURITY_QUARANTINE_ENABLED === 'true';
}
