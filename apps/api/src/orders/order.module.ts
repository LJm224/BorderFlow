import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { InventoryModule } from '../inventory/inventory.module';

@Module({ imports: [AuthModule, InventoryModule], controllers: [OrderController], providers: [OrderService], exports: [OrderService] })
export class OrderModule {}
