import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parseStringPromise } from 'xml2js';
import {
  BillEntity,
  LedgerEntity,
  LedgerStatementEntity,
  LedgerVoucherEntity,
} from './ledger.entity';
import { LedgerDto, LedgerStatementDto, LedgerVoucherDto } from './ledger.dto';
import axios from 'axios';
import { getLedgerXml, getReceivableXml } from '../tally/ledger';
import {
  TALLY_URL,
  TALLY_REQUEST_TIMEOUT,
  TALLY_ERROR_MESSAGES,
  handleTallyError,
} from '../tally/tallyError';
import { SyncControlSettings, CronJobType } from './../settings/setting.entity';
import { OnModuleInit } from '@nestjs/common';
import { CronSchedulerService } from '../service/cron-scheduler.service';

interface SyncStatus {
  status: 'idle' | 'processing' | 'completed' | 'error';
  message: string;
  progress?: number;
  startTime?: Date;
  endTime?: Date;
  error?: string;
  // Detailed information
  totalRecords?: number;
  processedRecords?: number;
  batchesTotal?: number;
  currentBatch?: number;
  updatesCount?: number;
  insertsCount?: number;
  duration?: number; // in milliseconds
}

@Injectable()
export class LedgerService implements OnModuleInit {
  private readonly logger = new Logger(LedgerService.name);
  private readonly RECEIVABLE_CRON_JOB_NAME = 'receivableSyncCron';
  private readonly LEDGER_CRON_JOB_NAME = 'ledgerSyncCron';

  // In-memory status tracking
  private ledgerSyncStatus: SyncStatus = {
    status: 'idle',
    message: 'No sync in progress',
  };
  private receivableSyncStatus: SyncStatus = {
    status: 'idle',
    message: 'No sync in progress',
  };

  constructor(
    @InjectRepository(SyncControlSettings)
    private readonly syncControlSettingsRepository: Repository<SyncControlSettings>,

    @InjectRepository(LedgerEntity)
    private readonly ledgerRepository: Repository<LedgerEntity>,
    @InjectRepository(BillEntity)
    private readonly billRepository: Repository<BillEntity>,

    @InjectRepository(LedgerStatementEntity)
    private readonly ledgerStatementRepo: Repository<LedgerStatementEntity>,

    @InjectRepository(LedgerVoucherEntity)
    private readonly ledgerVoucherRepo: Repository<LedgerVoucherEntity>,

    private readonly cronSchedulerService: CronSchedulerService,
  ) {}

  async onModuleInit() {
    await this.scheduleReceivableCronJob();
    await this.scheduleLedgerCronJob();
  }

  // Schedule or reschedule the receivable cron job
  async scheduleReceivableCronJob(): Promise<void> {
    await this.cronSchedulerService.scheduleCronJob(
      this.RECEIVABLE_CRON_JOB_NAME,
      CronJobType.OUTSTANDING_RECEIVABLE,
      () => this.cronFetchAndStoreLedgers(),
      { minutes: 0, seconds: 0, hours: 1 },
      'Outstanding Receivable',
    );
  }

  // Schedule or reschedule the ledger cron job
  async scheduleLedgerCronJob(): Promise<void> {
    await this.cronSchedulerService.scheduleCronJob(
      this.LEDGER_CRON_JOB_NAME,
      CronJobType.LEDGER_STATEMENT,
      () => this.cronFetchAndLedgers(),
      { minutes: 0, seconds: 0, hours: 1 },
      'Ledger Statement',
    );
  }

  // Get sync status
  getLedgerSyncStatus(): SyncStatus {
    return this.ledgerSyncStatus;
  }

  getReceivableSyncStatus(): SyncStatus {
    return this.receivableSyncStatus;
  }

  private logTallySyncSummary(
    syncType: 'Outstanding' | 'Ledger Statement',
    totalRecords: number,
    fromDate?: string | null,
    toDate?: string | null,
  ): void {
    const selectedRange =
      fromDate && toDate ? `${fromDate} to ${toDate}` : 'default financial year';
    this.logger.log(
      `[TALLY ${syncType}] Date range: ${selectedRange}, records fetched: ${totalRecords}`,
    );
  }

  private logLedgerStatementXmlPayload(
    syncMode: 'manual' | 'cron',
    xmlPayload: string,
  ): void {
    // Keep this as console output so payload is directly visible in runtime logs.
    console.log(`[TALLY LEDGER XML PAYLOAD - ${syncMode.toUpperCase()}]`);
    console.log(xmlPayload);
  }

