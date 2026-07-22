import { z } from 'zod';

export const fileSecurityStates = [
  'quarantined',
  'scanning',
  'clean',
  'infected',
  'error',
  'security_hold',
  'promoted',
] as const;

export const fileSecurityResultCodes = [
  'pending',
  'clean',
  'infected',
  'scanner_error',
  'scanner_timeout',
  'malformed_response',
  'stale_signature',
  'hash_mismatch',
  'manual_hold',
] as const;

export const fileSecurityStateSchema = z.enum(fileSecurityStates);
export const fileSecurityResultCodeSchema = z.enum(fileSecurityResultCodes);

export type FileSecurityState = z.infer<typeof fileSecurityStateSchema>;
export type FileSecurityResultCode = z.infer<typeof fileSecurityResultCodeSchema>;

const allowedTransitions: Readonly<Record<FileSecurityState, readonly FileSecurityState[]>> = {
  quarantined: ['scanning', 'error', 'security_hold'],
  scanning: ['clean', 'infected', 'error', 'security_hold'],
  clean: ['promoted', 'security_hold'],
  infected: ['security_hold'],
  error: ['scanning', 'security_hold'],
  security_hold: ['scanning'],
  promoted: [],
};

export function canTransitionFileSecurityState(
  from: FileSecurityState,
  to: FileSecurityState,
): boolean {
  return from === to || allowedTransitions[from].includes(to);
}

export function canPromoteFileSecurityScan(
  state: FileSecurityState,
  resultCode: FileSecurityResultCode,
): boolean {
  return state === 'clean' && resultCode === 'clean';
}
