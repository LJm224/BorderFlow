import { IsBoolean, IsEnum, IsOptional, IsString, Length, MinLength } from 'class-validator';
import { ChannelType, Currency } from '@prisma/client';

export class CreateStoreDto {
  @IsString()
  @MinLength(1)
  @Length(1, 120)
  name!: string;

  @IsEnum(ChannelType)
  channelType!: ChannelType;

  @IsOptional()
  @IsEnum(Currency)
  defaultCurrency?: Currency;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  timezone?: string;
}

export class UpdateStoreDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsEnum(Currency)
  defaultCurrency?: Currency;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListWarehousesQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  storeId?: string;
}

export class CreateWarehouseDto {
  @IsString()
  @MinLength(1)
  @Length(1, 120)
  name!: string;

  @IsString()
  @MinLength(1)
  storeId!: string;
}

export class UpdateWarehouseDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @Length(1, 120)
  name?: string;
}
