import { Global, Module } from '@nestjs/common';
import { TenantContext } from './tenant-context';
import { TenantIsolationGuard } from './tenant-isolation.guard';

@Global()
@Module({ providers: [TenantContext, TenantIsolationGuard], exports: [TenantContext, TenantIsolationGuard] })
export class TenantModule {}
