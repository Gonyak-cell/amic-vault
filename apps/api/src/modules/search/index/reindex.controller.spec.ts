import { describe, expect, it } from 'vitest';
import { REQUIRED_ROLES_KEY } from '../../../common/decorators/require-roles.decorator';
import { ReindexController } from './reindex.controller';

describe('ReindexController', () => {
  it('keeps reindex and search health routes admin-only', () => {
    const requestRoles = Reflect.getMetadata(
      REQUIRED_ROLES_KEY,
      ReindexController.prototype.requestReindex,
    );
    const healthRoles = Reflect.getMetadata(
      REQUIRED_ROLES_KEY,
      ReindexController.prototype.getSearchHealth,
    );

    expect(requestRoles).toEqual(['firm_admin', 'security_admin']);
    expect(healthRoles).toEqual(['firm_admin', 'security_admin']);
  });
});
