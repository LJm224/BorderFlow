import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { TenantModule } from './tenants/tenant.module';
import { PinoLogger } from './infrastructure/pino.logger';
import { RequestIdMiddleware } from './infrastructure/request-id.middleware';
import { ProductModule } from './products/product.module';
import { OrderModule } from './orders/order.module';
import { InventoryModule } from './inventory/inventory.module';

@Module({ imports: [DatabaseModule, TenantModule, AuthModule, ProductModule, OrderModule, InventoryModule, HealthModule], providers: [PinoLogger], exports: [PinoLogger] })
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
