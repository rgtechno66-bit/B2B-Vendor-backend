// stock.entity.ts
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('stock_summary')
export class StockEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @Column()
  itemName!: string;

  @Column()
  group?: string;

  @Column({ nullable: true })
  subGroup1?: string;

  @Column({ nullable: true })
  subGroup2?: string;

  @Column()
  quantity?: string;
}
