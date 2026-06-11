import { z } from 'zod';

export const updateLegalHoldSchema = z
  .object({
    legalHold: z.boolean(),
  })
  .strict();

export type UpdateLegalHoldDto = z.infer<typeof updateLegalHoldSchema>;
