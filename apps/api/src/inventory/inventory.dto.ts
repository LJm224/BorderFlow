import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { InventoryTransactionType } from '@prisma/client';

export class ListInventoryDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  keyword?: string;

  @IsOptional()
  @IsString()
  skuId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

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

export class ListWarehousesDto {
  @IsOptional()
  @IsString()
  storeId?: string;
}

export class InitializeInventoryDto {
  @IsString()
  skuId!: string;

  @IsString()
  warehouseId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000)
  initialQuantity = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000)
  alertThreshold = 0;
}

export class AdjustInventoryDto {
  @IsString()
  skuId!: string;

  @IsString()
  warehouseId!: string;

  @IsEnum(InventoryTransactionType)
  @IsIn([InventoryTransactionType.RESTOCK, InventoryTransactionType.SALE, InventoryTransactionType.ADJUSTMENT])
  type!: InventoryTransactionType;

  @Type(() => Number)
  @IsInt()
  @Min(-1000000)
  @Max(1000000)
  quantity!: number;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;
}
