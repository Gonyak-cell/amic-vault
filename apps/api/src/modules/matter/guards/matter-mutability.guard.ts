import { BadRequestException } from '@nestjs/common';
import {
  isMatterMutationBlockedState,
  isMatterState,
  type MatterStateValue,
} from '@amic-vault/domain';

export function matterClosedMutationError(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', reason: 'MATTER_CLOSED' });
}

export function assertMatterMutationAllowed(status: string): asserts status is MatterStateValue {
  if (!isMatterState(status) || isMatterMutationBlockedState(status)) {
    throw matterClosedMutationError();
  }
}

export function isMatterMutationAllowed(status: string): boolean {
  return isMatterState(status) && !isMatterMutationBlockedState(status);
}
