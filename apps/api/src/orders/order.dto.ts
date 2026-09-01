import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { OrderStatus } from '@prisma/client';

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
