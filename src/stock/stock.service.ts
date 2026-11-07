// stock.service.ts
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { StockEntity } from './stock.entity';
import { StockDto } from './stock.dto';
import { summary } from '../tally/summary';
import { OnModuleInit } from '@nestjs/common';

import { SyncControlSettings, CronJobType } from './../settings/setting.entity';
import { SyncLogEntity, SyncLogStatus } from './../sync-log/sync-log.entity';
import { TALLY_URL, TALLY_ERROR_MESSAGES } from '../tally/tallyError';
import { CronSchedulerService } from '../service/cron-scheduler.service';

interface SyncStatus {
  status: 'idle' | 'processing' | 'completed' | 'error';
  message: string;
  progress?: number;
  startTime?: Date;
  endTime?: Date;
  error?: string;
  totalRecords?: number;
  processedRecords?: number;
  batchesTotal?: number;
  currentBatch?: number;
  insertsCount?: number;
  duration?: number;
}

@Injectable()
export class StockService implements OnModuleInit {
  private readonly logger = new Logger(StockService.name);
  private readonly CRON_JOB_NAME = 'stockSyncCron';
  private stockSyncStatus: SyncStatus = {
    status: 'idle',
    message: 'Ready to sync',
  };

  constructor(
    @InjectRepository(StockEntity)
    private stockRepository: Repository<StockEntity>,

    @InjectRepository(SyncLogEntity)
    private readonly syncLogRepository: Repository<SyncLogEntity>,

    @InjectRepository(SyncControlSettings)
    private readonly syncControlSettingsRepository: Repository<SyncControlSettings>,

    private readonly cronSchedulerService: CronSchedulerService,
  ) {}

  async onModuleInit() {
    await this.scheduleCronJob();
  }

  // Schedule or reschedule the cron job
  async scheduleCronJob(): Promise<void> {
    await this.cronSchedulerService.scheduleCronJob(
      this.CRON_JOB_NAME,
      CronJobType.STOCK_SUMMARY,
      () => this.cronFetchAndStoreItems(),
      { minutes: 0, seconds: 0, hours: 1 },
      'Stock Summary',
    );
  }

