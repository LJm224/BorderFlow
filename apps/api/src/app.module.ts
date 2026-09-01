import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { PinoLogger } from './infrastructure/pino.logger';
import { RequestIdMiddleware } from './infrastructure/request-id.middleware';

@Module({ imports: [DatabaseModule, AuthModule, HealthModule], providers: [PinoLogger], exports: [PinoLogger] })
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
