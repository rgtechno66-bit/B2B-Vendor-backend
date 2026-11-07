import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InvoiceRetryService } from './invoice-retry.service';
import { Invoice } from './invoice.entity';
import { InvoiceController } from './Invoice.controller';
import { JwtModule } from '@nestjs/jwt';

import { UserEntity } from './../user/users.entity';
import { SyncControlSettings } from './../settings/setting.entity';
import { SyncLogEntity } from './../sync-log/sync-log.entity';

@Module({
  imports: [
    ScheduleModule.forRoot(), // Enables scheduling
    TypeOrmModule.forFeature([
      Invoice,
      SyncLogEntity,
      UserEntity,
      SyncControlSettings,
    ]), // Registers Invoice repository
    JwtModule.register({
      secret: process.env.JWT_SECRET, // Use JWT secret from .env file
      signOptions: {}, // Set token expiration
    }),
  ],

  providers: [InvoiceRetryService],
  controllers: [InvoiceController],
  exports: [InvoiceRetryService], // Export InvoiceService if needed in other modules
})
export class InvoiceModule {}
