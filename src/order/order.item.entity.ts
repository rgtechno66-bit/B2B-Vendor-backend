import { ItemEntity } from './../fetch-products/item.entity';
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { OrderEntity } from './order.entity';

@Entity('ordersItem')
export class OrderItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => OrderEntity, (order) => order.orderItems, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  order!: OrderEntity; // Link to the order

  @ManyToOne(() => ItemEntity, (product) => product.orderItem, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  product!: ItemEntity; // Changed user? to user! to enforce non-nullable constraint

  @Column()
  quantity!: number;

  @Column('float', { default: 0 })
  discount!: number; // Per-item discount

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt?: Date;
}
