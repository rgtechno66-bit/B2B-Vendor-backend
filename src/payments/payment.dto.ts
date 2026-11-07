import {
  IsNotEmpty,
  IsString,
  IsEnum,
  ValidateIf,
  IsEmail,
  Matches,
  Length,
  IsOptional,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum PaymentType {
  BANK = 'Bank',
  UPIType = 'UPI',
  PAYPAL = 'Paypal',
}

export enum UpiProvider {
  GOOGLE_PAY = 'Google Pay',
  PHONE_PE = 'PhonePe',
  PAYTM = 'Paytm',
  BHIM = 'BHIM',
  OTHER = 'Other',
}

// IFC Valid Formats
//------------------
// SBIN0001234
// HDFC0001234
// ICIC0001234
// AXIS0001234
// PNB0001234
//-------------------
export class BankAccountDto {
  @IsNotEmpty({ message: 'Payment type is required' })
  @IsEnum(PaymentType, { message: 'Type must be Bank, UPI, or Paypal' })
  type!: PaymentType;

  // Bank Account Validation
  @ValidateIf((o) => o.type === PaymentType.BANK)
  @IsNotEmpty({ message: 'Bank name is required for bank accounts' })
  @IsString({ message: 'Bank name must be a string' })
  @Length(2, 100, {
    message: 'Bank name must be between 2 and 100 characters',
  })
  @Matches(/^[a-zA-Z0-9\s.&'-]+$/, {
    message: 'Bank name contains invalid characters',
  })
  bankName?: string;

  @ValidateIf((o) => o.type === PaymentType.BANK)
  @IsNotEmpty({ message: 'Account name is required for bank accounts' })
  @IsString({ message: 'Account name must be a string' })
  @Length(3, 100, {
    message: 'Account name must be between 3 and 100 characters',
  })
  @Matches(/^[a-zA-Z\s]+$/, {
    message: 'Account name can only contain letters and spaces',
  })
  accountName?: string;

  @ValidateIf((o) => o.type === PaymentType.BANK)
  @IsNotEmpty({ message: 'Account number is required for bank accounts' })
  @IsString({ message: 'Account number must be a string' })
  @Length(9, 18, { message: 'Account number must be between 9 and 18 digits' })
  @Matches(/^\d+$/, { message: 'Account number must contain only digits' })
  @Transform(({ value }) => value?.replace(/\s/g, '')) // Remove spaces
  accountNumber?: string;

  @ValidateIf((o) => o.type === PaymentType.BANK)
  @IsNotEmpty({ message: 'IFSC code is required for bank accounts' })
  @IsString({ message: 'IFSC code must be a string' })
  @Length(11, 11, { message: 'IFSC code must be exactly 11 characters' })
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, {
    message:
      'IFSC code must be in format: 4 letters + 0 + 6 alphanumeric characters',
  })
  @Transform(({ value }) => value?.toUpperCase()) // Convert to uppercase
  ifscCode?: string;

  // UPI Validation
  @ValidateIf((o) => o.type === PaymentType.UPIType)
  @IsNotEmpty({ message: 'UPI provider is required for UPI accounts' })
  @IsEnum(UpiProvider, { message: 'Invalid UPI provider' })
  upiProvider?: UpiProvider;

  @ValidateIf((o) => o.type === PaymentType.UPIType)
  @IsNotEmpty({ message: 'UPI ID is required for UPI accounts' })
  @IsString({ message: 'UPI ID must be a string' })
  @Length(5, 50, { message: 'UPI ID must be between 5 and 50 characters' })
  @Matches(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$/, {
    message: 'UPI ID must be in valid format (e.g., username@upi)',
  })
  @Transform(({ value }) => value?.toLowerCase()) // Convert to lowercase
  upiId?: string;

  @ValidateIf((o) => o.type === PaymentType.UPIType)
  @IsOptional()
  @IsString({ message: 'QR code image URL must be a string' })
  qrCodeImageUrl?: string;

  // PayPal Validation
  @ValidateIf((o) => o.type === PaymentType.PAYPAL)
  @IsNotEmpty({ message: 'PayPal email is required for PayPal accounts' })
  @IsString({ message: 'PayPal email must be a string' })
  @Matches(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, {
    message: 'Please provide a valid email address format',
  })
  @Transform(({ value }) => value?.toLowerCase().trim()) // Convert to lowercase and trim
  paypalEmail?: string;
}

// Response DTO for masking sensitive data
export class BankAccountResponseDto {
  id!: string;
  type!: PaymentType;
  upiProvider?: UpiProvider;
  bankName?: string;
  accountName?: string;
  accountNumber?: string; // Will be masked
  ifscCode?: string;
  upiId?: string; // Will be masked
  paypalEmail?: string; // Will be masked
  qrCodeImageUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
