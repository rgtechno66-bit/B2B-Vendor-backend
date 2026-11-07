import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SyncLogController } from './sync-log.controller';
import { SyncLogService } from './sync-log.service';
import { SyncLogEntity } from './sync-log.entity';
import { JwtModule } from '@nestjs/jwt';
import { UserEntity } from './../user/users.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, SyncLogEntity]),
    JwtModule.register({
      secret: process.env.JWT_SECRET, // Use your JWT secret from the .env file
      signOptions: {}, // Set your token expiration
    }),
  ],
  controllers: [SyncLogController],
  providers: [SyncLogService],
  exports: [SyncLogService], // Export InvoiceService if needed in other modules
})
export class SyncLogModule {}
