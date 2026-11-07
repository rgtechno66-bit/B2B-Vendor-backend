// invoice.entity.ts

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

export enum InvoiceStatus {
  PENDING = 'pending',
  FAILED = 'failed',
}

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text')
  orderId!: string;

  @Column('text')
  userId!: string; // Associate the invoice with a user

  @Column('text')
  xmlContent!: string;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.PENDING })
  status!: InvoiceStatus;

  @CreateDateColumn()
  createdAt!: Date;
}
