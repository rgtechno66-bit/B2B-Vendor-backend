import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderEntity } from './order.entity';
import { OrderSequenceEntity } from './order-sequence.entity';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { JwtModule } from '@nestjs/jwt';
import { ItemEntity } from './../fetch-products/item.entity';
import { OrderItemEntity } from './order.item.entity';
import { CartItemEntity } from './../cart/cart.entity';
// import { InvoiceRetryService } from './../invoice/invoice-retry.service';
import { Invoice } from './../invoice/invoice.entity';
import { UserEntity } from './../user/users.entity';
import { AddressEntity } from './../addresses/addresses.entity';
import { EmailService } from './../service/email.service';
import {
  SyncControlSettings,
  TallySettings,
} from './../settings/setting.entity';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncLogEntity } from './../sync-log/sync-log.entity';
import { UserModule } from './../user/users.module';
import { GSTCalculationService } from './gst-calculation.service';

@Module({
  imports: [
    UserModule,
    TypeOrmModule.forFeature([
      OrderEntity,
      OrderSequenceEntity,
      ItemEntity,
      UserEntity,
      AddressEntity,
      OrderItemEntity,
      CartItemEntity,
      Invoice,
      SyncLogEntity,
      SyncControlSettings,
      TallySettings,
    ]),
    ScheduleModule.forRoot(),
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: {},
    }),
  ],
  controllers: [OrderController],
  providers: [OrderService, EmailService, GSTCalculationService],
  exports: [OrderService, GSTCalculationService],
})
export class OrderModule {}
