import { createHash } from 'node:crypto';
import {
  scanSensitiveData,
  scanSensitiveDataWithStatus,
  type DlpDetection,
  type DlpScanOptions,
  type DlpSensitiveDataScanResult,
} from '@amic-vault/shared';

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export class SensitiveDataDetector {
  scan(text: string, options: DlpScanOptions = {}): DlpDetection[] {
    return scanSensitiveData(text, { ...options, hash: sha256Hex });
  }

  scanWithStatus(text: string, options: DlpScanOptions = {}): DlpSensitiveDataScanResult {
    return scanSensitiveDataWithStatus(text, { ...options, hash: sha256Hex });
  }
}
