import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { OrderEntity } from './../order/order.entity';
import { UserEntity } from './../user/users.entity';

export enum AddressType {
  Primary = 'Primary',
  Secondary = 'Secondary',
  Default = 'Default',
}

@Entity('addresses')
export class AddressEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  mobile!: string;

  @Column({ type: 'varchar', length: 255 })
  street_address!: string;

  // @Column({ type: 'varchar', length: 255 })
  // city!: string;

  @Column({ type: 'varchar', length: 255 })
  state!: string;

  @Column({ type: 'varchar', length: 10 })
  zip_code!: string;

  @Column({
    type: 'enum',
    enum: AddressType,
    default: AddressType.Default,
  })
  addressType?: AddressType;

  @Column({ type: 'varchar', length: 100 })
  country!: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;

  @ManyToOne(() => UserEntity, (user) => user.addresses, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  user!: UserEntity; // Made non-nullable

  @OneToMany(() => OrderEntity, (order) => order.address)
  orders?: OrderEntity[]; // This can remain optional
}
