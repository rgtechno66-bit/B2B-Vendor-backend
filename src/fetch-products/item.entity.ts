// Item.entity.ts
import { OrderItemEntity } from './../order/order.item.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('Items')
export class ItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string; // Change to string to match UUID format

  @Column()
  itemName!: string; // This should correspond to the actual property

  @Column({ type: 'varchar', nullable: true })
  alias!: string;

  @Column({ type: 'varchar', nullable: true })
  partNo!: string;

  @Column({ type: 'varchar', nullable: true })
  description!: string;

  @Column({ type: 'varchar', nullable: true })
  group!: string;

  @Column({ type: 'varchar', nullable: true })
  subGroup1?: string;

  @Column({ type: 'varchar', nullable: true })
  subGroup2?: string;

  @Column('integer') // or 'float' if decimals are allowed
  stdPkg!: number;

  @Column('integer') // or 'float' if decimals are allowed
  stdWeight!: number;

  @Column({ type: 'varchar', nullable: true })
  baseUnit!: string;

  @Column({ type: 'varchar', nullable: true })
  alternateUnit!: string;

  @Column({ type: 'varchar', nullable: true })
  conversion!: string;

  @Column({ type: 'varchar', nullable: true })
  denominator!: number;

  @Column({ type: 'varchar', nullable: true })
  sellingPriceDate!: string;

  @Column({ type: 'float' })
  sellingPrice!: number;

  @Column({ type: 'varchar', nullable: true })
  gstApplicable!: string;

  @Column({ type: 'varchar', nullable: true })
  gstApplicableDate!: string;

  @Column({ type: 'varchar', nullable: true })
  taxability!: string;

  @Column() // Set default value for discount
  gstRate!: number;

  @Column({ type: 'integer', default: 1 }) // New popularity column
  popularity!: number;

  /** Manual / synced total sales amount — used for Top Hot Products ranking */
  @Column({ type: 'float', nullable: true, default: 0 })
  totalSalesAmount?: number;

  @Column({ type: 'varchar', length: 8, unique: true, nullable: true })
  masterID?: string; // 8-digit sequential number (e.g., "10000001")

  @Column('simple-array', { nullable: true }) // For storing product image paths
  productImages!: string[];

  @Column('simple-array', { nullable: true }) // For storing dimensional file paths
  dimensionalFiles!: string[];
  orderItems: any;

  @OneToMany(() => OrderItemEntity, (order) => order.product)
  orderItem?: OrderItemEntity[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
