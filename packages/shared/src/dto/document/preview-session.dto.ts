import { z } from 'zod';

export const previewAccessSessionSchema = z
  .object({
    previewSessionId: z.string().uuid(),
    expiresAt: z.string().datetime({ offset: true }),
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();

export type PreviewAccessSessionDto = z.infer<typeof previewAccessSessionSchema>;
