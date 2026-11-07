import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  BillEntity,
  LedgerEntity,
  LedgerStatementEntity,
  LedgerVoucherEntity,
} from './ledger.entity';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import {
  SyncControlSettings,
  CronSettings,
} from './../settings/setting.entity';
import { SyncLogEntity } from './../sync-log/sync-log.entity';
import { UserEntity } from './../user/users.entity';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { SettingModule } from '../settings/setting.module';

@Module({
  imports: [
    SettingModule,
    TypeOrmModule.forFeature([
      UserEntity,
      LedgerEntity,
      BillEntity,
      SyncControlSettings,
      SyncLogEntity,
      LedgerStatementEntity,
      LedgerVoucherEntity,
      CronSettings,
    ]),
    ScheduleModule.forRoot(),
    JwtModule.register({
      secret: process.env.JWT_SECRET, // Use JWT secret from .env file
      signOptions: {}, // Set token expiration
    }),
  ],
  controllers: [LedgerController],
  providers: [LedgerService],
})
export class LedgerModule {}
