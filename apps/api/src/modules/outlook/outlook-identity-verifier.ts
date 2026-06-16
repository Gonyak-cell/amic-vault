import { Injectable } from '@nestjs/common';

export const OUTLOOK_IDENTITY_VERIFIER = Symbol('OUTLOOK_IDENTITY_VERIFIER');

export interface OutlookIdentityVerificationInput {
  tenantId: string;
  actorUserId: string;
  mailboxFingerprintHash: string;
  identityAssertion: string;
}

export interface OutlookIdentityVerificationAllow {
  effect: 'ALLOW';
  subjectHash: string;
  tenantHintHash?: string;
}

export interface OutlookIdentityVerificationDeny {
  effect: 'DENY';
}

export type OutlookIdentityVerification =
  | OutlookIdentityVerificationAllow
  | OutlookIdentityVerificationDeny;

export interface OutlookIdentityVerifier {
  verify(input: OutlookIdentityVerificationInput): Promise<OutlookIdentityVerification>;
}

@Injectable()
export class DefaultOutlookIdentityVerifier implements OutlookIdentityVerifier {
  async verify(input: OutlookIdentityVerificationInput): Promise<OutlookIdentityVerification> {
    void input;
    return { effect: 'DENY' };
  }
}
