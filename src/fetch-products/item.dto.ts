// item.dto.js
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsDateString,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ItemDto {
  @IsNotEmpty()
  @IsString()
  itemName!: string;

  @IsOptional()
  @IsString()
  alias!: string;

  @IsOptional()
  @IsString()
  partNo?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsString()
  group?: string;

  @IsNotEmpty()
  @IsString()
  subGroup1?: string;

  @IsNotEmpty()
  @IsString()
  subGroup2?: string;

  @IsNotEmpty()
  @IsNumber()
  stdPkg?: number;

  @IsNotEmpty()
  @IsNumber()
  stdWeight?: number;

  @IsNotEmpty()
  @IsString()
  baseUnit?: string;

  @IsNotEmpty()
  @IsString()
  alternateUnit?: string;

  @IsOptional()
  @IsString()
  conversion?: string;

  @IsNotEmpty()
  @IsNumber()
  denominator?: number;

  @IsNotEmpty()
  @IsDateString()
  sellingPriceDate?: string;

  @IsNotEmpty()
  @IsNumber()
  sellingPrice?: number;

  @IsNotEmpty()
  @IsString()
  gstApplicable?: string;

  @IsNotEmpty()
  @IsDateString()
  gstApplicableDate?: string;

  @IsNotEmpty()
  @IsString()
  taxability?: string;

  @IsNotEmpty()
  @IsNumber()
  gstRate?: number;

  @IsNotEmpty()
  @IsNumber()
  popularity?: number;

  @IsOptional()
  @IsNumber()
  totalSalesAmount?: number;
}

/** One product entry for totalSalesAmount update */
export class UpdateTotalSalesAmountItemDto {
  @IsOptional()
  @IsString()
  masterID?: string;

  @IsOptional()
  @IsString()
  itemName?: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  totalSalesAmount!: number;
}

/** POST body: bulk update — { data: [ { masterID, itemName, totalSalesAmount }, ... ] } */
export class UpdateTotalSalesAmountBulkDto {
  @IsArray()
  @IsNotEmpty()
  @Type(() => UpdateTotalSalesAmountItemDto)
  data!: UpdateTotalSalesAmountItemDto[];
}
