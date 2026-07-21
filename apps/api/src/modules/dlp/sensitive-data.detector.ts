import { createHash } from 'node:crypto';
import { scanSensitiveData, type DlpDetection, type DlpScanOptions } from '@amic-vault/shared';

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export class SensitiveDataDetector {
  scan(text: string, options: DlpScanOptions = {}): DlpDetection[] {
    return scanSensitiveData(text, { ...options, hash: sha256Hex });
  }
}
