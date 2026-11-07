import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('sales_invoices')
export class SalesInvoiceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', nullable: true })
  voucherNo?: string;

  @Column({ type: 'varchar', nullable: true })
  voucherDate?: string;

  @Column({ type: 'varchar', nullable: true })
  voucherType?: string;

  @Column({ type: 'varchar', nullable: true })
  referenceNo?: string;

  @Column({ type: 'varchar', nullable: true })
  guid?: string;

  @Column({ type: 'varchar', nullable: true })
  masterId?: string;

  @Column({ type: 'varchar', nullable: true })
  partyName?: string;

  @Column({ type: 'float', nullable: true })
  closingBalance?: number;

  @Column({ type: 'varchar', nullable: true })
  nxPartyCode?: string | null;

  @Column({ type: 'float', nullable: true })
  amount?: number;

  @Column({ type: 'varchar', nullable: true })
  customerName?: string | null;

  @Column({ type: 'varchar', nullable: true })
  partyGstin?: string;

  @Column({ type: 'varchar', nullable: true })
  emailId?: string;

  @Column({ type: 'varchar', nullable: true })
  mobileNumber?: string;

  @Column({ type: 'text', nullable: true })
  buyerAddress?: string;

  @Column({ type: 'varchar', nullable: true })
  eMail?: string;

  @Column({ type: 'text', nullable: true })
  consigneeAddress?: string;

  @Column({ type: 'varchar', nullable: true })
  state?: string;

  @Column({ type: 'varchar', nullable: true })
  placeOfSupply?: string;

  @OneToMany(() => SalesInvoiceItemEntity, (item) => item.salesInvoice, {
    cascade: true,
    eager: true,
  })
  items!: SalesInvoiceItemEntity[];

  @OneToMany(() => SalesInvoicePaymentTermEntity, (term) => term.salesInvoice, {
    cascade: true,
    eager: true,
  })
  paymentTerms!: SalesInvoicePaymentTermEntity[];

  @OneToMany(() => SalesInvoiceOrderEntity, (order) => order.salesInvoice, {
    cascade: true,
    eager: true,
  })
  orders!: SalesInvoiceOrderEntity[];

  @OneToMany(() => SalesInvoiceLedgerEntity, (ledger) => ledger.salesInvoice, {
    cascade: true,
    eager: true,
  })
  ledgers!: SalesInvoiceLedgerEntity[];

  @Column({ type: 'varchar', nullable: true })
  invoicePdf?: string | null;

  /** Vendor (user) who owns this invoice; set from Order where orderNo = voucherNo */
  @Column({ type: 'uuid', nullable: true })
  vendorId?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('sales_invoice_items')
export class SalesInvoiceItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', nullable: true })
  orderNo?: string;

  @Column({ type: 'varchar', nullable: true })
  orderDue?: string;

  @Column({ type: 'varchar', nullable: true })
  itemName?: string;

  @Column({ type: 'varchar', nullable: true })
  nxItemCode?: string | null;

  @Column({ type: 'varchar', nullable: true })
  partNo?: string | null;

  @Column({ type: 'varchar', nullable: true })
  baseUnits?: string;

  @Column({ type: 'float', nullable: true })
  actualQty?: number;

  @Column({ type: 'float', nullable: true })
  billedQty?: number;

  @Column({ type: 'float', nullable: true })
  inclRate?: number;

  @Column({ type: 'float', nullable: true })
  rate?: number;

  @Column({ type: 'float', nullable: true })
  discPerc?: number;

  @Column({ type: 'float', nullable: true })
  discAmt?: number;

  @Column({ type: 'float', nullable: true })
  discProp?: number;

  @Column({ type: 'float', nullable: true })
  amount?: number;

  @Column({ type: 'varchar', nullable: true })
  accountingName?: string;

  @Column({ type: 'float', nullable: true })
  gstPer?: number;

  @Column({ type: 'float', nullable: true })
  totalSalesAmt?: number;

  @OneToMany(() => SalesInvoiceItemDescriptionEntity, (desc) => desc.item, {
    cascade: true,
    eager: true,
  })
  descriptions!: SalesInvoiceItemDescriptionEntity[];

  @Column({ type: 'uuid' })
  salesInvoiceId!: string;

  @ManyToOne(() => SalesInvoiceEntity, (invoice) => invoice.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'salesInvoiceId' })
  salesInvoice!: SalesInvoiceEntity;
}

@Entity('sales_invoice_item_descriptions')
export class SalesInvoiceItemDescriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', nullable: true })
  desc?: string;

  @Column({ type: 'uuid' })
  itemId!: string;

  @ManyToOne(() => SalesInvoiceItemEntity, (item) => item.descriptions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'itemId' })
  item!: SalesInvoiceItemEntity;
}

@Entity('sales_invoice_payment_terms')
export class SalesInvoicePaymentTermEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', nullable: true })
  terms?: string;

  @Column({ type: 'uuid' })
  salesInvoiceId!: string;

  @ManyToOne(() => SalesInvoiceEntity, (invoice) => invoice.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'salesInvoiceId' })
  salesInvoice!: SalesInvoiceEntity;
}

@Entity('sales_invoice_orders')
export class SalesInvoiceOrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', nullable: true })
  orderId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  nxOrderId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  tlOrderId?: string | null;

  @Column({ type: 'uuid' })
  salesInvoiceId!: string;

  @ManyToOne(() => SalesInvoiceEntity, (invoice) => invoice.orders, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'salesInvoiceId' })
  salesInvoice!: SalesInvoiceEntity;
}

@Entity('sales_invoice_ledgers')
export class SalesInvoiceLedgerEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', nullable: true })
  ledgerName?: string;

  @Column({ type: 'float', nullable: true })
  ratePerc?: number;

  @Column({ type: 'float', nullable: true })
  amount?: number;

  @Column({ type: 'uuid' })
  salesInvoiceId!: string;

  @ManyToOne(() => SalesInvoiceEntity, (invoice) => invoice.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'salesInvoiceId' })
  salesInvoice!: SalesInvoiceEntity;
}