  // Simple findAll with only search and pagination (no filters)
  async findAll(
    page?: number,
    limit?: number,
    search?: string,
  ): Promise<
    | StockEntity[]
    | {
        data: StockEntity[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }
  > {
    // If no pagination params, return all stocks (backward compatible)
    if (!page && !limit) {
      if (search && search.trim() !== '') {
        return this.stockRepository
          .createQueryBuilder('stock')
          .where(
            '(LOWER(stock.itemName) LIKE LOWER(:search) OR LOWER(stock.group) LIKE LOWER(:search) OR LOWER(stock.subGroup1) LIKE LOWER(:search) OR LOWER(stock.subGroup2) LIKE LOWER(:search))',
            { search: `%${search}%` },
          )
          .orderBy('stock.itemName', 'ASC')
          .getMany();
      }
      return this.stockRepository.find();
    }

    // Pagination logic
    const pageNumber = page || 1;
    const limitNumber = limit || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const queryBuilder = this.stockRepository.createQueryBuilder('stock');

    // Apply search filter
    if (search && search.trim() !== '') {
      queryBuilder.where(
        '(LOWER(stock.itemName) LIKE LOWER(:search) OR LOWER(stock.group) LIKE LOWER(:search) OR LOWER(stock.subGroup1) LIKE LOWER(:search) OR LOWER(stock.subGroup2) LIKE LOWER(:search))',
        { search: `%${search}%` },
      );
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Get paginated data
    const data = await queryBuilder
      .skip(skip)
      .take(limitNumber)
      .orderBy('stock.itemName', 'ASC')
      .getMany();

    const totalPages = Math.ceil(total / limitNumber);

    return {
      data,
      total,
      page: pageNumber,
      limit: limitNumber,
      totalPages,
    };
  }

  async deleteSelected(ids: string[]): Promise<void> {
    try {
      // Delete stocks by the given IDs
      const deleteResult = await this.stockRepository.delete(ids);

      if (deleteResult.affected === 0) {
        throw new InternalServerErrorException('No stocks found to delete');
      }
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to delete selected stocks',
      );
    }
  }

  async findById(id: string): Promise<StockEntity | null> {
    return this.stockRepository.findOne({ where: { id } }); // Load files for the vendor by ID
  }

  async deleteMultiple(ids: string[]): Promise<{ message: string }> {
    const notFoundIds: string[] = [];

    for (const id of ids) {
      const item = await this.findById(id);
      if (!item) {
        notFoundIds.push(id);
        continue; // skip this ID if not found
      }
      await this.stockRepository.remove(item);
    }

    if (notFoundIds.length > 0) {
      throw new NotFoundException(
        `stocks with ids ${notFoundIds.join(', ')} not found`,
      );
    }

    return { message: 'Stocks deleted successfully' };
  }

  getStockSyncStatus(): SyncStatus {
    return this.stockSyncStatus;
  }

  private logStockSummaryXmlPayload(syncMode: 'manual' | 'cron'): void {
    // Keep this as console output so payload is directly visible in runtime logs.
    console.log(`[TALLY STOCK XML PAYLOAD - ${syncMode.toUpperCase()}]`);
    console.log(summary);
  }

  async fetchAndStoreStockSummary(): Promise<void> {
    const REQUEST_TIMEOUT = 120000; // 2 min - allow full response

    // Check if "ManualSync " is enabled
    const SyncSetting = await this.syncControlSettingsRepository.findOne({
      where: { moduleName: 'Stocks' },
    });

    if (!SyncSetting || !SyncSetting.isManualSyncEnabled) {
      throw new BadRequestException('Manual Sync for Stocks is disabled.');
    }

    // Update status to processing
    this.stockSyncStatus = {
      status: 'processing',
      message: 'Starting stock sync...',
      startTime: new Date(),
    };

    try {
      // Try to connect to Tally with timeout
      let response;
      try {
        this.logStockSummaryXmlPayload('manual');
        // Use POST so Tally returns full response in one go
        response = await axios.post(TALLY_URL, summary, {
          headers: {
            'Content-Type': 'text/xml',
          },
          timeout: REQUEST_TIMEOUT,
          responseType: 'text',
          maxContentLength: 50 * 1024 * 1024,
          maxBodyLength: 50 * 1024 * 1024,
        });
      } catch (axiosError: any) {
        // If Tally is not available, immediately stop sync and set error status
        const errorMessage =
          axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT'
            ? TALLY_ERROR_MESSAGES.REQUEST_TIMEOUT
            : axiosError.code === 'ECONNREFUSED' ||
                axiosError.code === 'ENOTFOUND'
              ? TALLY_ERROR_MESSAGES.CONNECTION_FAILED
              : TALLY_ERROR_MESSAGES.NO_RESPONSE;

        this.stockSyncStatus = {
          status: 'error',
          message: 'Sync stopped: Tally is not available',
          error: errorMessage,
          startTime: this.stockSyncStatus.startTime,
          endTime: new Date(),
        };

        this.logger.error(
          'Stock sync stopped - Tally connection failed:',
          errorMessage,
        );
        // Return immediately - don't continue processing
        return;
      }

      if (response.data.includes('<LINEERROR>')) {
        this.stockSyncStatus = {
          status: 'error',
          message: 'Sync stopped: Tally login required',
          error: TALLY_ERROR_MESSAGES.LOGIN_REQUIRED,
          startTime: this.stockSyncStatus.startTime,
          endTime: new Date(),
        };
        this.logger.error('Stock sync stopped - Tally login required');
        // Return immediately - don't continue processing
        return;
      }

      this.stockSyncStatus.message = 'Fetching data from Tally...';

      const stockSummaries = await this.parseXmlToStockSummaries(response.data);

      // Filter to only include items from the Inteco group
      const intecoStockSummaries = stockSummaries.filter(
        (stock) => stock.group?.toLowerCase().trim() === 'inteco items',
      );

      const totalRecords = intecoStockSummaries.length;
      this.stockSyncStatus.message = `Processing ${totalRecords} stock records...`;
      this.stockSyncStatus.totalRecords = totalRecords;
      this.stockSyncStatus.processedRecords = 0;
      this.stockSyncStatus.insertsCount = 0;

      // Step 1: Delete ALL existing stocks (silently, no status message)
      const existingStocks = await this.stockRepository.find();

      if (existingStocks.length > 0) {
        await this.stockRepository.remove(existingStocks);
      }

      // Step 2: Insert all data from Tally (fresh insert)
      if (intecoStockSummaries.length > 0) {
        this.stockSyncStatus.message = `Syncing ${intecoStockSummaries.length} stocks from Tally...`;
        // Batch insert all stocks
        const batchSize = 500;
        const batches = [];

        for (let i = 0; i < intecoStockSummaries.length; i += batchSize) {
          batches.push(intecoStockSummaries.slice(i, i + batchSize));
        }

        this.stockSyncStatus.batchesTotal = batches.length;

        // Insert in batches
        for (let i = 0; i < batches.length; i++) {
          this.stockSyncStatus.currentBatch = i + 1;
          this.stockSyncStatus.message = `Syncing batch ${i + 1}/${batches.length}...`;
          await this.stockRepository.save(batches[i]);
          this.stockSyncStatus.processedRecords = Math.min(
            (i + 1) * batchSize,
            totalRecords,
          );
        }

        this.stockSyncStatus.insertsCount = intecoStockSummaries.length;
      }

      this.stockSyncStatus.processedRecords = totalRecords;

      const endTime = new Date();
      const duration = this.stockSyncStatus.startTime
        ? endTime.getTime() - this.stockSyncStatus.startTime.getTime()
        : 0;

      // Update status to completed
      this.stockSyncStatus = {
        status: 'completed',
        message: 'Stock sync completed successfully',
        progress: 100,
        startTime: this.stockSyncStatus.startTime,
        endTime: endTime,
        totalRecords: totalRecords,
        processedRecords: totalRecords,
        batchesTotal: 1,
        currentBatch: 1,
        insertsCount: this.stockSyncStatus.insertsCount || 0,
        duration: duration,
      };
    } catch (error: any) {
      // If status is already set to error (from Tally connection failure), don't override it
      if (this.stockSyncStatus.status !== 'error') {
        // Update status to error
        this.stockSyncStatus = {
          status: 'error',
          message: 'Stock sync failed',
          error: error?.message || 'Unknown error occurred',
          startTime: this.stockSyncStatus.startTime,
          endTime: new Date(),
        };
      }

      this.logger.error(
        'Stock sync failed:',
        error?.message || 'Unknown error',
      );
      // If the error is already a BadRequestException, rethrow it
      if (error instanceof BadRequestException) {
        throw error;
      }
      // Return immediately - don't continue processing
      return;
    }
  }

  async parseXmlToStockSummaries(xml: string): Promise<StockEntity[]> {
    // Wrap the XML with a root element
    const wrappedXml = `<STOCKSUMMARIES>${xml}</STOCKSUMMARIES>`;

    const parsedResult = await parseStringPromise(wrappedXml);

    // Access STOCKSUMMARIES.STOCKSUMMARY as an array
    const stockSummaryItems = parsedResult.STOCKSUMMARIES?.STOCKSUMMARY || [];

    return stockSummaryItems.map((item: any) => {
      const stockDto = new StockDto();

      stockDto.itemName = this.cleanString(item.ITEMNAME?.[0] || '');
      stockDto.group = this.cleanString(item.GROUP?.[0] || '');
      stockDto.subGroup1 = this.cleanString(item.SUBGROUP1?.[0] || '');
      stockDto.subGroup2 = this.cleanString(item.SUBGROUP2?.[0] || '');

      stockDto.quantity = parseFloat(item.CLOSINGSTOCK?.[0] || '0').toString();

      return this.stockRepository.create(stockDto);
    });
  }

  private cleanString(value: string | undefined): string {
    return value?.replace(/\x04/g, '').trim() || '';
  }

  async cronFetchAndStoreItems(): Promise<void> {
    const REQUEST_TIMEOUT = 120000; // 2 min - allow full response

    // Check if "Auto Sync" is enabled
    const syncSetting = await this.syncControlSettingsRepository.findOne({
      where: { moduleName: 'Stocks' },
    });

    if (!syncSetting?.isAutoSyncEnabled) {
      this.logger.warn('Auto Sync for Stocks is disabled. Skipping cron job.');
      return; // Don't throw, just skip silently for cron jobs
    }

    try {
      // Try to connect to Tally with timeout
      let response;
      try {
        this.logStockSummaryXmlPayload('cron');
        // Use POST so Tally returns full response in one go
        response = await axios.post(TALLY_URL, summary, {
          headers: { 'Content-Type': 'text/xml' },
          timeout: REQUEST_TIMEOUT,
          responseType: 'text',
          maxContentLength: 50 * 1024 * 1024,
          maxBodyLength: 50 * 1024 * 1024,
        });
      } catch (axiosError: any) {
        // If Tally is not available, log and return (don't throw for cron jobs)
        this.logger.error(
          'Stock cron sync failed - Tally connection error:',
          axiosError?.code || axiosError?.message,
        );
        return; // Silently fail for cron jobs
      }

      // Check for specific XML error patterns in the response
      if (response.data.includes('<LINEERROR>')) {
        this.logger.error('Stock cron sync failed - Tally login required');
        return; // Silently fail for cron jobs
      }

      const stockSummaries = await this.parseXmlToStockSummaries(response.data);

      // Filter to only include items from the Inteco group
      const intecoStockSummaries = stockSummaries.filter(
        (stock) => stock.group?.toLowerCase().trim() === 'inteco items',
      );

      // Step 1: Delete ALL existing stocks
      const existingStocks = await this.stockRepository.find();

      if (existingStocks.length > 0) {
        await this.stockRepository.remove(existingStocks);
      }

      // Step 2: Insert all data from Tally (fresh insert)
      if (intecoStockSummaries.length > 0) {
        // Batch insert all stocks
        const batchSize = 500;
        const batches = [];

        for (let i = 0; i < intecoStockSummaries.length; i += batchSize) {
          batches.push(intecoStockSummaries.slice(i, i + batchSize));
        }

        // Insert in batches
        for (const batch of batches) {
          await this.stockRepository.save(batch);
        }
      }

      this.logger.log('Stock cron sync completed successfully');
    } catch (error: any) {
      // Log error but don't throw for cron jobs (to prevent cron job failure)
      this.logger.error(
        'Stock cron sync failed:',
        error?.message || 'Unknown error',
      );
    }
  }
}
