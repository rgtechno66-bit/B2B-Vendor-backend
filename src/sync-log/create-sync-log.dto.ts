import {
  IsNotEmpty,
  IsString,
  IsInt,
  IsOptional,
  Min,
  IsEnum,
} from 'class-validator';

export class CreateSyncLogDto {
  @IsNotEmpty()
  @IsString()
  sync_type!: string; // 'orders', 'products', etc.

  @IsNotEmpty()
  @IsEnum(['success', 'fail'], {
    message: 'Status must be either success or fail',
  })
  status!: string; // 'success' or 'fail'
}
