import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { OrderStatus } from './order.enums';

export enum DeliveryType {
  FREE = 'free',
  transportation = 'Transportation',
  self_pickup = 'Self Pickup',
}

export class CreateOrderDto {
  @IsNotEmpty()
  cartId?: string; // Address ID for the order

  @IsNotEmpty()
  addressId?: string; // Address ID for the order

  @IsNumber()
  totalPrice?: number; // Total price of the order

  @IsNumber()
  noOfPkgs?: number; // Total price of the order

  @IsNumber()
  totalQuantity?: number; // Total price of the order

  @IsNumber()
  stdPkgs?: number; // Total price of the order

  @IsNumber()
  discount?: number; // Optional discount, default to 0 if not provided

  @IsNumber()
  finalAmount?: number; // Total price of the order

  @IsNumber()
  @IsOptional()
  cgst?: number; // CGST amount

  @IsNumber()
  @IsOptional()
  sgst?: number; // SGST amount

  @IsNumber()
  @IsOptional()
  igst?: number; // IGST amount

  @IsNumber()
  @IsOptional()
  totalGst?: number; // Total GST amount

  @IsEnum(DeliveryType)
  @IsOptional()
  delivery: DeliveryType = DeliveryType.transportation; // Default value is 'free'
}

export class ProductOrderDto {
  @IsNotEmpty()
  productId!: string;

  @IsNumber()
  quantity!: number;

  @IsNumber()
  @IsOptional()
  discount?: number; // Per-item discount
}

export class CreateItemOrderDto {
  @IsNotEmpty()
  orderId!: string;

  @ValidateNested({ each: true })
  @Type(() => ProductOrderDto)
  @ArrayMinSize(1) // Ensure there's at least one item
  products!: ProductOrderDto[];
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  @IsNotEmpty()
  status!: OrderStatus;
}
