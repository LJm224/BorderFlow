import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { Currency } from '@prisma/client';

export class CreateChannelSkuMappingDto {
  @IsString()
  @MinLength(1)
  skuId!: string;

  @IsString()
  @MinLength(1)
  @Length(1, 120)
  externalSku!: string;
}

export class MockShopifyOrderItemDto {
  @IsString()
  @MinLength(1)
  externalSku!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;
}

export class MockShopifyOrderDto {
  @IsString()
  @MinLength(1)
  @Length(1, 120)
  externalOrderId!: string;

  @IsOptional()
  @IsString()
  @Length(6, 80)
  orderNo?: string;

  @IsOptional()
  @IsString()
  @Length(2, 8)
  market?: string;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsString()
  @Length(2, 80)
  shippingCountry!: string;

  @IsOptional()
  @IsString()
  @IsEnum(['paid', 'pending'] as const)
  financialStatus?: 'paid' | 'pending';

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MockShopifyOrderItemDto)
  items!: MockShopifyOrderItemDto[];
}

export class ImportMockShopifyOrdersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MockShopifyOrderDto)
  orders!: MockShopifyOrderDto[];
}
