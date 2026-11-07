import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankAccountService } from './payment.service';
import { BankAccountController } from './payment.controller';
import { BankAccountEntity } from './payment.entity';
import { FileStorageService } from '../service/file-storage.service';
import { JwtModule } from '@nestjs/jwt';
import { UserEntity } from './../user/users.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, BankAccountEntity]),
    JwtModule.register({
      secret: process.env.JWT_SECRET, // Use your JWT secret from the .env file
      signOptions: {}, // Set your token expiration
    }),
  ],
  controllers: [BankAccountController],
  providers: [BankAccountService, FileStorageService],
})
export class BankAccountModule {}
