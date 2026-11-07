import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtModule } from '@nestjs/jwt';
import {
  SalesInvoiceEntity,
  SalesInvoiceItemEntity,
  SalesInvoiceItemDescriptionEntity,
  SalesInvoicePaymentTermEntity,
  SalesInvoiceOrderEntity,
  SalesInvoiceLedgerEntity,
} from './sales-invoice.entity';
import { SalesInvoiceService } from './sales-invoice.service';
import { SalesInvoiceController } from './sales-invoice.controller';
import { OrderEntity } from '../order/order.entity';
import { UserEntity } from '../user/users.entity';
import { SettingModule } from '../settings/setting.module';
import { FileStorageService } from '../service/file-storage.service';

@Module({
  imports: [
    SettingModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      SalesInvoiceEntity,
      SalesInvoiceItemEntity,
      SalesInvoiceItemDescriptionEntity,
      SalesInvoicePaymentTermEntity,
      SalesInvoiceOrderEntity,
      SalesInvoiceLedgerEntity,
      OrderEntity,
      UserEntity,
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: {},
    }),
  ],
  controllers: [SalesInvoiceController],
  providers: [SalesInvoiceService, FileStorageService],
  exports: [SalesInvoiceService],
})
export class SalesInvoiceModule {}
