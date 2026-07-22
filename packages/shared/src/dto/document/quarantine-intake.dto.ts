import { z } from 'zod';

export const quarantinedIntakeResponseSchema = z
  .object({
    status: z.literal('quarantined'),
    matterId: z.string().uuid(),
    quarantineRef: z.string().uuid(),
  })
  .strict();

export type QuarantinedIntakeResponseDto = z.infer<typeof quarantinedIntakeResponseSchema>;
