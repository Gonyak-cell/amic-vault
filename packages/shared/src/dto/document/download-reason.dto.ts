import { z } from 'zod';

export const documentDownloadReasonCodes = [
  'casework',
  'client_request',
  'court_filing',
  'compliance',
  'other',
] as const;

export const documentDownloadReasonCodeSchema = z.enum(documentDownloadReasonCodes);

export const documentDownloadReasonQuerySchema = z
  .object({
    reasonCode: documentDownloadReasonCodeSchema.optional(),
    reason_code: documentDownloadReasonCodeSchema.optional(),
    reasonText: z.string().trim().max(200).optional(),
    reason_text: z.string().trim().max(200).optional(),
  })
  .strict()
  .transform((value) => ({
    reasonCode: value.reasonCode ?? value.reason_code,
    reasonText: value.reasonText ?? value.reason_text,
  }));

export type DocumentDownloadReasonCode = (typeof documentDownloadReasonCodes)[number];
export type DocumentDownloadReasonQueryDto = z.infer<typeof documentDownloadReasonQuerySchema>;
