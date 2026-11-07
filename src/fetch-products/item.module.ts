// Item.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ItemService } from './item.service';
import { ItemEntity } from './item.entity';
import { ItemController } from './itemController';
import { FileStorageService } from '../service/file-storage.service';
import { SyncControlSettings } from './../settings/setting.entity';
import { SyncLogEntity } from './../sync-log/sync-log.entity';
import { SyncLogService } from './../sync-log/sync-log.service';
import { StockEntity } from './../stock/stock.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ItemEntity,
      SyncLogEntity,
      SyncControlSettings,
      StockEntity,
    ]),
  ],
  controllers: [ItemController],
  providers: [ItemService, FileStorageService, SyncLogService],
  exports: [ItemService], // Exporting ItemService
})
export class ItemModule {}
