// src/faq/entities/faq.entity.ts

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum FAQStatus {
  Active = 'Active',
  Inactive = 'Inactive',
}

export enum GalleryType {
  CERTIFICATE = 'certificate',
  GALLERY = 'gallery',
}

export enum BannerType {
  Home = 'Home',
  Contact = 'Contact',
  About = 'About',
  Dealer = 'Dealer',
  Resource = 'Resource',
  FAQs = 'FAQs',
  Terms = 'Terms',
}

@Entity('tally-path')
export class TallyPathEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: number;

  @Column({ nullable: true })
  key?: string;

  @Column({ nullable: true })
  value?: string;
}

@Entity('logos')
export class Logo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ nullable: true })
  name?: string; // Optional name for the logo

  @Column()
  logoImage!: string; // URL of the uploaded logo
}

@Entity('faqs')
export class Faq {
  @PrimaryGeneratedColumn('uuid') // Use UUID for unique ID
  id!: string;

  @Column()
  question!: string;

  @Column()
  answer!: string;

  @Column({ type: 'enum', enum: FAQStatus, default: FAQStatus.Active })
  status!: FAQStatus; // Status field

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}

@Entity('privacy_policies')
export class PrivacyPolicy {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text')
  content!: string; // The content of the privacy policy

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('terms_conditions')
export class TermsConditions {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text')
  content!: string; // The content of the terms and conditions

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('contact_us')
export class ContactUs {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text')
  message!: string; // The message sent by the user

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('about_us')
export class AboutUs {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text', { nullable: true })
  aboutUs?: string; // About Us content

  @Column('text', { nullable: true })
  mission?: string; // Mission content

  @Column('text', { nullable: true })
  vision?: string; // Vision content

  @Column('text', { nullable: true })
  whatSetsUsApart?: string; // What Sets Us Apart content

  @Column('text', { nullable: true })
  whyChooseUs?: string; // Why Choose Us content

  @Column({ type: 'text', nullable: true, default: null })
  imageSmall?: string; // Small image URL

  @Column({ type: 'text', nullable: true, default: null })
  imageLarge?: string; // Large image URL

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('footer_info')
export class FooterInfo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', nullable: true })
  companyName?: string;

  @Column({ type: 'text', nullable: true })
  companyAddress?: string;

  @Column({ type: 'text', nullable: true })
  mobile?: string;

  @Column({ type: 'text', nullable: true })
  email?: string;

  @Column({ type: 'text', nullable: true })
  aboutUs?: string;

  @Column({ type: 'text', nullable: true })
  disclaimer?: string;

  @Column({ type: 'jsonb', nullable: true })
  socialMediaLinks?: { platform: string; url: string; icon: string }[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('banner')
export class Banner {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({
    type: 'enum',
    enum: BannerType,
    default: BannerType.Home, // Set default value
  })
  type!: BannerType;

  @Column('text', { array: true })
  BannerImages!: string[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('sync_control_settings')
export class SyncControlSettings {
  @PrimaryGeneratedColumn('uuid')
  id!: number;

  @Column()
  moduleName!: string; // E.g., 'Products', 'Orders', etc.

  @Column({ default: false })
  isAutoSyncEnabled!: boolean; // Auto Sync status

  @Column({ default: false })
  isManualSyncEnabled!: boolean; // Manual Sync status

  @Column({ nullable: true, type: 'varchar' })
  fromDate!: string | null; // Date in YYYYMMDD format for Ledger/Outstanding sync

  @Column({ nullable: true, type: 'varchar' })
  toDate!: string | null; // Date in YYYYMMDD format for Ledger/Outstanding sync

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}

@Entity('tally_settings')
export class TallySettings {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string; // Name of the ledger (e.g., "Central Tax Ledger")

  @Column({ nullable: true })
  value!: string; // Value of the ledger (default: empty)

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}

export enum CronJobType {
  INVOICE_UPLOAD = 'Invoice Upload',
  VENDOR_SYNC = 'Vendor Sync',
  LEDGER_STATEMENT = 'Ledger Statement',
  OUTSTANDING_RECEIVABLE = 'Outstanding Receivable',
  STOCK_SUMMARY = 'Stock Summary',
}

@Entity('cron_settings')
export class CronSettings {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: CronJobType, unique: true })
  type!: CronJobType; // Type of cron job

  @Column({ default: 0 })
  minutes!: number; // Cron interval in minutes

  @Column({ default: 0 })
  seconds!: number; // Cron interval in seconds

  @Column({ default: 0 })
  hours!: number; // Cron interval in hours

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}

@Entity('invoice_upload_cron_settings')
export class InvoiceUploadCronSettings {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ default: 2 })
  minutes!: number; // Cron interval in minutes

  @Column({ default: 0 })
  seconds!: number; // Cron interval in seconds

  @Column({ default: 0 })
  hours!: number; // Cron interval in hours

  @Column({ default: true })
  isEnabled!: boolean; // Enable/disable cron job

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}

@Entity('gallery')
export class Gallery {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column('text', { array: true })
  GalleryImages!: string[];

  @Column({
    type: 'enum',
    enum: GalleryType,
    default: GalleryType.GALLERY, // Set default value
  })
  type!: GalleryType;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
