import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

import { OrderEntity } from './../order/order.entity';
import { AddressEntity } from './../addresses/addresses.entity';

export enum UserStatus {
  Active = 'Active',
  Inactive = 'Inactive',
}

export enum UserRole {
  Admin = 'Admin',
  Vendor = 'Vendor',
}

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  slNo?: string; // Vendor no

  @Column({ type: 'varchar' })
  name?: string; // Vendor name

  @Column({ type: 'varchar', nullable: true })
  alias?: string; // Optional alias for the vendor

  @Column({ type: 'varchar' })
  active?: string; // Vendor status (active or inactive)

  @Column({ type: 'varchar', nullable: true })
  parent?: string; // Optional parent vendor reference

  @Column({ type: 'varchar' })
  address?: string; // Vendor address

  @Column({ type: 'varchar' })
  country?: string; // Vendor country

  @Column({ type: 'varchar' })
  state?: string; // Vendor state

  @Column({ type: 'varchar' })
  pincode?: string; // Vendor pincode

  @Column({ type: 'varchar' })
  contactPerson?: string; // Name of the contact person

  @Column({ type: 'varchar' })
  mobile!: string; // Vendor phone number

  @Column({ type: 'varchar' }) // Ensure email is unique
  email!: string; // Vendor email address

  @Column({ type: 'varchar' })
  pan?: string; // Optional PAN number

  @Column({ type: 'varchar' })
  gstType?: string; // GST type (e.g., Regular, Composition)

  @Column({ type: 'varchar' })
  gstNo?: string; // GST number

  @Column({ type: 'varchar', nullable: true })
  gstDetails?: string; // Optional additional GST details

  @Column({ type: 'varchar', length: 255, nullable: true })
  profile?: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.Vendor,
  })
  role?: UserRole;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.Active,
  })
  status?: UserStatus;

  @Column({ nullable: true, type: 'varchar' })
  otp?: string | null;

  @Column({ nullable: true, type: 'timestamp' })
  otpExpires?: Date | null;

  @Column({ default: false })
  isDeleted!: boolean;

  @Column({ default: true })
  isAllowPlaceOrder!: boolean; // Boolean to allow/disallow placing orders

  @OneToMany(() => AddressEntity, (address) => address.user)
  addresses?: AddressEntity[];

  @OneToMany(() => OrderEntity, (order) => order.user)
  orders?: OrderEntity[];

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;

  @Column({ nullable: true, type: 'varchar' })
  sessionToken?: string | null; // Token for session management

  // @OneToMany(() => OrderEntity, (order) => order.user, { onDelete: 'CASCADE' })
  // orders?: OrderEntity[];
}
