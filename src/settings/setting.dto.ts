// src/faq/dto/create-faq.dto.ts

import {
  IsNotEmpty,
  IsString,
  IsIn,
  IsEnum,
  IsOptional,
  IsEmail,
  IsBoolean,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import {
  BannerType,
  FAQStatus,
  GalleryType,
  CronJobType,
} from './setting.entity';

export class CreateSettingDto {
  key?: string;
  value?: string;
}

export class UpdateSettingDto {
  value?: string;
}

export class CreateOrUpdateLogoDto {
  @IsOptional()
  @IsString()
  name?: string; // Optional name for the logo
}

export class CreateFaqDto {
  @IsNotEmpty()
  @IsString()
  question!: string;

  @IsNotEmpty()
  @IsString()
  answer!: string;

  @IsEnum(FAQStatus)
  @IsOptional()
  status?: FAQStatus; // Status field
}

export class UpdateFaqDto extends PartialType(CreateFaqDto) {}

export class CreateLogoDto {
  @IsNotEmpty()
  @IsString()
  logoImage!: string; // URL/path to the logo image
}

export class UpdateLogoDto extends PartialType(CreateLogoDto) {}

export class CreatePrivacyPolicyDto {
  @IsNotEmpty()
  @IsString()
  content!: string; // Content of the privacy policy
}

export class CreateTermsConditionsDto {
  @IsString()
  readonly id?: string; // Optional for creation, required for updates

  @IsNotEmpty()
  @IsString()
  readonly content?: string;
}

export class CreateContactDto {
  @IsString()
  readonly id?: string; // Optional for creation, required for updates

  @IsNotEmpty()
  @IsString()
  readonly message?: string;
}

export class CreateAboutUsDto {
  @IsString()
  readonly id?: string;

  @IsOptional()
  @IsString()
  readonly aboutUs?: string;

  @IsOptional()
  @IsString()
  readonly mission?: string;

  @IsOptional()
  @IsString()
  readonly vision?: string;

  @IsOptional()
  @IsString()
  readonly whatSetsUsApart?: string;

  @IsOptional()
  @IsString()
  readonly whyChooseUs?: string;

  @IsOptional()
  @IsString()
  readonly imageSmall?: string;

  @IsOptional()
  @IsString()
  readonly imageLarge?: string;
}

export class CreateFooterInfoDto {
  @IsOptional()
  @IsString()
  readonly companyName?: string;

  @IsOptional()
  @IsString()
  readonly companyAddress?: string;

  @IsOptional()
  @IsString()
  readonly mobile?: string;

  @IsOptional()
  @IsString()
  readonly email?: string;

  @IsOptional()
  @IsString()
  readonly aboutUs?: string;

  @IsOptional()
  @IsString()
  readonly disclaimer?: string;

  @IsOptional()
  readonly socialMediaLinks?: { platform: string; url: string; icon: string }[];
}

export class CreateBannerDto {
  @IsNotEmpty()
  @IsString()
  name!: string; // URL/path to the logo image

  @IsNotEmpty()
  @IsEnum(BannerType)
  type!: BannerType;
}
export class UpdateBannerDto extends PartialType(CreateBannerDto) {}

// DTO: api_control_settings.dto.ts
export class UpdateSyncControlSettingsDto {
  @IsNotEmpty()
  @IsString()
  moduleName!: string; // E.g., 'Products', 'Orders'

  @IsNotEmpty()
  @IsBoolean()
  isAutoSyncEnabled!: boolean; // Auto Sync status

  @IsNotEmpty()
  @IsBoolean()
  isManualSyncEnabled!: boolean; // Manual Sync status

  @IsOptional()
  @IsString()
  fromDate?: string; // Date in YYYYMMDD format for Ledger/Outstanding sync

  @IsOptional()
  @IsString()
  toDate?: string; // Date in YYYYMMDD format for Ledger/Outstanding sync
}

export class UpdateTallySettingsDto {
  @IsNotEmpty()
  @IsString()
  name!: string; // Name of the ledger

  @IsOptional()
  @IsString()
  value?: string; // Value of the ledger
}

export class UpdateCronSettingsDto {
  @IsNotEmpty()
  @IsEnum(CronJobType)
  type!: CronJobType; // Type of cron job

  @IsOptional()
  @IsNumber()
  @Min(0)
  minutes?: number; // Cron interval in minutes

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(59)
  seconds?: number; // Cron interval in seconds

  @IsOptional()
  @IsNumber()
  @Min(0)
  hours?: number; // Cron interval in hours
}

export class CreateGalleryDto {
  @IsNotEmpty()
  @IsString()
  name!: string; // URL/path to the logo image

  @IsNotEmpty()
  @IsEnum(GalleryType)
  type!: GalleryType;
}
export class UpdateGalleryDto extends PartialType(CreateGalleryDto) {}
