import {
  IsNotEmpty,
  IsString,
  IsEmail,
  IsNumber,
  IsOptional,
  Min,
  IsUUID,
  IsArray,
} from 'class-validator';

export class AddressDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @IsString()
  mobile!: string;

  @IsNotEmpty()
  @IsString()
  address!: string;

  @IsNotEmpty()
  @IsString()
  state!: string;

  @IsNotEmpty()
  @IsString()
  country!: string;

  @IsNotEmpty()
  @IsString()
  pincode!: string;
}

export class ProductItemDto {
  @IsNotEmpty()
  @IsString()
  id!: string;

  @IsNotEmpty()
  @IsString()
  itemName!: string;

  @IsNumber()
  @Min(1)
  noOfPkg!: number;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  sellingPrice!: number;

  @IsNumber()
  @Min(0)
  stdPkg!: number;

  @IsNumber()
  @Min(0)
  subtotal!: number;

  @IsOptional()
  @IsString()
  coverUrl?: string;

  @IsOptional()
  productImages?: string[];
}

export class CreateCheckoutDto {
  @IsNotEmpty()
  address!: AddressDto;

  @IsNotEmpty()
  @IsArray()
  products!: ProductItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  subtotal?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  total?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateCheckoutStatusDto {
  @IsNotEmpty()
  @IsString()
  status!: string; // pending, confirmed, shipped, delivered, cancelled
}

export class GetCheckoutDto {
  @IsOptional()
  @IsUUID()
  checkoutId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
