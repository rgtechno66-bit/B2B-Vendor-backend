import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorService } from './vendor.service'; // Import the VendorService
import { VendorEntity } from './vendor.entity'; // Import the VendorEntity
import { VendorController } from './vendor.controller'; // Import the VendorController

import { SyncLogService } from './../sync-log/sync-log.service';
import { UserEntity } from './../user/users.entity';
import { AddressEntity } from './../addresses/addresses.entity';
import { AddressesService } from './../addresses/addresses.service';
import {
  SyncControlSettings,
  CronSettings,
} from './../settings/setting.entity';
import { SyncLogEntity } from './../sync-log/sync-log.entity';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { SettingModule } from '../settings/setting.module';

@Module({
  imports: [
    SettingModule,
    TypeOrmModule.forFeature([
      VendorEntity,
      UserEntity,
      AddressEntity,
      SyncLogEntity,
      SyncControlSettings,
      CronSettings,
    ]),
    ScheduleModule.forRoot(),
    JwtModule.register({
      secret: process.env.JWT_SECRET, // Use your JWT secret from the .env file
      signOptions: {}, // Set your token expiration
    }),
  ], // Register the VendorEntity
  controllers: [VendorController], // Register the VendorController
  providers: [VendorService, AddressesService, SyncLogService], // Register the VendorService and FirebaseService
})
export class VendorModule {}
