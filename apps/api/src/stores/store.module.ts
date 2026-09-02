import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';

@Module({ imports: [AuthModule, AuditModule], controllers: [StoreController], providers: [StoreService], exports: [StoreService] })
export class StoreModule {}
