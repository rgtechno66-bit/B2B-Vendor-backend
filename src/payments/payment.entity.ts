import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentType, UpiProvider } from './payment.dto';

@Entity('bank_account_details')
export class BankAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: PaymentType })
  type!: PaymentType;

  @Column({ type: 'enum', enum: UpiProvider, nullable: true })
  upiProvider?: UpiProvider;

  @Column({ nullable: true })
  bankName?: string;

  @Column({ nullable: true })
  accountName?: string;

  @Column({ nullable: true })
  accountNumber?: string;

  @Column({ nullable: true })
  ifscCode?: string;

  @Column({ nullable: true })
  upiId?: string;

  @Column({ nullable: true })
  paypalEmail?: string;

  @Column({ type: 'text', nullable: true })
  qrCodeImageUrl?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
