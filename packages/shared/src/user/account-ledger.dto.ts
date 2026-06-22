import { z } from 'zod';

export const assignAccountLedgerIdSchema = z.object({
  accountLedgerId: z.string().trim().min(3).max(80),
});

export interface AssignAccountLedgerIdDto {
  accountLedgerId: string;
}
