import { BadRequestException, Body, Controller, Get, Inject, Post, Req } from '@nestjs/common';
import {
  createScaleAiGateReviewRequestSchema,
  createScaleCostSnapshotRequestSchema,
  createScaleEvalRunRequestSchema,
  createScaleLearningEventRequestSchema,
  createScaleMigrationDrillRequestSchema,
  createScalePerformanceRunRequestSchema,
} from '@amic-vault/shared';
import type { RequestWithSession } from '../auth/session.guard';
import { ScaleService } from './scale.service';

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

@Controller('scale')
export class ScaleController {
  constructor(@Inject(ScaleService) private readonly scale: ScaleService) {}

  @Post('performance-runs')
  createPerformanceRun(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createScalePerformanceRunRequestSchema.parse(body ?? {}));
    return this.scale.createPerformanceRun(permissionContext(request), input);
  }

  @Get('performance-runs')
  listPerformanceRuns(@Req() request: RequestWithSession) {
    return this.scale.listPerformanceRuns(permissionContext(request));
  }

  @Post('cost-snapshots')
  createCostSnapshot(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createScaleCostSnapshotRequestSchema.parse(body ?? {}));
    return this.scale.createCostSnapshot(permissionContext(request), input);
  }

  @Get('cost-snapshots')
  listCostSnapshots(@Req() request: RequestWithSession) {
    return this.scale.listCostSnapshots(permissionContext(request));
  }

  @Post('eval-runs')
  createEvalRun(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createScaleEvalRunRequestSchema.parse(body ?? {}));
    return this.scale.createEvalRun(permissionContext(request), input);
  }

  @Get('eval-runs')
  listEvalRuns(@Req() request: RequestWithSession) {
    return this.scale.listEvalRuns(permissionContext(request));
  }

  @Post('migration-drills')
  createMigrationDrill(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createScaleMigrationDrillRequestSchema.parse(body ?? {}));
    return this.scale.createMigrationDrill(permissionContext(request), input);
  }

  @Get('migration-drills')
  listMigrationDrills(@Req() request: RequestWithSession) {
    return this.scale.listMigrationDrills(permissionContext(request));
  }

  @Post('learning-events')
  createLearningEvent(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createScaleLearningEventRequestSchema.parse(body ?? {}));
    return this.scale.createLearningEvent(permissionContext(request), input);
  }

  @Get('learning-events')
  listLearningEvents(@Req() request: RequestWithSession) {
    return this.scale.listLearningEvents(permissionContext(request));
  }

  @Post('ai-gate-reviews')
  createAiGateReview(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createScaleAiGateReviewRequestSchema.parse(body ?? {}));
    return this.scale.createAiGateReview(permissionContext(request), input);
  }

  @Get('ai-gate-reviews')
  listAiGateReviews(@Req() request: RequestWithSession) {
    return this.scale.listAiGateReviews(permissionContext(request));
  }

  @Get('readiness')
  readiness(@Req() request: RequestWithSession) {
    return this.scale.readiness(permissionContext(request));
  }
}
