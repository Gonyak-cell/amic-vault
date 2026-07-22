import { z } from 'zod';

export const createPreviewSessionRequestSchema = z.object({}).strict();

export const previewSessionTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43,128}$/);

export const createPreviewSessionResponseSchema = z
  .object({
    previewSessionToken: previewSessionTokenSchema,
    expiresAt: z.string().datetime(),
  })
  .strict();

export type CreatePreviewSessionRequestDto = z.infer<typeof createPreviewSessionRequestSchema>;
export type CreatePreviewSessionResponseDto = z.infer<typeof createPreviewSessionResponseSchema>;
