import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { InventoryModule } from '../inventory/inventory.module';
import { AuditModule } from '../audit/audit.module';

@Module({ imports: [AuthModule, InventoryModule, AuditModule], controllers: [OrderController], providers: [OrderService], exports: [OrderService] })
export class OrderModule {}
