import {
  IsNotEmpty,
  IsString,
  IsNumber,
  ValidateNested,
  IsArray,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LedgerDto {
  @IsNotEmpty()
  @IsString()
  customerName!: string;

  @IsNumber()
  creditLimit?: number;

  @IsNumber()
  closingBalance?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BillDto)
  bills!: BillDto[];
}

export class BillDto {
  @IsOptional()
  @IsString()
  tallyOrdId?: string;

  @IsOptional()
  @IsString()
  nxOrderId?: string;

  @IsOptional()
  @IsString()
  tallyInvNo?: string;

  @IsOptional()
  @IsString()
  billDate?: string;

  @IsOptional()
  @IsNumber()
  openingBalance?: number;

  @IsOptional()
  @IsNumber()
  closingBalance?: number;

  @IsOptional()
  @IsString()
  creditPeriod?: string;
}

export class LedgerVoucherDto {
  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  ledger?: string;

  @IsOptional()
  @IsString()
  voucherType?: string;

  @IsOptional()
  @IsString()
  voucherNo?: string;

  @IsOptional()
  @IsNumber()
  debitAmount?: number;

  @IsOptional()
  @IsNumber()
  creditAmount?: number;
}

export class LedgerStatementDto {
  @IsNotEmpty()
  @IsString()
  party!: string;

  @IsOptional()
  @IsString()
  alias?: string;

  @IsOptional()
  openingBalance?: number;

  @IsOptional()
  closingBalance?: number;

  @IsOptional()
  totalDebitAmount?: number;

  @IsOptional()
  totalCreditAmount?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LedgerVoucherDto)
  ledgerVouchers!: LedgerVoucherDto[];
}
