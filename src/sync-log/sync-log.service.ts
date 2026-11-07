import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { SyncLogEntity, SyncLogStatus } from './sync-log.entity';
import { CreateSyncLogDto } from './create-sync-log.dto';

@Injectable()
export class SyncLogService {
  constructor(
    @InjectRepository(SyncLogEntity)
    private readonly syncLogRepository: Repository<SyncLogEntity>,
  ) {}

  // Create a new sync log
  async createSyncLog(
    createSyncLogDto: CreateSyncLogDto,
  ): Promise<SyncLogEntity> {
    // Explicitly cast the DTO to DeepPartial<SyncLogEntity>
    const syncLog = this.syncLogRepository.create(
      createSyncLogDto as DeepPartial<SyncLogEntity>,
    );
    return this.syncLogRepository.save(syncLog);
  }

  // Get all sync logs with pagination, search, and filtering
  async getAllSyncLogs(
    page?: number,
    limit?: number,
    search?: string,
    status?: string,
  ): Promise<
    | SyncLogEntity[]
    | {
        data: SyncLogEntity[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }
  > {
    // If no pagination params, return all logs (backward compatible)
    if (!page && !limit) {
      const queryBuilder = this.syncLogRepository.createQueryBuilder('log');

      // Apply search filter
      if (search && search.trim() !== '') {
        queryBuilder.where('LOWER(log.sync_type) LIKE LOWER(:search)', {
          search: `%${search}%`,
        });
      }

      // Apply status filter
      if (status && status !== 'all') {
        // If status is a sync_type (stocks, items, orders, vendors, ledger, receivable)
        const syncTypes = [
          'stocks',
          'items',
          'orders',
          'vendors',
          'ledger',
          'receivable',
        ];
        if (syncTypes.includes(status)) {
          queryBuilder.andWhere('log.sync_type = :syncType', {
            syncType: status,
          });
        } else if (status === 'success' || status === 'fail') {
          queryBuilder.andWhere('log.status = :status', { status });
        }
      }

      return queryBuilder.orderBy('log.created_at', 'DESC').getMany();
    }

    // Pagination logic
    const pageNumber = page || 1;
    const limitNumber = limit || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const queryBuilder = this.syncLogRepository.createQueryBuilder('log');

    // Apply search filter
    if (search && search.trim() !== '') {
      queryBuilder.where('LOWER(log.sync_type) LIKE LOWER(:search)', {
        search: `%${search}%`,
      });
    }

    // Apply status filter
    if (status && status !== 'all') {
      // If status is a sync_type (stocks, items, orders, vendors, ledger, receivable)
      const syncTypes = [
        'stocks',
        'items',
        'orders',
        'vendors',
        'ledger',
        'receivable',
      ];
      if (syncTypes.includes(status)) {
        queryBuilder.andWhere('log.sync_type = :syncType', {
          syncType: status,
        });
      } else if (status === 'success' || status === 'fail') {
        queryBuilder.andWhere('log.status = :status', { status });
      }
    }

    const total = await queryBuilder.getCount();
    const data = await queryBuilder
      .skip(skip)
      .take(limitNumber)
      .orderBy('log.created_at', 'DESC')
      .getMany();

    return {
      data,
      total,
      page: pageNumber,
      limit: limitNumber,
      totalPages: Math.ceil(total / limitNumber),
    };
  }

  // Get status counts for tabs
  async getStatusCounts(): Promise<{
    all: number;
    stocks: number;
    items: number;
    orders: number;
    vendors: number;
    ledger: number;
    receivable: number;
    success: number;
    fail: number;
  }> {
    const all = await this.syncLogRepository.count();

    const stocks = await this.syncLogRepository.count({
      where: { sync_type: 'stocks' },
    });

    const items = await this.syncLogRepository.count({
      where: { sync_type: 'items' },
    });

    const orders = await this.syncLogRepository.count({
      where: { sync_type: 'orders' },
    });

    const vendors = await this.syncLogRepository.count({
      where: { sync_type: 'vendors' },
    });

    const ledger = await this.syncLogRepository.count({
      where: { sync_type: 'ledger' },
    });

    const receivable = await this.syncLogRepository.count({
      where: { sync_type: 'receivable' },
    });

    const success = await this.syncLogRepository.count({
      where: { status: SyncLogStatus.SUCCESS },
    });

    const fail = await this.syncLogRepository.count({
      where: { status: SyncLogStatus.FAIL },
    });

    return {
      all,
      stocks,
      items,
      orders,
      vendors,
      ledger,
      receivable,
      success,
      fail,
    };
  }

  // async fetchAndStoreData<T extends ObjectLiteral>(
  //   url: string,
  //   dataPayload: any,
  //   parseXml: (data: any) => Promise<T[]>,
  //   repository: Repository<T>,
  //   entityName: string,
  //   syncType: string,
  //   logRepository: Repository<SyncLogEntity>
  // ): Promise<void> {
  //   const REQUEST_TIMEOUT = 20000; // 20 seconds timeout

  //   let successCount = 0;
  //   let failedCount = 0;

  //   try {
  //     const response = await axios.get(url, {
  //       headers: {
  //         'Content-Type': 'text/xml',
  //       },
  //       data: dataPayload,
  //       timeout: REQUEST_TIMEOUT,
  //     });

  //     const entities = await parseXml(response.data);
  //     const existingEntities = await repository.find();

  //     const existingEntityMap = new Map(
  //       existingEntities.map(entity => [entity['uniqueIdentifier'], entity])
  //     );

  //     for (const entity of entities) {
  //       const existingEntity = existingEntityMap.get(entity['uniqueIdentifier']);
  //       try {
  //         if (existingEntity) {
  //           if (this.hasChanges(existingEntity, entity)) {
  //             await repository.save({ ...existingEntity, ...entity });
  //             successCount++;
  //           } else {
  //             console.log(`No changes for ${entityName}: ${entity['name']}`);
  //           }
  //         } else {
  //           await repository.save(entity);
  //           successCount++;
  //         }
  //       } catch (error) {
  //         failedCount++;
  //         console.error(`Error saving ${entityName}:`, error);
  //       }
  //     }

  //     await logRepository.save({
  //       sync_type: syncType,
  //       success_count: successCount,
  //       failed_count: failedCount,
  //       total_count: entities.length,
  //       status: SyncLogStatus.SUCCESS,
  //     });
  //   } catch (error: any) {
  //     failedCount = 1;

  //     await logRepository.save({
  //       sync_type: syncType,
  //       success_count: successCount,
  //       failed_count: failedCount,
  //       total_count: 0,
  //       status: SyncLogStatus.FAIL,
  //     });

  //     if (error.code === 'ECONNABORTED') {
  //       throw new InternalServerErrorException('Request timeout: Please check Tally connection.');
  //     }
  //     throw new InternalServerErrorException('Error fetching data from Tally.');
  //   }
  // }

  // private hasChanges<T extends ObjectLiteral>(existingEntity: T, updatedEntity: T): boolean {
  //   return JSON.stringify(existingEntity) !== JSON.stringify(updatedEntity);
  // }
}
