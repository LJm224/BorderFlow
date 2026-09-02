import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { TenantIsolationGuard } from '../tenants/tenant-isolation.guard';
import { CurrentTenantId } from '../tenants/current-tenant.decorator';
import { ListAuditLogsDto } from './audit.dto';
import { AuditLogService } from './audit.service';

@ApiTags('audit-logs')
@ApiBearerAuth()
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, TenantIsolationGuard, PermissionsGuard)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @RequirePermissions('audit:read')
  list(@CurrentTenantId() tenantId: string, @Query() query: ListAuditLogsDto) {
    return this.auditLogService.list(tenantId, query);
  }
}
