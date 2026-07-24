import { SetMetadata } from '@nestjs/common';

/**
 * The only mutation handlers an unverified production local-admin bootstrap
 * session may reach. SessionGuard treats all other mutations as fail-closed.
 */
export const ALLOW_UNVERIFIED_MFA_BOOTSTRAP_MUTATION =
  'amic-vault:allow-unverified-mfa-bootstrap-mutation';

export function AllowUnverifiedMfaBootstrapMutation(): MethodDecorator {
  return SetMetadata(ALLOW_UNVERIFIED_MFA_BOOTSTRAP_MUTATION, true);
}
