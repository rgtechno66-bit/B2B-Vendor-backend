import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AddressType } from './addresses.entity';

export class CreateAddressDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  mobile?: string;

  @IsString()
  @IsNotEmpty()
  street_address?: string;

  @IsString()
  @IsNotEmpty()
  state?: string;

  @IsString()
  @IsEnum(AddressType)
  addressType?: AddressType;

  @IsString()
  @IsNotEmpty()
  zip_code?: string;

  @IsString()
  @IsNotEmpty()
  country?: string;
}

export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  street_address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  zip_code?: string;

  @IsOptional()
  @IsString()
  country?: string;
}
