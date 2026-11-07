import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { OrderItemEntity } from './order.item.entity';
import { DeliveryType } from './order.dto'; // Import enums from DTO
import { UserEntity } from './../user/users.entity';
import { AddressEntity } from './../addresses/addresses.entity';
import { OrderStatus } from './order.enums';

@Entity('orders')
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  orderNo!: string;

  @ManyToOne(() => UserEntity, (user) => user.orders, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  user!: UserEntity; // Made non-nullable

  @ManyToOne(() => AddressEntity, (address) => address.orders, {
    nullable: false,
  })
  address!: AddressEntity; // Made non-nullable

  @OneToMany(() => OrderItemEntity, (orderItem) => orderItem.order) // Add relation to OrderItemEntity
  orderItems!: OrderItemEntity[];

  @Column('float')
  totalPrice!: number;

  @Column('float')
  noOfPkgs!: number;

  @Column('float')
  stdPkgs!: number;

  @Column('float')
  totalQuantity!: number;

  @Column('float', { default: 0 }) // Use 'float' or 'decimal' for fractional values
  discount!: number; // Ensure discount defaults to 0 if not provided

  @Column('float') // Set default value for discount
  finalAmount!: number; // Ensure discount defaults to 0 if not provided

  @Column('float', { default: 0 })
  cgst!: number; // CGST amount

  @Column('float', { default: 0 })
  sgst!: number; // SGST amount

  @Column('float', { default: 0 })
  igst!: number; // IGST amount

  @Column('float', { default: 0 })
  totalGst!: number; // Total GST amount (CGST + SGST + IGST)

  @Column({
    type: 'enum',
    enum: DeliveryType,
    default: DeliveryType.transportation,
  })
  delivery!: DeliveryType; // Delivery type, default is 'free'

  // Add status column with enum and default value
  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status!: OrderStatus; // Order status, default is 'pending'

  @Column('simple-array', { nullable: true }) // For storing  file paths
  invoicePdf!: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt?: Date | null;
}
//
