// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import * as dotenv from 'dotenv';
import { UserEntity } from './../user/users.entity';

import { EmailService } from './../service/email.service';
import { AddressEntity } from './../addresses/addresses.entity';
import { AddressesService } from './../addresses/addresses.service';
import { AddressesModule } from './../addresses/addresses.module';
import { SMSService } from './../service/sms.service';
dotenv.config(); // Load environment variables
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, AddressEntity, AddressesModule]),
    JwtModule.register({
      secret: process.env.JWT_SECRET, // Use your JWT secret from the .env file
      signOptions: {}, // Set your token expiration
    }),
  ],
  providers: [AuthService, AddressesService, EmailService, SMSService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
