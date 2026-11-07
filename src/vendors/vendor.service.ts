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
import { parseStringPromise } from 'xml2js'; // Library for parsing XML to JSON
import { Vendors } from './../tally/vendors';
import { VendorDto } from './../user/users.dto';
import { OnModuleInit } from '@nestjs/common';

import { UserEntity, UserRole, UserStatus } from './../user/users.entity';
import { AddressesService } from './../addresses/addresses.service';
import { CreateAddressDto } from './../addresses/addresses.dto';
import { SyncControlSettings, CronJobType } from './../settings/setting.entity';
import { SyncLogEntity, SyncLogStatus } from './../sync-log/sync-log.entity';
import { AddressType } from 'addresses/addresses.entity';
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
  deletesCount?: number;
  duration?: number; // in milliseconds
}

@Injectable()
export class VendorService implements OnModuleInit {
  private readonly logger = new Logger(VendorService.name);
  private readonly CRON_JOB_NAME = 'vendorSyncCron';

  // In-memory status tracking
  private vendorSyncStatus: SyncStatus = {
    status: 'idle',
    message: 'No sync in progress',
  };

  constructor(
    @InjectRepository(UserEntity)
    private vendorRepository: Repository<UserEntity>,
    private readonly addressesService: AddressesService,

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
      CronJobType.VENDOR_SYNC,
      () => this.CronFetchAndStoreVendors(),
      { minutes: 0, seconds: 0, hours: 1 },
      'Vendor sync',
    );
  }

  // Get sync status
  getVendorSyncStatus(): SyncStatus {
    return this.vendorSyncStatus;
  }

  async fetchAndStoreVendors(): Promise<void> {
    const REQUEST_TIMEOUT = 120000; // 2 minutes - allow full response for large vendor list
    const BATCH_SIZE = 500; // Increased batch size for better performance

    // Check if "Manual Sync" is enabled for vendors
    const SyncSetting = await this.syncControlSettingsRepository.findOne({
      where: { moduleName: 'Vendors' },
    });

    if (!SyncSetting || !SyncSetting.isManualSyncEnabled) {
      throw new BadRequestException('Manual Sync for Vendor is disabled.');
    }

    // Update status to processing
    this.vendorSyncStatus = {
      status: 'processing',
      message: 'Starting vendor sync...',
      startTime: new Date(),
    };

    try {
      // Try to connect to Tally with timeout
      let response;
      try {
        // Use POST so Tally receives full XML body and returns complete response in one go (GET + body is non-standard and can cause partial/chunked data)
        response = await axios.post(process.env.TALLY_URL as string, Vendors, {
          headers: {
            'Content-Type': 'text/xml',
          },
          timeout: REQUEST_TIMEOUT,
          responseType: 'text',
          maxContentLength: 50 * 1024 * 1024, // 50MB
          maxBodyLength: 50 * 1024 * 1024,
        });
      } catch (axiosError: any) {
        // If Tally is not available, immediately stop sync and set error status
        const errorMessage =
          axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT'
            ? 'Request timeout: Tally is not responding'
            : axiosError.code === 'ECONNREFUSED' ||
                axiosError.code === 'ENOTFOUND'
              ? 'Connection failed: Tally is not available'
              : 'No response from Tally';

        this.vendorSyncStatus = {
          status: 'error',
          message: 'Sync stopped: Tally is not available',
          error: errorMessage,
          startTime: this.vendorSyncStatus.startTime,
          endTime: new Date(),
        };

        this.logger.error(
          'Vendor sync stopped - Tally connection failed:',
          errorMessage,
        );
        // Return immediately - don't continue processing
        return;
      }

      // Check for specific XML error patterns in the response
      if (response.data.includes('<LINEERROR>')) {
        this.vendorSyncStatus = {
          status: 'error',
          message: 'Sync stopped: Tally login required',
          error: 'Please Login The Tally',
          startTime: this.vendorSyncStatus.startTime,
          endTime: new Date(),
        };
        this.logger.error('Vendor sync stopped - Tally login required');
        // Return immediately - don't continue processing
        return;
      }

      this.vendorSyncStatus.message = 'Fetching data from Tally...';

      const vendors = await this.parseXmlToVendors(response.data);

      const totalRecords = vendors.length;
      this.vendorSyncStatus.message = `Processing ${totalRecords} vendor records...`;
      this.vendorSyncStatus.totalRecords = totalRecords;
      this.vendorSyncStatus.processedRecords = 0;
      this.vendorSyncStatus.updatesCount = 0;
      this.vendorSyncStatus.insertsCount = 0;

      // Fetch all existing vendors for comparison (excluding address fields)
      const existingVendors = await this.vendorRepository.find({
        where: { role: UserRole.Vendor, isDeleted: false },
      });

      // Create maps for quick lookup
      const tallyVendorSet = new Set(
        vendors.filter((v) => v.name).map((v) => v.name),
      );
      const existingVendorMap = new Map(
        existingVendors.map((vendor) => [vendor.name, vendor]),
      );

      // Step 1: Delete vendors that exist in DB but not in Tally
      const vendorsToDelete = existingVendors.filter(
        (vendor) => vendor.name && !tallyVendorSet.has(vendor.name),
      );

      if (vendorsToDelete.length > 0) {
        this.vendorSyncStatus.message = `Deleting ${vendorsToDelete.length} vendors not in Tally...`;
        // Delete addresses first (cascade should handle this, but being explicit)
        const deleteBatchSize = 500;
        for (let i = 0; i < vendorsToDelete.length; i += deleteBatchSize) {
          const deleteBatch = vendorsToDelete.slice(i, i + deleteBatchSize);
          for (const vendor of deleteBatch) {
            // Delete associated addresses
            try {
              const address = await this.addressesService.findByUserId(
                vendor.id,
              );
              if (address) {
                await this.addressesService.delete(address.id);
              }
            } catch (error) {
              // If address doesn't exist or already deleted, continue
              this.logger.warn(
                `Address not found for vendor ${vendor.id}, continuing...`,
              );
            }
          }
          // Delete vendors
          await this.vendorRepository.remove(deleteBatch);
        }
        this.vendorSyncStatus.deletesCount = vendorsToDelete.length;
      }

      // Step 2: Process inserts and updates
      const vendorsToSave: UserEntity[] = [];
      const vendorsToUpdate: UserEntity[] = [];
      const addressesToProcess: Array<{ vendor: UserEntity; vendorDto: any }> =
        [];

      for (const vendor of vendors) {
        if (!vendor.name) continue;

        const existingVendor = existingVendorMap.get(vendor.name);

        if (existingVendor) {
          // Compare all fields except address-related (address, country, state, pincode)
          if (this.hasEssentialChanges(existingVendor, vendor)) {
            vendorsToUpdate.push({ ...existingVendor, ...vendor });
            addressesToProcess.push({
              vendor: existingVendor,
              vendorDto: vendor,
            });
          }
        } else {
          vendorsToSave.push(vendor);
        }

        this.vendorSyncStatus.processedRecords += 1;
      }

      // Bulk save new vendors
      if (vendorsToSave.length > 0) {
        this.vendorSyncStatus.message = `Inserting ${vendorsToSave.length} new vendors...`;
        const savedVendors = await this.vendorRepository.save(vendorsToSave);
        this.vendorSyncStatus.insertsCount = vendorsToSave.length;
        // Add saved vendors to address processing
        savedVendors.forEach((savedVendor) => {
          const originalVendor = vendorsToSave.find(
            (v) => v.name === savedVendor.name,
          );
          if (originalVendor) {
            addressesToProcess.push({
              vendor: savedVendor,
              vendorDto: originalVendor,
            });
          }
        });
      }

      // Bulk update existing vendors
      if (vendorsToUpdate.length > 0) {
        this.vendorSyncStatus.message = `Updating ${vendorsToUpdate.length} existing vendors...`;
        await this.vendorRepository.save(vendorsToUpdate);
        this.vendorSyncStatus.updatesCount = vendorsToUpdate.length;
      }

      // Process addresses in batches
      if (addressesToProcess.length > 0) {
        this.vendorSyncStatus.message = `Processing ${addressesToProcess.length} vendor addresses...`;
        const addressBatches = [];
        for (let i = 0; i < addressesToProcess.length; i += BATCH_SIZE) {
          addressBatches.push(addressesToProcess.slice(i, i + BATCH_SIZE));
        }

        this.vendorSyncStatus.batchesTotal = addressBatches.length;
        for (let i = 0; i < addressBatches.length; i++) {
          this.vendorSyncStatus.currentBatch = i + 1;
          this.vendorSyncStatus.message = `Processing address batch ${i + 1}/${addressBatches.length}...`;
          const batch = addressBatches[i];
          await Promise.all(
            batch.map(({ vendor, vendorDto }) =>
              this.storeVendorAddress(vendor, vendorDto),
            ),
          );
        }
      }

      const endTime = new Date();
      const duration = this.vendorSyncStatus.startTime
        ? endTime.getTime() - this.vendorSyncStatus.startTime.getTime()
        : 0;

      // Update status to completed
      this.vendorSyncStatus = {
        status: 'completed',
        message: 'Vendor sync completed successfully',
        progress: 100,
        startTime: this.vendorSyncStatus.startTime,
        endTime: endTime,
        totalRecords: totalRecords,
        processedRecords: totalRecords,
        batchesTotal: 1,
        currentBatch: 1,
        updatesCount: this.vendorSyncStatus.updatesCount || 0,
        insertsCount: this.vendorSyncStatus.insertsCount || 0,
        deletesCount: this.vendorSyncStatus.deletesCount || 0,
        duration: duration,
      };
    } catch (error: any) {
      // If status is already set to error (from Tally connection failure), don't override it
      if (this.vendorSyncStatus.status !== 'error') {
        // Update status to error
        this.vendorSyncStatus = {
          status: 'error',
          message: 'Vendor sync failed',
          error: error?.message || 'Unknown error occurred',
          startTime: this.vendorSyncStatus.startTime,
          endTime: new Date(),
        };
      }

      this.logger.error(
        'Vendor sync failed:',
        error?.message || 'Unknown error',
      );
      // If the error is already a BadRequestException, rethrow it
      if (error instanceof BadRequestException) {
        throw error;
      }
      // General error handling
      throw new InternalServerErrorException(
        'Make Sure Tally is Open and logged In',
      );
    }
  }

  async storeVendorAddress(
    vendor: UserEntity,
    vendorDto: VendorDto,
  ): Promise<void> {
    const createAddressDto: CreateAddressDto = {
      userId: vendor.id,
      mobile: vendorDto.mobile || 'N/A',
      street_address: vendorDto.address || 'N/A',
      state: vendorDto.state || 'N/A',
      addressType: AddressType.Default,
      zip_code: vendorDto.pincode || 'N/A',
      country: vendorDto.country || 'N/A',
    };

    const existingAddress = await this.addressesService.findByUserId(vendor.id);
    if (existingAddress) {
      await this.addressesService.update(existingAddress.id, createAddressDto);
    } else {
      await this.addressesService.create(createAddressDto, vendor.id);
    }
  }

  async parseXmlToVendors(xml: string): Promise<UserEntity[]> {
    const parsedResult = await parseStringPromise(xml);
    const vendorItems = parsedResult.ENVELOPE.LEDGER || []; // Adjust based on your XML structure

    return vendorItems.map((vendor: any) => {
      const vendorDto = new VendorDto();
      vendorDto.slNo = this.cleanString(vendor.SLNO?.[0]);
      vendorDto.name = this.cleanString(vendor.NAME?.[0]);
      vendorDto.alias = this.cleanString(vendor.ALIAS?.[0]);
      vendorDto.active = this.cleanString(vendor.ACTIVE?.[0]);
      vendorDto.parent = this.cleanString(vendor.PARENT?.[0]);
      vendorDto.address = this.cleanString(vendor.ADDRESS?.[0]);
      vendorDto.country = this.cleanString(vendor.COUNTRY?.[0]);
      vendorDto.state = this.cleanString(vendor.STATE?.[0]);
      vendorDto.pincode = this.cleanString(vendor.PINCODE?.[0]);
      vendorDto.contactPerson = this.cleanString(vendor.CONTACTPERSON?.[0]);
      vendorDto.mobile = this.cleanString(vendor.PHONE?.[0]);
      vendorDto.email = this.cleanString(vendor.EMAIL?.[0]);
      vendorDto.pan = this.cleanString(vendor.PAN?.[0]);
      vendorDto.gstType = this.cleanString(vendor.GSTTYPE?.[0]);
      vendorDto.gstNo = this.cleanString(vendor.GSTNO?.[0]);
      vendorDto.gstDetails = this.cleanString(vendor.GSTDETAILS?.[0]);
      // Convert DTO to Entity
      return this.vendorRepository.create(vendorDto);
    });
  }

  private cleanString(value: string | undefined): string {
    return value?.replace(/\x04/g, '').trim() || '';
  }

  // Function to check if the existing vendor has essential changes (all fields except address-related)
  private hasEssentialChanges(
    existingVendor: UserEntity,
    newVendor: UserEntity,
  ): boolean {
    return (
      existingVendor.slNo !== newVendor.slNo ||
      existingVendor.name !== newVendor.name ||
      existingVendor.alias !== newVendor.alias ||
      existingVendor.active !== newVendor.active ||
      existingVendor.parent !== newVendor.parent ||
      existingVendor.contactPerson !== newVendor.contactPerson ||
      existingVendor.mobile !== newVendor.mobile ||
      existingVendor.email !== newVendor.email ||
      existingVendor.pan !== newVendor.pan ||
      existingVendor.gstType !== newVendor.gstType ||
      existingVendor.gstNo !== newVendor.gstNo ||
      existingVendor.gstDetails !== newVendor.gstDetails
      // Note: address, country, state, pincode are excluded as they are handled separately
    );
  }

  // Keep original method for backward compatibility if needed
  // private hasChanges(existingVendor: UserEntity, newVendor: UserEntity): boolean {
  //     return (
  //         existingVendor.slNo !== newVendor.slNo ||
  //         existingVendor.name !== newVendor.name ||
  //         existingVendor.alias !== newVendor.alias ||
  //         existingVendor.active !== newVendor.active ||
  //         existingVendor.parent !== newVendor.parent ||
  //         existingVendor.address !== newVendor.address ||
  //         existingVendor.country !== newVendor.country ||
  //         existingVendor.state !== newVendor.state ||
  //         existingVendor.pincode !== newVendor.pincode ||
  //         existingVendor.contactPerson !== newVendor.contactPerson ||
  //         existingVendor.mobile !== newVendor.mobile ||
  //         existingVendor.email !== newVendor.email ||
  //         existingVendor.pan !== newVendor.pan ||
  //         existingVendor.gstType !== newVendor.gstType ||
  //         existingVendor.gstNo !== newVendor.gstNo ||
  //         existingVendor.gstDetails !== newVendor.gstDetails
  //     );
  // }

  async findAll(
    page?: number,
    limit?: number,
    search?: string,
    status?: string,
  ): Promise<
    | UserEntity[]
    | {
        data: UserEntity[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }
  > {
    // If no pagination params, return all vendors (backward compatible)
    if (!page && !limit) {
      return this.vendorRepository.find({
        where: { role: UserRole.Vendor, isDeleted: false },
      });
    }

    // Pagination logic
    const pageNumber = page || 1;
    const limitNumber = limit || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const queryBuilder = this.vendorRepository
      .createQueryBuilder('vendor')
      .where('vendor.role = :role', { role: UserRole.Vendor })
      .andWhere('vendor.isDeleted = :isDeleted', { isDeleted: false });

    // Apply status filter
    if (status && status !== 'all') {
      queryBuilder.andWhere('vendor.status = :status', { status });
    }

    // Apply search filter
    if (search && search.trim() !== '') {
      queryBuilder.andWhere(
        '(LOWER(vendor.name) LIKE LOWER(:search) OR LOWER(vendor.email) LIKE LOWER(:search) OR LOWER(vendor.mobile) LIKE LOWER(:search) OR LOWER(vendor.address) LIKE LOWER(:search))',
        { search: `%${search}%` },
      );
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Get paginated data
    const data = await queryBuilder
      .skip(skip)
      .take(limitNumber)
      .orderBy('vendor.name', 'ASC')
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

  async findById(id: string): Promise<UserEntity | null> {
    return this.vendorRepository.findOne({ where: { id } });
  }

  async create(createVendorDto: VendorDto): Promise<UserEntity> {
    try {
      // Set role to Vendor if not provided
      const vendorData = {
        ...createVendorDto,
        role: UserRole.Vendor,
        status:
          createVendorDto.active === 'Yes'
            ? UserStatus.Active
            : UserStatus.Inactive,
      };

      const newVendor = this.vendorRepository.create(vendorData);
      const savedVendor = await this.vendorRepository.save(newVendor);

      // Store vendor address if address data is provided
      if (createVendorDto.address || createVendorDto.mobile) {
        await this.storeVendorAddress(savedVendor, createVendorDto);
      }

      return savedVendor;
    } catch (error) {
      throw new InternalServerErrorException('Failed to create vendor');
    }
  }

  async update(id: string, updateVendorDto: VendorDto): Promise<UserEntity> {
    try {
      const vendor = await this.vendorRepository.findOne({ where: { id } });
      if (!vendor) {
        throw new NotFoundException(`Vendor with ID ${id} not found`);
      }

      // Update status if active field is provided
      if (updateVendorDto.active !== undefined) {
        vendor.status =
          updateVendorDto.active === 'Yes'
            ? UserStatus.Active
            : UserStatus.Inactive;
      }

      // Update the vendor with new values
      Object.assign(vendor, updateVendorDto);
      const updatedVendor = await this.vendorRepository.save(vendor);

      // Update vendor address if address data is provided
      if (updateVendorDto.address || updateVendorDto.mobile) {
        await this.storeVendorAddress(updatedVendor, updateVendorDto);
      }

      return updatedVendor;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update vendor');
    }
  }

  // Get status counts for tabs
  async getStatusCounts(): Promise<{
    all: number;
    active: number;
    inactive: number;
  }> {
    const all = await this.vendorRepository.count({
      where: { role: UserRole.Vendor, isDeleted: false },
    });

    const active = await this.vendorRepository.count({
      where: {
        role: UserRole.Vendor,
        isDeleted: false,
        status: UserStatus.Active,
      },
    });

    const inactive = await this.vendorRepository.count({
      where: {
        role: UserRole.Vendor,
        isDeleted: false,
        status: UserStatus.Inactive,
      },
    });

    return { all, active, inactive };
  }
  async delete(id: string): Promise<void> {
    const result = await this.vendorRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Vendor with ID ${id} not found`);
    }
  }

  async deleteMultiple(ids: string[]): Promise<{
    message: string;
    deletedCount: number;
    notFoundIds?: string[];
  }> {
    if (!ids || ids.length === 0) {
      throw new BadRequestException('No IDs provided for deletion');
    }

    // Find all existing vendors in one query
    const existingVendors = await this.vendorRepository.findByIds(ids);
    const existingIds = existingVendors.map((vendor) => vendor.id);
    const notFoundIds = ids.filter((id) => !existingIds.includes(id));

    // Delete all existing vendors in batch operation
    if (existingVendors.length > 0) {
      await this.vendorRepository.remove(existingVendors);
    }

    // If some IDs were not found, return partial success information
    if (notFoundIds.length > 0) {
      return {
        message: `${existingVendors.length} vendors deleted successfully. ${notFoundIds.length} vendors not found.`,
        deletedCount: existingVendors.length,
        notFoundIds,
      };
    }

    return {
      message: 'All vendors deleted successfully',
      deletedCount: existingVendors.length,
    };
  }

  // Cron Job Set - Optimized for high performance
  async CronFetchAndStoreVendors(): Promise<void> {
    this.logger.log('Vendor cron sync executed at:', new Date().toISOString());
    const REQUEST_TIMEOUT = 120000; // 2 minutes - allow full response
    const BATCH_SIZE = 500; // Process in batches for better performance

    // Check if "Auto Sync" is enabled
    const syncSetting = await this.syncControlSettingsRepository.findOne({
      where: { moduleName: 'Vendors' },
    });

    if (!syncSetting?.isAutoSyncEnabled) {
      this.logger.warn('Auto Sync for Vendor is disabled. Skipping cron job.');
      return; // Don't throw, just skip silently for cron jobs
    }

    try {
      // Try to connect to Tally with timeout
      let response;
      try {
        // Use POST so Tally returns full response in one go
        response = await axios.post(process.env.TALLY_URL as string, Vendors, {
          headers: { 'Content-Type': 'text/xml' },
          timeout: REQUEST_TIMEOUT,
          responseType: 'text',
          maxContentLength: 50 * 1024 * 1024,
          maxBodyLength: 50 * 1024 * 1024,
        });
      } catch (axiosError: any) {
        // If Tally is not available, log and return (don't throw for cron jobs)
        this.logger.error(
          'Vendor cron sync failed - Tally connection error:',
          axiosError?.code || axiosError?.message,
        );
        return; // Silently fail for cron jobs
      }

      // Check for specific XML error patterns in the response
      if (response.data.includes('<LINEERROR>')) {
        this.logger.error('Vendor cron sync failed - Tally login required');
        return; // Silently fail for cron jobs
      }

      const vendors = await this.parseXmlToVendors(response.data);

      // Fetch all existing vendors for comparison (excluding address fields)
      const existingVendors = await this.vendorRepository.find({
        where: { role: UserRole.Vendor, isDeleted: false },
      });

      // Create maps for quick lookup
      const tallyVendorSet = new Set(
        vendors.filter((v) => v.name).map((v) => v.name),
      );
      const existingVendorMap = new Map(
        existingVendors.map((vendor) => [vendor.name, vendor]),
      );

      // Step 1: Delete vendors that exist in DB but not in Tally
      const vendorsToDelete = existingVendors.filter(
        (vendor) => vendor.name && !tallyVendorSet.has(vendor.name),
      );

      if (vendorsToDelete.length > 0) {
        this.logger.log(
          `Cron: Deleting ${vendorsToDelete.length} vendors not in Tally...`,
        );
        // Delete addresses first (cascade should handle this, but being explicit)
        const deleteBatchSize = 500;
        for (let i = 0; i < vendorsToDelete.length; i += deleteBatchSize) {
          const deleteBatch = vendorsToDelete.slice(i, i + deleteBatchSize);
          for (const vendor of deleteBatch) {
            // Delete associated addresses
            try {
              const address = await this.addressesService.findByUserId(
                vendor.id,
              );
              if (address) {
                await this.addressesService.delete(address.id);
              }
            } catch (error) {
              // If address doesn't exist or already deleted, continue
              this.logger.warn(
                `Address not found for vendor ${vendor.id}, continuing...`,
              );
            }
          }
          // Delete vendors
          await this.vendorRepository.remove(deleteBatch);
        }
      }

      // Step 2: Process inserts and updates
      const vendorsToSave: UserEntity[] = [];
      const vendorsToUpdate: UserEntity[] = [];
      const addressesToProcess: Array<{ vendor: UserEntity; vendorDto: any }> =
        [];

      for (const vendor of vendors) {
        if (!vendor.name) continue;

        const existingVendor = existingVendorMap.get(vendor.name);
        if (existingVendor) {
          // Compare all fields except address-related (address, country, state, pincode)
          if (this.hasEssentialChanges(existingVendor, vendor)) {
            vendorsToUpdate.push({ ...existingVendor, ...vendor });
            addressesToProcess.push({
              vendor: existingVendor,
              vendorDto: vendor,
            });
          }
        } else {
          vendorsToSave.push(vendor);
        }
      }

      // Bulk save new vendors
      if (vendorsToSave.length > 0) {
        const savedVendors = await this.vendorRepository.save(vendorsToSave);
        // Add saved vendors to address processing
        savedVendors.forEach((savedVendor) => {
          const originalVendor = vendorsToSave.find(
            (v) => v.name === savedVendor.name,
          );
          if (originalVendor) {
            addressesToProcess.push({
              vendor: savedVendor,
              vendorDto: originalVendor,
            });
          }
        });
      }

      // Bulk update existing vendors
      if (vendorsToUpdate.length > 0) {
        await this.vendorRepository.save(vendorsToUpdate);
      }

      // Process addresses in batches
      if (addressesToProcess.length > 0) {
        const addressBatches = [];
        for (let i = 0; i < addressesToProcess.length; i += BATCH_SIZE) {
          addressBatches.push(addressesToProcess.slice(i, i + BATCH_SIZE));
        }

        for (const batch of addressBatches) {
          await Promise.all(
            batch.map(({ vendor, vendorDto }) =>
              this.storeVendorAddress(vendor, vendorDto),
            ),
          );
        }
      }

      this.logger.log('Vendor cron sync completed successfully');
      await this.syncLogRepository.save({
        sync_type: 'Vendors',
        status: SyncLogStatus.SUCCESS,
      });
    } catch (error: any) {
      // Log error but don't throw for cron jobs (to prevent cron job failure)
      this.logger.error(
        'Vendor cron sync failed:',
        error?.message || 'Unknown error',
      );
      await this.syncLogRepository.save({
        sync_type: 'Vendors',
        status: SyncLogStatus.FAIL,
      });
    }
  }
}
