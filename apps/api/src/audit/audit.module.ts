import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { TenantModule } from '../tenants/tenant.module';
import { AuditLogController } from './audit.controller';
import { AuditLogService } from './audit.service';

@Module({
  imports: [DatabaseModule, AuthModule, TenantModule],
  controllers: [AuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditModule {}
