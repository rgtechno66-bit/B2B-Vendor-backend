import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { UserEntity } from '../user/users.entity';

@Entity('CheckoutOrders')
export class CheckoutEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  // Address Information
  @Column()
  name!: string;

  @Column()
  email!: string;

  @Column()
  mobile!: string;

  @Column()
  address!: string;

  @Column()
  state!: string;

  @Column()
  country!: string;

  @Column()
  pincode!: string;

  // Order Information
  @Column({ unique: true, nullable: true })
  orderNo!: string; // Format: ORD-YYYYMMDD-XXXX

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  subtotal!: number | string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  discount!: number | string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total!: number | string;

  @Column({ default: 'pending' })
  status!: string; // pending, confirmed, shipped, delivered, cancelled

  // Product Information (JSON)
  @Column({ type: 'json', nullable: true })
  products!: any[]; // Store complete product information

  @Column({ nullable: true })
  emailPdf!: string; // Cloudinary URL for the email PDF

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
