import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { Currency, OrderStatus } from '@prisma/client';

export class ListOrdersDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  keyword?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;
}

export class CreateOrderItemDto {
  @IsString()
  @MinLength(1)
  skuId!: string;

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

export class CreateOrderDto {
  @IsString()
  @MinLength(1)
  storeId!: string;

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
  @Length(6, 80)
  orderNo?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
