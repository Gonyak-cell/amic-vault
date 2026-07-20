import { z } from 'zod';
import { aiGroundedClaimKindSchema } from './generation';

const uuidSchema = z.string().uuid();
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const sourceRefSchema = z.string().min(1).max(120).regex(/^chunk:[A-Za-z0-9:_-]+$/);

export const aiClaimVerificationStatusSchema = z.enum(['cited', 'review_required']);

export const aiClaimCitationLedgerSchema = z
  .object({
    sourceRef: sourceRefSchema,
    documentId: uuidSchema,
    versionId: uuidSchema,
    chunkId: uuidSchema,
  })
  .strict();

export const aiClaimLedgerSchema = z
  .object({
    claimId: uuidSchema,
    sessionClaimId: z.string().min(1).max(120),
    sessionId: uuidSchema,
    claimHash: hashSchema,
    claimText: z.string().min(1).max(1600),
    kind: aiGroundedClaimKindSchema,
    isLegalConclusion: z.boolean(),
    verificationStatus: aiClaimVerificationStatusSchema,
    citations: z.array(aiClaimCitationLedgerSchema).min(1).max(20),
    createdAt: z.string().datetime(),
  })
  .strict();

export const aiSessionClaimsResponseSchema = z
  .object({
    sessionId: uuidSchema,
    claims: z.array(aiClaimLedgerSchema).max(100),
  })
  .strict();

export type AiClaimVerificationStatus = z.infer<typeof aiClaimVerificationStatusSchema>;
export type AiClaimCitationLedgerDto = z.infer<typeof aiClaimCitationLedgerSchema>;
export type AiClaimLedgerDto = z.infer<typeof aiClaimLedgerSchema>;
export type AiSessionClaimsResponseDto = z.infer<typeof aiSessionClaimsResponseSchema>;
