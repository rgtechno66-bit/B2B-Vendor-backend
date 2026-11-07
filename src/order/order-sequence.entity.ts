import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Stores the last assigned order number so that even after deleting orders,
 * the next order gets the next number (e.g. 001, 002 deleted -> next is 003).
 */
@Entity('order_sequence')
export class OrderSequenceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  key!: string; // e.g. 'order_no'

  @Column('int', { default: 0 })
  lastNumber!: number; // last assigned number (e.g. 3 means Online-0003 was last)
}
