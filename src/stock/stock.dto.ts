// stock.dto.ts
import { IsString, IsOptional } from 'class-validator';

export class StockDto {
  @IsString()
  itemName!: string;

  @IsString()
  group!: string;

  @IsOptional()
  @IsString()
  subGroup1?: string;

  @IsOptional()
  @IsString()
  subGroup2?: string;

  @IsString()
  quantity?: string;
}
