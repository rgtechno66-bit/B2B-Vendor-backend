// cart.dto.ts
import { IsNotEmpty, IsUUID, IsNumber, Min } from 'class-validator';

export class AddToCartItemDto {
  @IsNotEmpty()
  @IsUUID()
  productId!: string;

  @IsNumber()
  @Min(1)
  noOfPkg?: number; // Optional discount, default to 0 if not provided

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  discount?: number; // Optional discount, default to 0 if not provided
}

export class AddToCartDto {
  items?: AddToCartItemDto[]; // Array of items
}
