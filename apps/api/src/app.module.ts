import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { PinoLogger } from './infrastructure/pino.logger';
import { RequestIdMiddleware } from './infrastructure/request-id.middleware';

@Module({ imports: [HealthModule], providers: [PinoLogger], exports: [PinoLogger] })
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
