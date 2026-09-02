import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ChannelController } from './channel.controller';
import { ChannelService } from './channel.service';
import { ShopifyController } from './shopify.controller';

@Module({ imports: [AuthModule, AuditModule], controllers: [ChannelController, ShopifyController], providers: [ChannelService], exports: [ChannelService] })
export class ChannelModule {}
