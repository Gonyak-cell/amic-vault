import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  createEnterpriseBackupSnapshotRequestSchema,
  createEnterpriseComplianceEvidenceRequestSchema,
  upsertEnterpriseDmsSearchRefinerRequestSchema,
  upsertEnterpriseDmsTaxonomyRequestSchema,
  createEnterpriseKeyReferenceRequestSchema,
  createEnterpriseSiemExportRequestSchema,
  createEnterpriseSsoProviderRequestSchema,
} from '@amic-vault/shared';
import type { RequestWithSession } from '../auth/session.guard';
import { EnterpriseService } from './enterprise.service';

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function parseOrValidation<T>(parse: () => T): T {
  try {
    return parse();
  } catch {
    throw validationFailed();
  }
}

function parseUuidParam(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw validationFailed();
  }
  return value;
}

function permissionContext(request: RequestWithSession): {
  tenantId: string;
  userId: string;
  sessionId: string;
} {
  const tenantId = request.session?.tenantId;
  const userId = request.session?.userId;
  const sessionId = request.session?.sessionId;
  if (!tenantId || !userId || !sessionId) throw validationFailed();
  return { tenantId, userId, sessionId };
}

@Controller('enterprise')
export class EnterpriseController {
  constructor(@Inject(EnterpriseService) private readonly enterprise: EnterpriseService) {}

  @Post('sso-providers')
  createSsoProvider(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() =>
      createEnterpriseSsoProviderRequestSchema.parse(body ?? {}),
    );
    return this.enterprise.createSsoProvider(permissionContext(request), input);
  }

  @Get('sso-providers')
  listSsoProviders(@Req() request: RequestWithSession) {
    return this.enterprise.listSsoProviders(permissionContext(request));
  }

  @Post('sso-providers/:providerId/activate')
  activateSsoProvider(@Req() request: RequestWithSession, @Param('providerId') providerId: string) {
    return this.enterprise.activateSsoProvider(permissionContext(request), parseUuidParam(providerId));
  }

  @Get('sso/metadata')
  spMetadata(@Req() request: RequestWithSession) {
    return this.enterprise.spMetadata(permissionContext(request));
  }

  @Post('key-references')
  createKeyReference(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() =>
      createEnterpriseKeyReferenceRequestSchema.parse(body ?? {}),
    );
    return this.enterprise.createKeyReference(permissionContext(request), input);
  }

  @Get('key-references')
  listKeyReferences(@Req() request: RequestWithSession) {
    return this.enterprise.listKeyReferences(permissionContext(request));
  }

  @Post('key-references/:keyReferenceId/verify')
  verifyKeyReference(
    @Req() request: RequestWithSession,
    @Param('keyReferenceId') keyReferenceId: string,
  ) {
    return this.enterprise.verifyKeyReference(
      permissionContext(request),
      parseUuidParam(keyReferenceId),
    );
  }

  @Post('siem/exports')
  createSiemExport(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() =>
      createEnterpriseSiemExportRequestSchema.parse(body ?? {}),
    );
    return this.enterprise.createSiemExport(permissionContext(request), input);
  }

  @Get('siem/exports')
  listSiemExports(@Req() request: RequestWithSession) {
    return this.enterprise.listSiemExports(permissionContext(request));
  }

  @Post('backups/snapshots')
  createBackupSnapshot(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() =>
      createEnterpriseBackupSnapshotRequestSchema.parse(body ?? {}),
    );
    return this.enterprise.createBackupSnapshot(permissionContext(request), input);
  }

  @Get('backups/snapshots')
  listBackupSnapshots(@Req() request: RequestWithSession) {
    return this.enterprise.listBackupSnapshots(permissionContext(request));
  }

  @Post('compliance/evidence')
  createComplianceEvidence(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() =>
      createEnterpriseComplianceEvidenceRequestSchema.parse(body ?? {}),
    );
    return this.enterprise.createComplianceEvidence(permissionContext(request), input);
  }

  @Get('compliance/evidence')
  listComplianceEvidence(@Req() request: RequestWithSession) {
    return this.enterprise.listComplianceEvidence(permissionContext(request));
  }

  @Get('readiness')
  readiness(@Req() request: RequestWithSession) {
    return this.enterprise.readiness(permissionContext(request));
  }

  @Post('dms/taxonomies')
  upsertDmsTaxonomy(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() =>
      upsertEnterpriseDmsTaxonomyRequestSchema.parse(body ?? {}),
    );
    return this.enterprise.upsertDmsTaxonomy(permissionContext(request), input);
  }

  @Get('dms/taxonomies')
  listDmsTaxonomies(@Req() request: RequestWithSession) {
    return this.enterprise.listDmsTaxonomies(permissionContext(request));
  }

  @Get('dms/taxonomies/approved')
  listApprovedDmsTaxonomies(@Req() request: RequestWithSession) {
    return this.enterprise.listApprovedDmsTaxonomies(permissionContext(request));
  }

  @Post('dms/taxonomies/:taxonomyId/disable')
  disableDmsTaxonomy(@Req() request: RequestWithSession, @Param('taxonomyId') taxonomyId: string) {
    return this.enterprise.disableDmsTaxonomy(
      permissionContext(request),
      parseUuidParam(taxonomyId),
    );
  }

  @Post('dms/search-refiners')
  upsertDmsSearchRefiner(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() =>
      upsertEnterpriseDmsSearchRefinerRequestSchema.parse(body ?? {}),
    );
    return this.enterprise.upsertDmsSearchRefiner(permissionContext(request), input);
  }

  @Get('dms/search-refiners')
  listDmsSearchRefiners(@Req() request: RequestWithSession) {
    return this.enterprise.listDmsSearchRefiners(permissionContext(request));
  }

  @Post('dms/search-refiners/:refinerId/disable')
  disableDmsSearchRefiner(@Req() request: RequestWithSession, @Param('refinerId') refinerId: string) {
    return this.enterprise.disableDmsSearchRefiner(
      permissionContext(request),
      parseUuidParam(refinerId),
    );
  }
}