  // OutStanding Receivables
  async fetchAndStoreLedgers(): Promise<void> {
    const REQUEST_TIMEOUT = TALLY_REQUEST_TIMEOUT;

    const SyncSetting = await this.syncControlSettingsRepository.findOne({
      where: { moduleName: 'Outstanding Amount' },
    });

    if (!SyncSetting || !SyncSetting.isManualSyncEnabled) {
      throw new BadRequestException('Manual Sync for Outstanding is disabled.');
    }

    // Update status to processing
    this.receivableSyncStatus = {
      status: 'processing',
      message: 'Starting receivable sync...',
      startTime: new Date(),
    };

    try {
      const receivableXml = getReceivableXml(
        SyncSetting.fromDate,
        SyncSetting.toDate,
      );

      // Try to connect to Tally with timeout
      let response;
      try {
        response = await axios.get(TALLY_URL, {
          headers: { 'Content-Type': 'text/xml' },
          data: receivableXml,
          timeout: REQUEST_TIMEOUT,
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

        this.receivableSyncStatus = {
          status: 'error',
          message: 'Sync stopped: Tally is not available',
          error: errorMessage,
          startTime: this.receivableSyncStatus.startTime,
          endTime: new Date(),
        };

        this.logger.error(
          'Receivable sync stopped - Tally connection failed:',
          errorMessage,
        );
        // Return immediately - don't continue processing
        return;
      }

      if (response.data.includes('<LINEERROR>')) {
        this.receivableSyncStatus = {
          status: 'error',
          message: 'Sync stopped: Tally login required',
          error: TALLY_ERROR_MESSAGES.LOGIN_REQUIRED,
          startTime: this.receivableSyncStatus.startTime,
          endTime: new Date(),
        };
        this.logger.error('Receivable sync stopped - Tally login required');
        // Return immediately - don't continue processing
        return;
      }

      this.receivableSyncStatus.message = 'Fetching data from Tally...';

      const outstandingData = await this.parseXmlToOutstanding(response.data);
      this.logTallySyncSummary(
        'Outstanding',
        outstandingData.length,
        SyncSetting.fromDate,
        SyncSetting.toDate,
      );

      const totalRecords = outstandingData.length;
      this.receivableSyncStatus.message = `Processing ${totalRecords} receivable records...`;
      this.receivableSyncStatus.totalRecords = totalRecords;
      this.receivableSyncStatus.processedRecords = 0;
      this.receivableSyncStatus.updatesCount = 0;
      this.receivableSyncStatus.insertsCount = 0;

      // Step 1: Delete ALL existing receivables and bills (silently, no status message)
      const existingCustomers = await this.ledgerRepository
        .createQueryBuilder('ledger')
        .leftJoinAndSelect('ledger.bills', 'bills')
        .getMany();

      if (existingCustomers.length > 0) {
        // Delete bills first in batches
        const deleteBatchSize = 500;
        for (let i = 0; i < existingCustomers.length; i += deleteBatchSize) {
          const deleteBatch = existingCustomers.slice(i, i + deleteBatchSize);
          for (const receivable of deleteBatch) {
            if (receivable.bills && receivable.bills.length > 0) {
              await this.billRepository.remove(receivable.bills);
            }
          }
          await this.ledgerRepository.remove(deleteBatch);
        }
      }

      // Step 2: Insert all data from Tally (fresh insert)
      if (outstandingData.length > 0) {
        this.receivableSyncStatus.message = `Syncing ${outstandingData.length} receivables from Tally...`;

        // Prepare all receivables and bills for insert
        const allBills: Array<{ bill: BillEntity; customerName: string }> = [];
        const receivablesToInsert: LedgerEntity[] = [];

        for (const outstanding of outstandingData) {
          if (!outstanding.customerName) continue;

          // Collect bills
          if (outstanding.bills && outstanding.bills.length > 0) {
            allBills.push(
              ...outstanding.bills.map((b) => ({
                bill: b,
                customerName: outstanding.customerName,
              })),
            );
            outstanding.bills = []; // Remove bills, will add after save
          }
          receivablesToInsert.push(outstanding);
        }

        // Bulk insert all receivables in batches
        const batchSize = 500;
        const insertBatches = [];
        for (let i = 0; i < receivablesToInsert.length; i += batchSize) {
          insertBatches.push(receivablesToInsert.slice(i, i + batchSize));
        }

        this.receivableSyncStatus.batchesTotal = insertBatches.length;
        const allSavedReceivables: LedgerEntity[] = [];

        for (let i = 0; i < insertBatches.length; i++) {
          this.receivableSyncStatus.currentBatch = i + 1;
          this.receivableSyncStatus.message = `Syncing batch ${i + 1}/${insertBatches.length}...`;
          const savedReceivables = await this.ledgerRepository.save(
            insertBatches[i],
          );
          allSavedReceivables.push(...savedReceivables);
        }

        // Create map of saved receivables by customer name
        const savedReceivableMap = new Map(
          allSavedReceivables.map((ledger) => [ledger.customerName, ledger]),
        );

        // Bulk insert all bills in batches
        if (allBills.length > 0) {
          this.receivableSyncStatus.message = `Syncing ${allBills.length} bills...`;
          const billsToInsert = allBills
            .map(({ bill, customerName }) => {
              const savedLedger = savedReceivableMap.get(customerName);
              if (savedLedger) {
                bill.ledger = savedLedger;
                return bill;
              }
              return null;
            })
            .filter((b): b is BillEntity => b !== null);

          if (billsToInsert.length > 0) {
            const billBatchSize = 1000;
            for (let i = 0; i < billsToInsert.length; i += billBatchSize) {
              const billBatch = billsToInsert.slice(i, i + billBatchSize);
              try {
                await this.billRepository.save(billBatch);
              } catch (error) {
                // Ignore duplicate errors
              }
            }
          }
        }

        this.receivableSyncStatus.insertsCount = receivablesToInsert.length;
      }

      this.receivableSyncStatus.processedRecords = totalRecords;

      const endTime = new Date();
      const duration = this.receivableSyncStatus.startTime
        ? endTime.getTime() - this.receivableSyncStatus.startTime.getTime()
        : 0;

      // Update status to completed
      this.receivableSyncStatus = {
        status: 'completed',
        message: 'Receivable sync completed successfully',
        progress: 100,
        startTime: this.receivableSyncStatus.startTime,
        endTime: endTime,
        totalRecords: totalRecords,
        processedRecords: totalRecords,
        batchesTotal: 1,
        currentBatch: 1,
        updatesCount: this.receivableSyncStatus.updatesCount || 0,
        insertsCount: this.receivableSyncStatus.insertsCount || 0,
        duration: duration,
      };
    } catch (error: any) {
      // If status is already set to error (from Tally connection failure), don't override it
      if (this.receivableSyncStatus.status !== 'error') {
        // Update status to error
        this.receivableSyncStatus = {
          status: 'error',
          message: 'Receivable sync failed',
          error: error?.message || 'Unknown error occurred',
          startTime: this.receivableSyncStatus.startTime,
          endTime: new Date(),
        };
      }

      this.logger.error(
        'Receivable sync failed:',
        error?.message || 'Unknown error',
      );
      // Return immediately - don't continue processing
      return;
    }
  }

  async parseXmlToOutstanding(xml: string): Promise<LedgerEntity[]> {
    const wrappedXml = `<OUTSTANDINGS>${xml}</OUTSTANDINGS>`;
    const parsedResult = await parseStringPromise(wrappedXml);

    const outstandingItems = parsedResult.OUTSTANDINGS?.OUTSTANDING || [];

    return outstandingItems.map((item: any) => {
      const outstandingDto = new LedgerEntity();

      outstandingDto.customerName = this.cleanString(
        item.CUSTOMERNAME?.[0] || '',
      );
      outstandingDto.creditLimit = parseFloat(item.CREDITLIMIT?.[0] || '0');
      outstandingDto.closingBalance = parseFloat(
        item.CLOSINGBALANCE?.[0] || '0',
      );

      outstandingDto.bills =
        item.BILLS?.map((bill: any) => {
          const ledgerBill = new BillEntity();
          ledgerBill.tallyOrdId = this.cleanString(bill.TALLYORDID?.[0] || '');
          ledgerBill.nxOrderId = this.cleanString(bill.NXORDERID?.[0] || '');
          ledgerBill.tallyInvNo = this.cleanString(bill.TALLYINVNO?.[0] || '');
          ledgerBill.billDate = this.cleanString(bill.BILLDATE?.[0] || '');
          ledgerBill.openingBalance = parseFloat(
            bill.OPENINGBALANCE?.[0] || '0',
          );
          ledgerBill.closingBalance = parseFloat(
            bill.CLOSINGBALANCE?.[0] || '0',
          );
          ledgerBill.creditPeriod = this.cleanString(
            bill.CREDITPERIOD?.[0] || '0',
          );

          return ledgerBill;
        }) || [];

      return outstandingDto;
    });
  }

  private cleanString(value: string | undefined): string {
    return value?.replace(/\x04/g, '').trim() || '';
  }

  private hasStatementChanges(
    existingBill: LedgerEntity,
    newBill: LedgerEntity,
  ): boolean {
    return (
      existingBill.customerName === newBill.customerName &&
        existingBill.creditLimit === newBill.creditLimit,
      existingBill.closingBalance === newBill.closingBalance,
      this.hasChanges(existingBill.bills, newBill.bills)
    );
  }

  private hasChanges(
    existingBills: BillEntity[],
    newBills: BillEntity[],
  ): boolean {
    if (existingBills.length !== newBills.length) return true;

    for (const newBill of newBills) {
      const isExisting = existingBills.some(
        (existingVoucher) =>
          existingVoucher.tallyOrdId === newBill.tallyOrdId &&
          existingVoucher.nxOrderId === newBill.nxOrderId &&
          existingVoucher.tallyInvNo === newBill.tallyInvNo &&
          existingVoucher.billDate === newBill.billDate &&
          existingVoucher.openingBalance === newBill.openingBalance &&
          existingVoucher.closingBalance === newBill.closingBalance &&
          existingVoucher.creditPeriod === newBill.creditPeriod,
      );

      if (!isExisting) {
        return true;
      }
    }

    return false;
  }

  async deleteMultiple(ids: string[]): Promise<{ message: string }> {
    const notFoundIds: string[] = [];

    for (const id of ids) {
      const ledger = await this.findById(id);
      if (!ledger) {
        notFoundIds.push(id);
        continue; // skip this ID if not found
      }
      await this.ledgerRepository.remove(ledger);
    }

    if (notFoundIds.length > 0) {
      throw new NotFoundException(
        `outstanding with ids ${notFoundIds.join(', ')} not found`,
      );
    }

    return { message: 'outstanding deleted successfully' };
  }

  // Receivables with pagination
  async findAll(
    page?: number,
    limit?: number,
    search?: string,
  ): Promise<
    | LedgerEntity[]
    | {
        data: LedgerEntity[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }
  > {
    if (!page && !limit) {
      if (search && search.trim() !== '') {
        return this.ledgerRepository
          .createQueryBuilder('ledger')
          .where('LOWER(ledger.customerName) LIKE LOWER(:search)', {
            search: `%${search}%`,
          })
          .orderBy('ledger.customerName', 'ASC')
          .getMany();
      }
      return this.ledgerRepository.find();
    }

    const pageNumber = page || 1;
    const limitNumber = limit || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const queryBuilder = this.ledgerRepository.createQueryBuilder('ledger');

    if (search && search.trim() !== '') {
      queryBuilder.where('LOWER(ledger.customerName) LIKE LOWER(:search)', {
        search: `%${search}%`,
      });
    }

    const total = await queryBuilder.getCount();
    const data = await queryBuilder
      .skip(skip)
      .take(limitNumber)
      .orderBy('ledger.customerName', 'ASC')
      .getMany();

    return {
      data,
      total,
      page: pageNumber,
      limit: limitNumber,
      totalPages: Math.ceil(total / limitNumber),
    };
  }

  // Retrieve ledger data by user's name (for regular users)
  async findAllDataByUserName(userName: string): Promise<LedgerEntity[]> {
    return this.ledgerRepository.find({ where: { customerName: userName } }); // Match by name
  }

  async findById(id: string): Promise<LedgerEntity | null> {
    return this.ledgerRepository.findOne({
      where: { id },
      relations: ['bills'],
    });
  }

  async deleteById(id: string): Promise<boolean> {
    const ledger = await this.ledgerRepository.findOne({
      where: { id },
      relations: ['bills'],
    });
    if (!ledger) {
      return false;
    }

    // Remove associated bills first
    if (ledger.bills.length > 0) {
      await this.billRepository.remove(ledger.bills);
    }

    // Remove ledger
    await this.ledgerRepository.remove(ledger);
    return true;
  }

  // Ledger Statements
  async fetchAndLedgers(): Promise<void> {
    const REQUEST_TIMEOUT = TALLY_REQUEST_TIMEOUT;

    const SyncSetting = await this.syncControlSettingsRepository.findOne({
      where: { moduleName: 'Ledger Statement' },
    });

    if (!SyncSetting || !SyncSetting.isManualSyncEnabled) {
      throw new BadRequestException('Manual Sync for Ledger is disabled.');
    }

    // Update status to processing
    this.ledgerSyncStatus = {
      status: 'processing',
      message: 'Starting ledger sync...',
      startTime: new Date(),
    };

    try {
      const ledgerXml = getLedgerXml(SyncSetting.fromDate, SyncSetting.toDate);
      this.logLedgerStatementXmlPayload('manual', ledgerXml);

      // Try to connect to Tally with timeout
      let response;
      try {
        response = await axios.get(TALLY_URL, {
          headers: { 'Content-Type': 'text/xml' },
          data: ledgerXml,
          timeout: REQUEST_TIMEOUT,
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

        this.ledgerSyncStatus = {
          status: 'error',
          message: 'Sync stopped: Tally is not available',
          error: errorMessage,
          startTime: this.ledgerSyncStatus.startTime,
          endTime: new Date(),
        };

        this.logger.error(
          'Sync stopped - Tally connection failed:',
          errorMessage,
        );
        // Return immediately - don't continue processing
        return;
      }

      if (response.data.includes('<LINEERROR>')) {
        this.ledgerSyncStatus = {
          status: 'error',
          message: 'Sync stopped: Tally login required',
          error: TALLY_ERROR_MESSAGES.LOGIN_REQUIRED,
          startTime: this.ledgerSyncStatus.startTime,
          endTime: new Date(),
        };
        this.logger.error('Sync stopped - Tally login required');
        // Return immediately - don't continue processing
        return;
      }

      this.ledgerSyncStatus.message = 'Fetching data from Tally...';

      const ledgerData = await this.parseXmlToLedger(response.data);
      this.logTallySyncSummary(
        'Ledger Statement',
        ledgerData.length,
        SyncSetting.fromDate,
        SyncSetting.toDate,
      );

      const totalRecords = ledgerData.length;
      this.ledgerSyncStatus.message = `Processing ${totalRecords} ledger records...`;
      this.ledgerSyncStatus.totalRecords = totalRecords;
      this.ledgerSyncStatus.processedRecords = 0;
      this.ledgerSyncStatus.updatesCount = 0;
      this.ledgerSyncStatus.insertsCount = 0;

      // Step 1: Delete ALL existing ledgers and vouchers (silently, no status message)
      const existingLedgers = await this.ledgerStatementRepo
        .createQueryBuilder('ledger')
        .leftJoinAndSelect('ledger.vouchers', 'vouchers')
        .getMany();

      if (existingLedgers.length > 0) {
        // Delete vouchers first in batches
        const deleteBatchSize = 500;
        for (let i = 0; i < existingLedgers.length; i += deleteBatchSize) {
          const deleteBatch = existingLedgers.slice(i, i + deleteBatchSize);
          for (const ledger of deleteBatch) {
            if (ledger.vouchers && ledger.vouchers.length > 0) {
              await this.ledgerVoucherRepo.remove(ledger.vouchers);
            }
          }
          await this.ledgerStatementRepo.remove(deleteBatch);
        }
      }

      // Step 2: Insert all data from Tally (fresh insert)
      if (ledgerData.length > 0) {
        this.ledgerSyncStatus.message = `Syncing ${ledgerData.length} ledgers from Tally...`;

        // Prepare all ledgers and vouchers for insert
        const allVouchersToInsert: Array<{
          voucher: LedgerVoucherEntity;
          party: string;
        }> = [];
        const ledgersToInsert: LedgerStatementEntity[] = [];

        for (const tallyLedger of ledgerData) {
          if (!tallyLedger.party) continue;

          // Collect vouchers
          if (tallyLedger.vouchers && tallyLedger.vouchers.length > 0) {
            allVouchersToInsert.push(
              ...tallyLedger.vouchers.map((v) => ({
                voucher: v,
                party: tallyLedger.party!,
              })),
            );
            tallyLedger.vouchers = []; // Remove vouchers, will add after save
          }
          ledgersToInsert.push(tallyLedger);
        }

        // Bulk insert all ledgers in batches
        const batchSize = 500;
        const insertBatches = [];
        for (let i = 0; i < ledgersToInsert.length; i += batchSize) {
          insertBatches.push(ledgersToInsert.slice(i, i + batchSize));
        }

        this.ledgerSyncStatus.batchesTotal = insertBatches.length;
        const allSavedLedgers: LedgerStatementEntity[] = [];

        for (let i = 0; i < insertBatches.length; i++) {
          this.ledgerSyncStatus.currentBatch = i + 1;
          this.ledgerSyncStatus.message = `Syncing batch ${i + 1}/${insertBatches.length}...`;
          const savedLedgers = await this.ledgerStatementRepo.save(
            insertBatches[i],
          );
          allSavedLedgers.push(...savedLedgers);
        }

        const savedLedgerMap = new Map(
          allSavedLedgers.map((ledger) => [ledger.party, ledger]),
        );

        // Bulk insert all vouchers in batches
        if (allVouchersToInsert.length > 0) {
          this.ledgerSyncStatus.message = `Syncing ${allVouchersToInsert.length} vouchers...`;
          const vouchersToInsert = allVouchersToInsert
            .map(({ voucher, party }) => {
              const savedLedger = savedLedgerMap.get(party);
              if (savedLedger) {
                voucher.ledgerStatement = savedLedger;
                return voucher;
              }
              return null;
            })
            .filter((v): v is LedgerVoucherEntity => v !== null);

          if (vouchersToInsert.length > 0) {
            const voucherBatchSize = 1000;
            for (
              let i = 0;
              i < vouchersToInsert.length;
              i += voucherBatchSize
            ) {
              const voucherBatch = vouchersToInsert.slice(
                i,
                i + voucherBatchSize,
              );
              try {
                await this.ledgerVoucherRepo.save(voucherBatch);
              } catch (error) {
                // Ignore duplicate errors
              }
            }
          }
        }

        this.ledgerSyncStatus.insertsCount = ledgersToInsert.length;
      }

      this.ledgerSyncStatus.processedRecords = totalRecords;

      const endTime = new Date();
      const duration = this.ledgerSyncStatus.startTime
        ? endTime.getTime() - this.ledgerSyncStatus.startTime.getTime()
        : 0;

      // Update status to completed
      this.ledgerSyncStatus = {
        status: 'completed',
        message: 'Ledger sync completed successfully',
        progress: 100,
        startTime: this.ledgerSyncStatus.startTime,
        endTime: endTime,
        totalRecords: totalRecords,
        processedRecords: totalRecords,
        batchesTotal: 1,
        currentBatch: 1,
        updatesCount: this.ledgerSyncStatus.updatesCount || 0,
        insertsCount: this.ledgerSyncStatus.insertsCount || 0,
        duration: duration,
      };
    } catch (error: any) {
      // If status is already set to error (from Tally connection failure), don't override it
      if (this.ledgerSyncStatus.status !== 'error') {
        // Update status to error
        this.ledgerSyncStatus = {
          status: 'error',
          message: 'Ledger sync failed',
          error: error?.message || 'Unknown error occurred',
          startTime: this.ledgerSyncStatus.startTime,
          endTime: new Date(),
        };
      }

      this.logger.error('Sync failed:', error?.message || 'Unknown error');
      // Return immediately - don't continue processing
      return;
    }
  }

  async parseXmlToLedger(xml: string): Promise<LedgerStatementEntity[]> {
    const wrappedXml = `<LEDGERSTATEMENTS>${xml}</LEDGERSTATEMENTS>`;
    const parsedResult = await parseStringPromise(wrappedXml);

    const ledgerItems = parsedResult.LEDGERSTATEMENTS?.LEDGERSTATEMENT || [];

    return ledgerItems.map((item: any) => {
      const ledgerEntity = new LedgerStatementEntity();
      ledgerEntity.party = this.cleanString(item.PARTY?.[0] || '');
      ledgerEntity.alias = this.cleanString(item.ALIAS?.[0] || '');
      ledgerEntity.openingBalance = parseFloat(item.OPENINGBALANCE?.[0] || '0');
      ledgerEntity.closingBalance = parseFloat(item.CLOSINGBALANCE?.[0] || '0');
      ledgerEntity.totalDebitAmount = parseFloat(item.TOTADEBITAMT?.[0] || '0');
      ledgerEntity.totalCreditAmount = parseFloat(
        item.TOTALCREDITAMT?.[0] || '0',
      );

      ledgerEntity.vouchers =
        item.LEDGERVOUCHERS?.map((voucher: any) => {
          const ledgerVoucher = new LedgerVoucherEntity();
          ledgerVoucher.date = this.cleanString(voucher.DATE?.[0] || '');
          ledgerVoucher.ledger = this.cleanString(voucher.LEDGER?.[0] || '');
          ledgerVoucher.voucherType = this.cleanString(
            voucher.VCHTYPE?.[0] || '',
          );

          // Extract voucher number - handle both string and array cases
          let voucherNoValue = '';
          if (Array.isArray(voucher.VCHNO)) {
            voucherNoValue = voucher.VCHNO[0] || '';
          } else if (voucher.VCHNO) {
            voucherNoValue = voucher.VCHNO;
          } else {
            voucherNoValue = voucher.VCHNO?.[0] || '';
          }
          ledgerVoucher.voucherNo = this.cleanString(voucherNoValue);
          ledgerVoucher.debitAmount = parseFloat(voucher.DEBITAMT?.[0] || '0');
          ledgerVoucher.creditAmount = parseFloat(
            voucher.CREDITAMT?.[0] || '0',
          );
          return ledgerVoucher;
        }) || [];

      return ledgerEntity;
    });
  }

  private async processVouchers(
    existingLedger: LedgerStatementEntity,
    newVouchers: LedgerVoucherEntity[],
  ): Promise<LedgerVoucherEntity[]> {
    const existingVouchers = existingLedger.vouchers;

    const processedVouchers: LedgerVoucherEntity[] = [];

    for (const newVoucher of newVouchers) {
      const isDuplicate = existingVouchers.some(
        (existingVoucher) =>
          existingVoucher.voucherNo === newVoucher.voucherNo &&
          existingVoucher.date === newVoucher.date &&
          existingVoucher.debitAmount === newVoucher.debitAmount &&
          existingVoucher.creditAmount === newVoucher.creditAmount,
      );

      if (!isDuplicate) {
        processedVouchers.push(newVoucher);
      }
    }

    return processedVouchers;
  }

  private async saveVoucherIfNotDuplicate(
    voucher: LedgerVoucherEntity,
  ): Promise<void> {
    const duplicateVoucher = await this.ledgerVoucherRepo.findOne({
      where: {
        voucherNo: voucher.voucherNo,
        date: voucher.date,
        debitAmount: voucher.debitAmount,
        creditAmount: voucher.creditAmount,
      },
    });

    if (!duplicateVoucher) {
      await this.ledgerVoucherRepo.save(voucher);
    } else {
    }
  }

  private hasLedgerStatementChanges(
    existingLedger: LedgerStatementEntity,
    newLedger: LedgerStatementEntity,
  ): boolean {
    return (
      existingLedger.party !== newLedger.party ||
      existingLedger.alias !== newLedger.alias ||
      existingLedger.openingBalance !== newLedger.openingBalance ||
      existingLedger.closingBalance !== newLedger.closingBalance ||
      existingLedger.totalDebitAmount !== newLedger.totalDebitAmount ||
      existingLedger.totalCreditAmount !== newLedger.totalCreditAmount ||
      this.hasVoucherChanges(existingLedger.vouchers, newLedger.vouchers)
    );
  }

  private hasVoucherChanges(
    existingVouchers: LedgerVoucherEntity[],
    newVouchers: LedgerVoucherEntity[],
  ): boolean {
    if (existingVouchers.length !== newVouchers.length) return true;

    for (const newVoucher of newVouchers) {
      const isExisting = existingVouchers.some(
        (existingVoucher) =>
          existingVoucher.voucherNo === newVoucher.voucherNo &&
          existingVoucher.date === newVoucher.date &&
          existingVoucher.debitAmount === newVoucher.debitAmount &&
          existingVoucher.creditAmount === newVoucher.creditAmount,
      );

      if (!isExisting) {
        return true;
      }
    }

    return false;
  }

  // Ledger Statement with pagination
  async findLedgerData(
    page?: number,
    limit?: number,
    search?: string,
  ): Promise<
    | LedgerStatementEntity[]
    | {
        data: LedgerStatementEntity[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }
  > {
    if (!page && !limit) {
      if (search && search.trim() !== '') {
        return this.ledgerStatementRepo
          .createQueryBuilder('ledger')
          .where('LOWER(ledger.party) LIKE LOWER(:search)', {
            search: `%${search}%`,
          })
          .orderBy('ledger.party', 'ASC')
          .getMany();
      }
      return this.ledgerStatementRepo.find();
    }

    const pageNumber = page || 1;
    const limitNumber = limit || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const queryBuilder = this.ledgerStatementRepo.createQueryBuilder('ledger');

    if (search && search.trim() !== '') {
      queryBuilder.where('LOWER(ledger.party) LIKE LOWER(:search)', {
        search: `%${search}%`,
      });
    }

    const total = await queryBuilder.getCount();
    const data = await queryBuilder
      .skip(skip)
      .take(limitNumber)
      .orderBy('ledger.party', 'ASC')
      .getMany();

    return {
      data,
      total,
      page: pageNumber,
      limit: limitNumber,
      totalPages: Math.ceil(total / limitNumber),
    };
  }

  // Retrieve ledger data by user's name (for regular users)
  async findLedgerDataByUserName(
    userName: string,
  ): Promise<LedgerStatementEntity[]> {
    return this.ledgerStatementRepo.find({ where: { party: userName } }); // Match by name
  }

  // Retrieve a specific ledger statement by ID
  async findByIdLedgerData(id: string): Promise<LedgerStatementEntity> {
    const statement = await this.ledgerStatementRepo.findOne({ where: { id } });
    if (!statement) {
      throw new NotFoundException('Ledger statement not found.');
    }
    return statement;
  }

  async cronFetchAndStoreLedgers(): Promise<void> {
    const REQUEST_TIMEOUT = TALLY_REQUEST_TIMEOUT;

    // Check if "AutoSync" is enabled for outstanding data
    const SyncSetting = await this.syncControlSettingsRepository.findOne({
      where: { moduleName: 'Outstanding Amount' },
    });

    if (!SyncSetting || !SyncSetting.isAutoSyncEnabled) {
      this.logger.warn(
        'Auto Sync for Outstanding is disabled. Skipping cron job.',
      );
      return; // Don't throw, just skip silently for cron jobs
    }

    try {
      const receivableXml = getReceivableXml(
        SyncSetting.fromDate,
        SyncSetting.toDate,
      );

      // Try to connect to Tally with timeout
      let response;
      try {
        response = await axios.get(TALLY_URL, {
          headers: { 'Content-Type': 'text/xml' },
          data: receivableXml,
          timeout: REQUEST_TIMEOUT,
        });
      } catch (axiosError: any) {
        // If Tally is not available, log and return (don't throw for cron jobs)
        this.logger.error(
          'Receivable cron sync failed - Tally connection error:',
          axiosError?.code || axiosError?.message,
        );
        return; // Silently fail for cron jobs
      }

      if (response.data.includes('<LINEERROR>')) {
        this.logger.error('Receivable cron sync failed - Tally login required');
        return; // Silently fail for cron jobs
      }

      // Parse the XML data
      const outstandingData = await this.parseXmlToOutstanding(response.data);
      this.logTallySyncSummary(
        'Outstanding',
        outstandingData.length,
        SyncSetting.fromDate,
        SyncSetting.toDate,
      );

      // Step 1: Delete ALL existing receivables and bills
      this.logger.log('Cron: Deleting all existing receivables...');
      const existingOutstandings = await this.ledgerRepository
        .createQueryBuilder('ledger')
        .leftJoinAndSelect('ledger.bills', 'bills')
        .getMany();

      if (existingOutstandings.length > 0) {
        // Delete bills first in batches
        const deleteBatchSize = 500;
        for (let i = 0; i < existingOutstandings.length; i += deleteBatchSize) {
          const deleteBatch = existingOutstandings.slice(
            i,
            i + deleteBatchSize,
          );
          for (const receivable of deleteBatch) {
            if (receivable.bills && receivable.bills.length > 0) {
              await this.billRepository.remove(receivable.bills);
            }
          }
          await this.ledgerRepository.remove(deleteBatch);
        }
      }

      // Step 2: Insert all data from Tally (fresh insert)
      if (outstandingData.length > 0) {
        this.logger.log(
          `Cron: Inserting ${outstandingData.length} receivables from Tally...`,
        );

        // Prepare all receivables and bills for insert
        const allBills: Array<{ bill: BillEntity; customerName: string }> = [];
        const receivablesToInsert: LedgerEntity[] = [];

        for (const outstanding of outstandingData) {
          if (!outstanding.customerName) continue;

          // Collect bills
          if (outstanding.bills && outstanding.bills.length > 0) {
            allBills.push(
              ...outstanding.bills.map((b) => ({
                bill: b,
                customerName: outstanding.customerName,
              })),
            );
            outstanding.bills = []; // Remove bills, will add after save
          }
          receivablesToInsert.push(outstanding);
        }

        // Bulk insert all receivables in batches
        const batchSize = 500;
        const insertBatches = [];
        for (let i = 0; i < receivablesToInsert.length; i += batchSize) {
          insertBatches.push(receivablesToInsert.slice(i, i + batchSize));
        }

        const allSavedReceivables: LedgerEntity[] = [];
        for (const batch of insertBatches) {
          const savedReceivables = await this.ledgerRepository.save(batch);
          allSavedReceivables.push(...savedReceivables);
        }

        // Create map of saved receivables by customer name
        const savedReceivableMap = new Map(
          allSavedReceivables.map((ledger) => [ledger.customerName, ledger]),
        );

        // Bulk insert all bills in batches
        if (allBills.length > 0) {
          const billsToInsert = allBills
            .map(({ bill, customerName }) => {
              const savedLedger = savedReceivableMap.get(customerName);
              if (savedLedger) {
                bill.ledger = savedLedger;
                return bill;
              }
              return null;
            })
            .filter((b): b is BillEntity => b !== null);

          if (billsToInsert.length > 0) {
            const billBatchSize = 1000;
            for (let i = 0; i < billsToInsert.length; i += billBatchSize) {
              const billBatch = billsToInsert.slice(i, i + billBatchSize);
              try {
                await this.billRepository.save(billBatch);
              } catch (error) {
                // Ignore duplicate errors
              }
            }
          }
        }
      }

      this.logger.log('Receivable cron sync completed successfully');
    } catch (error: any) {
      // Log error but don't throw for cron jobs (to prevent cron job failure)
      this.logger.error(
        'Receivable cron sync failed:',
        error?.message || 'Unknown error',
      );
    }
  }

  async cronFetchAndLedgers(): Promise<void> {
    const REQUEST_TIMEOUT = TALLY_REQUEST_TIMEOUT;

    const SyncSetting = await this.syncControlSettingsRepository.findOne({
      where: { moduleName: 'Ledger Statement' },
    });

    if (!SyncSetting || !SyncSetting.isAutoSyncEnabled) {
      this.logger.warn('Auto Sync for Ledger is disabled. Skipping cron job.');
      return; // Don't throw, just skip silently for cron jobs
    }

    try {
      const ledgerXml = getLedgerXml(SyncSetting.fromDate, SyncSetting.toDate);
      this.logLedgerStatementXmlPayload('cron', ledgerXml);

      // Try to connect to Tally with timeout
      let response;
      try {
        response = await axios.get(TALLY_URL, {
          headers: { 'Content-Type': 'text/xml' },
          data: ledgerXml,
          timeout: REQUEST_TIMEOUT,
        });
      } catch (axiosError: any) {
        // If Tally is not available, log and return (don't throw for cron jobs)
        this.logger.error(
          'Ledger cron sync failed - Tally connection error:',
          axiosError?.code || axiosError?.message,
        );
        return; // Silently fail for cron jobs
      }

      if (response.data.includes('<LINEERROR>')) {
        this.logger.error('Ledger cron sync failed - Tally login required');
        return; // Silently fail for cron jobs
      }

      const ledgerData = await this.parseXmlToLedger(response.data);
      this.logTallySyncSummary(
        'Ledger Statement',
        ledgerData.length,
        SyncSetting.fromDate,
        SyncSetting.toDate,
      );

      // Step 1: Delete ALL existing ledgers and vouchers
      this.logger.log('Cron: Deleting all existing ledgers...');
      const existingLedgers = await this.ledgerStatementRepo
        .createQueryBuilder('ledger')
        .leftJoinAndSelect('ledger.vouchers', 'vouchers')
        .getMany();

      if (existingLedgers.length > 0) {
        // Delete vouchers first in batches
        const deleteBatchSize = 500;
        for (let i = 0; i < existingLedgers.length; i += deleteBatchSize) {
          const deleteBatch = existingLedgers.slice(i, i + deleteBatchSize);
          for (const ledger of deleteBatch) {
            if (ledger.vouchers && ledger.vouchers.length > 0) {
              await this.ledgerVoucherRepo.remove(ledger.vouchers);
            }
          }
          await this.ledgerStatementRepo.remove(deleteBatch);
        }
      }

      // Step 2: Insert all data from Tally (fresh insert)
      if (ledgerData.length > 0) {
        this.logger.log(
          `Cron: Inserting ${ledgerData.length} ledgers from Tally...`,
        );

        // Prepare all ledgers and vouchers for insert
        const allVouchersToInsert: Array<{
          voucher: LedgerVoucherEntity;
          party: string;
        }> = [];
        const ledgersToInsert: LedgerStatementEntity[] = [];

        for (const tallyLedger of ledgerData) {
          if (!tallyLedger.party) continue;

          // Collect vouchers
          if (tallyLedger.vouchers && tallyLedger.vouchers.length > 0) {
            allVouchersToInsert.push(
              ...tallyLedger.vouchers.map((v) => ({
                voucher: v,
                party: tallyLedger.party!,
              })),
            );
            tallyLedger.vouchers = []; // Remove vouchers, will add after save
          }
          ledgersToInsert.push(tallyLedger);
        }

        // Bulk insert all ledgers in batches
        const batchSize = 500;
        const insertBatches = [];
        for (let i = 0; i < ledgersToInsert.length; i += batchSize) {
          insertBatches.push(ledgersToInsert.slice(i, i + batchSize));
        }

        const allSavedLedgers: LedgerStatementEntity[] = [];
        for (const batch of insertBatches) {
          const savedLedgers = await this.ledgerStatementRepo.save(batch);
          allSavedLedgers.push(...savedLedgers);
        }

        const savedLedgerMap = new Map(
          allSavedLedgers.map((ledger) => [ledger.party, ledger]),
        );

        // Bulk insert all vouchers in batches
        if (allVouchersToInsert.length > 0) {
          const vouchersToInsert = allVouchersToInsert
            .map(({ voucher, party }) => {
              const savedLedger = savedLedgerMap.get(party);
              if (savedLedger) {
                voucher.ledgerStatement = savedLedger;
                return voucher;
              }
              return null;
            })
            .filter((v): v is LedgerVoucherEntity => v !== null);

          if (vouchersToInsert.length > 0) {
            const voucherBatchSize = 1000;
            for (
              let i = 0;
              i < vouchersToInsert.length;
              i += voucherBatchSize
            ) {
              const voucherBatch = vouchersToInsert.slice(
                i,
                i + voucherBatchSize,
              );
              try {
                await this.ledgerVoucherRepo.save(voucherBatch);
              } catch (error) {
                // Ignore duplicate errors
              }
            }
          }
        }
      }

      this.logger.log('Ledger cron sync completed successfully');
    } catch (error: any) {
      // Log error but don't throw for cron jobs (to prevent cron job failure)
      this.logger.error(
        'Ledger cron sync failed:',
        error?.message || 'Unknown error',
      );
    }
  }
}
