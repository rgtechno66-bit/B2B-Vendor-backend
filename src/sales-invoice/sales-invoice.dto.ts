import {
  IsNotEmpty,
  IsString,
  IsNumber,
  ValidateNested,
  IsArray,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SalesInvoiceItemDescriptionDto {
  @IsOptional()
  @IsString()
  desc?: string;
}

export class SalesInvoiceItemDto {
  @IsOptional()
  @IsString()
  orderNo?: string;

  @IsOptional()
  @IsString()
  orderDue?: string;

  @IsOptional()
  @IsString()
  itemName?: string;

  @IsOptional()
  @IsString()
  nxItemCode?: string;

  @IsOptional()
  @IsString()
  partNo?: string;

  @IsOptional()
  @IsString()
  baseUnits?: string;

  @IsOptional()
  @IsNumber()
  actualQty?: number;

  @IsOptional()
  @IsNumber()
  billedQty?: number;

  @IsOptional()
  @IsNumber()
  inclRate?: number;

  @IsOptional()
  @IsNumber()
  rate?: number;

  @IsOptional()
  @IsNumber()
  discPerc?: number;

  @IsOptional()
  @IsNumber()
  discAmt?: number;

  @IsOptional()
  @IsNumber()
  discProp?: number;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsString()
  accountingName?: string;

  @IsOptional()
  @IsNumber()
  gstPer?: number;

  @IsOptional()
  @IsString()
  totalSalesAmt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesInvoiceItemDescriptionDto)
  Description?: SalesInvoiceItemDescriptionDto[];
}

export class SalesInvoicePaymentTermDto {
  @IsOptional()
  @IsString()
  terms?: string;
}

export class SalesInvoiceOrderDto {
  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  nxOrderId?: string;

  @IsOptional()
  @IsString()
  tlOrderId?: string;
}

export class SalesInvoiceLedgerDto {
  @IsOptional()
  @IsString()
  ledgerName?: string;

  @IsOptional()
  @IsNumber()
  ratePerc?: number;

  @IsOptional()
  @IsNumber()
  amount?: number;
}

export class SalesInvoiceDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  voucherNo?: string;

  @IsOptional()
  @IsString()
  voucherDate?: string;

  @IsOptional()
  @IsString()
  voucherType?: string;

  @IsOptional()
  @IsString()
  referenceNo?: string;

  @IsOptional()
  @IsString()
  guid?: string;

  @IsOptional()
  @IsString()
  masterId?: string;

  @IsOptional()
  @IsString()
  partyName?: string;

  @IsOptional()
  @IsNumber()
  closingBalance?: number;

  @IsOptional()
  @IsString()
  nxPartyCode?: string;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  partyGstin?: string;

  @IsOptional()
  @IsString()
  emailId?: string;

  @IsOptional()
  @IsString()
  mobileNumber?: string;

  @IsOptional()
  @IsString()
  buyerAddress?: string;

  @IsOptional()
  @IsString()
  eMail?: string;

  @IsOptional()
  @IsString()
  consigneeAddress?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  placeOfSupply?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesInvoicePaymentTermDto)
  PAYMENT_TERMS?: SalesInvoicePaymentTermDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesInvoiceOrderDto)
  ORDERS?: SalesInvoiceOrderDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesInvoiceItemDto)
  ITEMS?: SalesInvoiceItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesInvoiceLedgerDto)
  LEDGER?: SalesInvoiceLedgerDto[];
}

export class CreateSalesInvoiceVoucherDto {
  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesInvoiceDto)
  VOUCHER!: SalesInvoiceDto[];
}
