import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { Currency, ProductStatus } from '@prisma/client';

export class ListProductsDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  keyword?: string;

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

export class CreateSkuDto {
  @IsString()
  @MinLength(1)
  @Length(1, 80)
  skuCode!: string;

  @IsString()
  @MinLength(1)
  @Length(1, 160)
  variantName!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  weight!: number;
}

export class UpdateSkuDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @Length(1, 80)
  skuCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @Length(1, 160)
  variantName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  weight?: number;
}

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @Length(1, 200)
  name!: string;

  @IsString()
  @Length(0, 5000)
  description = '';

  @IsString()
  @Length(2, 8)
  market!: string;

  @IsEnum(Currency)
  currency!: Currency;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateSkuDto)
  skus?: CreateSkuDto[];
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 5000)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(2, 8)
  market?: string;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;
}

export class UpdateProductStatusDto {
  @IsEnum(ProductStatus)
  status!: ProductStatus;
}
