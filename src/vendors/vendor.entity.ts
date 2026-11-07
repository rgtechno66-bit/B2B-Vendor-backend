import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('Vendors')
export class VendorEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string; // UUID format

  @Column({ type: 'varchar' })
  slNo!: string; // Vendor no

  @Column({ type: 'varchar' })
  name!: string; // Vendor name

  @Column({ type: 'varchar', nullable: true })
  alias?: string; // Optional alias for the vendor

  @Column({ type: 'varchar' })
  active?: string; // Vendor status (active or inactive)

  @Column({ type: 'varchar', nullable: true })
  parent?: string; // Optional parent vendor reference

  @Column({ type: 'varchar' })
  address!: string; // Vendor address

  @Column({ type: 'varchar' })
  country!: string; // Vendor country

  @Column({ type: 'varchar' })
  state!: string; // Vendor state

  @Column({ type: 'varchar' })
  pincode!: string; // Vendor pincode

  @Column({ type: 'varchar' })
  contactPerson!: string; // Name of the contact person

  @Column({ type: 'varchar' })
  phone!: string; // Vendor phone number

  @Column({ type: 'varchar' }) // Ensure email is unique
  email!: string; // Vendor email address

  @Column({ type: 'varchar' })
  pan?: string; // Optional PAN number

  @Column({ type: 'varchar' })
  gstType!: string; // GST type (e.g., Regular, Composition)

  @Column({ type: 'varchar' })
  gstNo!: string; // GST number

  @Column({ type: 'varchar', nullable: true })
  gstDetails?: string; // Optional additional GST details

  @Column({ type: 'boolean', default: true })
  isAllowPlaceOrder!: boolean; // Boolean to allow/disallow placing orders
}
