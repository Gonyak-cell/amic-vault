import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  createDlpReviewRequestSchema,
  type PermissionContext,
} from '@amic-vault/shared';
import { RequireRoles } from '../../common/decorators/require-roles.decorator';
import { RequireRolesGuard } from '../../common/guards/require-roles.guard';
import type { RequestWithSession } from '../auth/session.guard';
import { BulkDownloadMonitorService } from './bulk-download-monitor.service';
import { DlpService } from './dlp.service';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function permissionContext(request: RequestWithSession): PermissionContext {
  const tenantId = request.session?.tenantId;
  const userId = request.session?.userId;
  const sessionId = request.session?.sessionId;
  if (!tenantId || !userId || !sessionId) throw permissionDenied();
  return { tenantId, userId, sessionId };
}

@Controller('dlp')
export class DlpController {
  constructor(
    @Inject(BulkDownloadMonitorService)
    private readonly bulkDownloadMonitor: BulkDownloadMonitorService,
    @Inject(DlpService)
    private readonly dlpService: DlpService,
  ) {}

  @Get('behavior-alerts')
  @RequireRoles('firm_admin', 'security_admin')
  @UseGuards(RequireRolesGuard)
  listBehaviorAlerts(@Req() request: RequestWithSession) {
    return this.bulkDownloadMonitor.listBehaviorAlerts(permissionContext(request));
  }

  @Post('assessments/:assessmentId/reviews')
  @RequireRoles('firm_admin', 'security_admin')
  @UseGuards(RequireRolesGuard)
  createReview(
    @Req() request: RequestWithSession,
    @Param('assessmentId') assessmentId: string,
    @Body() body: unknown,
  ) {
    if (!uuidPattern.test(assessmentId)) throw validationFailed();
    const parsed = createDlpReviewRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw validationFailed();
    return this.dlpService.createReview(
      permissionContext(request),
      assessmentId,
      parsed.data,
    );
  }
}
