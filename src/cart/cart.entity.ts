// cart.entity.ts
import { ItemEntity } from './../fetch-products/item.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('CartItems')
export class CartItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ItemEntity, { eager: true }) // Fetch related product details
  product!: ItemEntity;

  @Column({ default: 1 })
  noOfPkg!: number;

  @Column({ default: 1 })
  quantity!: number;

  @Column({ type: 'float', default: 0 }) // Set default value for discount, use float type for decimal values
  discount!: number; // Ensure discount defaults to 0 if not provided

  @Column()
  userId!: string; // Associate with the user (assuming you have users)
  price!: number;

  @CreateDateColumn()
  createdAt!: Date; // Timestamp to maintain insertion order
}
