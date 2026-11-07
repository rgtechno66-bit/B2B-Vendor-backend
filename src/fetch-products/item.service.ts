// product.service.ts
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import axios from 'axios';
import { parseStringPromise } from 'xml2js'; // Library for parsing XML to JSON
import { ItemEntity } from './item.entity';
import { ItemDto } from './item.dto';
import { FileStorageService } from '../service/file-storage.service';
import { products } from '../tally/products';
import { Cron } from '@nestjs/schedule';
import { SyncLogEntity, SyncLogStatus } from './../sync-log/sync-log.entity';
import { SyncControlSettings } from './../settings/setting.entity';
import { StockEntity } from './../stock/stock.entity';

export interface ProductSyncStatus {
  status: 'idle' | 'processing' | 'completed' | 'error';
  message: string;
  startTime?: Date;
  endTime?: Date;
  error?: string;
  totalRecords?: number;
  processedRecords?: number;
  insertsCount?: number;
  categoryUpdatesCount?: number;
  duration?: number;
}

@Injectable()
export class ItemService {
  private readonly logger = new Logger(ItemService.name);
  private productSyncStatus: ProductSyncStatus = {
    status: 'idle',
    message: 'No sync in progress',
  };

  constructor(
    @InjectRepository(ItemEntity)
    private itemRepository: Repository<ItemEntity>,
    private fileStorageService: FileStorageService,

    @InjectRepository(SyncLogEntity)
    private readonly syncLogRepository: Repository<SyncLogEntity>,

    @InjectRepository(SyncControlSettings)
    private readonly syncControlSettingsRepository: Repository<SyncControlSettings>,

    @InjectRepository(StockEntity)
    private readonly stockRepository: Repository<StockEntity>,
  ) {}

  // For telly --------------------------------------------------------------------------------------------

  /**
   * Generate next sequential 8-digit masterID starting from 10000001
   */
  private async generateNextMasterID(): Promise<string> {
    // Find the item with the highest masterID
    // For PostgreSQL, use CAST to convert string to integer for proper numeric ordering
    const lastItem = await this.itemRepository
      .createQueryBuilder('item')
      .where('item.masterID IS NOT NULL')
      .orderBy('CAST(item.masterID AS INTEGER)', 'DESC')
      .getOne();

    if (!lastItem || !lastItem.masterID) {
      // If no items exist, start from 10000001
      return '10000001';
    }

    // Extract the numeric part and increment
    const lastNumber = parseInt(lastItem.masterID, 10);
    const nextNumber = lastNumber + 1;

    // Ensure it's 8 digits (pad with zeros if needed, though it shouldn't be needed)
    return nextNumber.toString().padStart(8, '0');
  }

  async create(createItemDto: ItemDto): Promise<ItemEntity> {
    try {
      const newItem = this.itemRepository.create(createItemDto);

      // Auto-generate masterID if not provided
      if (!newItem.masterID) {
        newItem.masterID = await this.generateNextMasterID();
      }

      return await this.itemRepository.save(newItem);
    } catch (error) {
      throw new InternalServerErrorException('Failed to create item');
    }
  }

  async update(id: string, updateItemDto: ItemDto): Promise<ItemEntity> {
    try {
      const item = await this.itemRepository.findOne({ where: { id } });
      if (!item) {
        throw new NotFoundException(`Item with ID ${id} not found`);
      }

      // Update the item with new values
      Object.assign(item, updateItemDto);
      return await this.itemRepository.save(item);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update item');
    }
  }

  async updateByMasterID(
    masterID: string,
    updateItemDto: ItemDto,
  ): Promise<ItemEntity> {
    try {
      const item = await this.itemRepository.findOne({ where: { masterID } });
      if (!item) {
        throw new NotFoundException(`Item with masterID ${masterID} not found`);
      }

      // Update the item with new values
      Object.assign(item, updateItemDto);
      return await this.itemRepository.save(item);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to update item by masterID',
      );
    }
  }

  /**
   * Set product totalSalesAmount (replaces previous value).
   * Match by masterID first, then itemName.
   */
  async updateTotalSalesAmount(dto: {
    masterID?: string;
    itemName?: string;
    totalSalesAmount: number;
  }): Promise<ItemEntity> {
    const masterID = dto.masterID?.trim();
    const itemName = dto.itemName?.trim();
    const totalSalesAmount = Number(dto.totalSalesAmount);

    if (!masterID && !itemName) {
      throw new BadRequestException(
        'masterID or itemName is required to update totalSalesAmount',
      );
    }
    if (Number.isNaN(totalSalesAmount) || totalSalesAmount < 0) {
      throw new BadRequestException(
        'totalSalesAmount must be a valid non-negative number',
      );
    }

    try {
      let item: ItemEntity | null = null;

      if (masterID) {
        item = await this.itemRepository.findOne({ where: { masterID } });
      }
      if (!item && itemName) {
        item = await this.itemRepository
          .createQueryBuilder('item')
          .where('LOWER(TRIM(item.itemName)) = LOWER(:itemName)', { itemName })
          .getOne();
      }

      if (!item) {
        throw new NotFoundException(
          `Product not found${masterID ? ` for masterID ${masterID}` : ''}${
            itemName ? ` / itemName ${itemName}` : ''
          }`,
        );
      }

      item.totalSalesAmount = totalSalesAmount;
      return await this.itemRepository.save(item);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to update totalSalesAmount',
      );
    }
  }

  /**
   * Bulk update totalSalesAmount for multiple products (~2000+ safe).
   * Body: { data: [ { masterID, itemName, totalSalesAmount }, ... ] }
   * Optimized: 1–2 bulk fetches + batch save (not per-row DB roundtrips).
   */
  async updateTotalSalesAmountBulk(
    items: Array<{
      masterID?: string;
      itemName?: string;
      totalSalesAmount: number;
    }>,
  ): Promise<{
    updated: Array<{
      id: string;
      masterID?: string;
      itemName: string;
      totalSalesAmount: number;
    }>;
    failed: Array<{
      masterID?: string;
      itemName?: string;
      totalSalesAmount?: number;
      error: string;
    }>;
  }> {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('data must be a non-empty array');
    }

    const failed: Array<{
      masterID?: string;
      itemName?: string;
      totalSalesAmount?: number;
      error: string;
    }> = [];

    // Normalize + validate rows first
    const rows = items.map((row, index) => {
      const masterID = row.masterID?.trim() || undefined;
      const itemName = row.itemName?.trim() || undefined;
      const totalSalesAmount = Number(
        row.totalSalesAmount ?? (row as any).salesAmount,
      );

      if (!masterID && !itemName) {
        failed.push({
          masterID: row.masterID,
          itemName: row.itemName,
          totalSalesAmount: row.totalSalesAmount,
          error: `Row ${index + 1}: masterID or itemName is required`,
        });
        return null;
      }
      if (Number.isNaN(totalSalesAmount) || totalSalesAmount < 0) {
        failed.push({
          masterID: row.masterID,
          itemName: row.itemName,
          totalSalesAmount: row.totalSalesAmount,
          error: `Row ${index + 1}: totalSalesAmount must be a valid non-negative number`,
        });
        return null;
      }

      return { masterID, itemName, totalSalesAmount };
    });

    const validRows = rows.filter(
      (r): r is NonNullable<typeof r> => r !== null,
    );

    if (validRows.length === 0) {
      return { updated: [], failed };
    }

    const masterIDs = [
      ...new Set(validRows.map((r) => r.masterID).filter(Boolean)),
    ] as string[];
    const itemNames = [
      ...new Set(validRows.map((r) => r.itemName).filter(Boolean)),
    ] as string[];

    // Bulk fetch matching products (chunk IN clauses to avoid huge queries)
    const CHUNK = 500;
    const dbItems: ItemEntity[] = [];

    for (let i = 0; i < masterIDs.length; i += CHUNK) {
      const chunk = masterIDs.slice(i, i + CHUNK);
      const found = await this.itemRepository
        .createQueryBuilder('item')
        .where('item.masterID IN (:...chunk)', { chunk })
        .getMany();
      dbItems.push(...found);
    }

    const foundIds = new Set(dbItems.map((i) => i.id));
    for (let i = 0; i < itemNames.length; i += CHUNK) {
      const chunk = itemNames.slice(i, i + CHUNK);
      const found = await this.itemRepository
        .createQueryBuilder('item')
        .where('item.itemName IN (:...chunk)', { chunk })
        .getMany();
      for (const item of found) {
        if (!foundIds.has(item.id)) {
          foundIds.add(item.id);
          dbItems.push(item);
        }
      }
    }

    const byMasterId = new Map<string, ItemEntity>();
    const byItemName = new Map<string, ItemEntity>();
    for (const item of dbItems) {
      if (item.masterID) byMasterId.set(item.masterID.trim(), item);
      if (item.itemName)
        byItemName.set(item.itemName.trim().toLowerCase(), item);
    }

    const toSave: ItemEntity[] = [];
    const seenIds = new Set<string>();

    for (const row of validRows) {
      const item =
        (row.masterID && byMasterId.get(row.masterID)) ||
        (row.itemName && byItemName.get(row.itemName.toLowerCase())) ||
        null;

      if (!item) {
        failed.push({
          masterID: row.masterID,
          itemName: row.itemName,
          totalSalesAmount: row.totalSalesAmount,
          error: 'Product not found',
        });
        continue;
      }

      // Same product appearing twice in payload: last amount wins
      item.totalSalesAmount = row.totalSalesAmount;
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        toSave.push(item);
      }
    }

    // Batch save in chunks
    const SAVE_CHUNK = 200;
    const updated: Array<{
      id: string;
      masterID?: string;
      itemName: string;
      totalSalesAmount: number;
    }> = [];

    for (let i = 0; i < toSave.length; i += SAVE_CHUNK) {
      const chunk = toSave.slice(i, i + SAVE_CHUNK);
      const saved = await this.itemRepository.save(chunk);
      for (const item of saved) {
        updated.push({
          id: item.id,
          masterID: item.masterID,
          itemName: item.itemName,
          totalSalesAmount: Number(item.totalSalesAmount) || 0,
        });
      }
    }

    this.logger.log(
      `updateTotalSalesAmountBulk: input=${items.length}, updated=${updated.length}, failed=${failed.length}`,
    );

    return { updated, failed };
  }

  /**
   * Assign masterID to all existing products that don't have one
   */
  async assignMasterIDToExistingProducts(): Promise<{
    message: string;
    totalAssigned: number;
  }> {
    try {
      // Find all items without masterID, sorted in ascending order by itemName
      const itemsWithoutMasterID = await this.itemRepository.find({
        where: { masterID: IsNull() },
        order: { itemName: 'ASC' }, // Assign in ascending alphabetical order
      });

      if (itemsWithoutMasterID.length === 0) {
        return {
          message: 'All products already have masterID assigned',
          totalAssigned: 0,
        };
      }

      // Get the highest existing masterID to continue from there
      const lastItem = await this.itemRepository
        .createQueryBuilder('item')
        .where('item.masterID IS NOT NULL')
        .orderBy('CAST(item.masterID AS INTEGER)', 'DESC')
        .getOne();

      let nextMasterID =
        lastItem && lastItem.masterID
          ? parseInt(lastItem.masterID, 10) + 1
          : 10000001;

      // Assign masterID to each item
      const BATCH_SIZE = 500;
      let totalAssigned = 0;

      for (let i = 0; i < itemsWithoutMasterID.length; i += BATCH_SIZE) {
        const batch = itemsWithoutMasterID.slice(i, i + BATCH_SIZE);

        for (const item of batch) {
          item.masterID = nextMasterID.toString().padStart(8, '0');
          nextMasterID++;
        }

        await this.itemRepository.save(batch);
        totalAssigned += batch.length;

        console.log(
          `Assigned masterID to batch ${i / BATCH_SIZE + 1} of ${Math.ceil(itemsWithoutMasterID.length / BATCH_SIZE)} (${batch.length} items)`,
        );
      }

      return {
        message: `Successfully assigned masterID to ${totalAssigned} products`,
        totalAssigned,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to assign masterID to existing products',
      );
    }
  }

  //-------------------------------------------------------------------------------------------------------------------

  getProductSyncStatus(): ProductSyncStatus {
    return { ...this.productSyncStatus };
  }

  async fetchAndStoreItems(): Promise<void> {
    const REQUEST_TIMEOUT = 120000; // 2 minutes timeout
    const BATCH_SIZE = 500;

    const productSyncSetting = await this.syncControlSettingsRepository.findOne(
      {
        where: { moduleName: 'Products' },
      },
    );

    if (!productSyncSetting || !productSyncSetting.isManualSyncEnabled) {
      throw new BadRequestException('Manual Sync for Products is disabled.');
    }

    this.productSyncStatus = {
      status: 'processing',
      message: 'Starting product sync...',
      startTime: new Date(),
    };

    try {
      // First get all existing items from database
      this.productSyncStatus.message = 'Loading existing items...';
      const existingItems = await this.itemRepository.find();
      const existingItemMap = new Map(
        existingItems.map((item) => [item.itemName, item]),
      );

      this.productSyncStatus.message = 'Fetching data from Tally...';
      const response = await axios.post(
        process.env.TALLY_URL as string,
        products,
        {
          headers: {
            'Content-Type': 'text/xml',
          },
          timeout: REQUEST_TIMEOUT,
          responseType: 'text',
          maxContentLength: 50 * 1024 * 1024,
          maxBodyLength: 50 * 1024 * 1024,
        },
      );

      this.productSyncStatus.message = 'Parsing response...';
      const items = await this.parseXmlToItems(response.data);
      this.productSyncStatus.totalRecords = items.length;

      const itemsToInsert: ItemEntity[] = [];
      for (const item of items) {
        if (!existingItemMap.has(item.itemName)) {
          itemsToInsert.push(item);
        }
      }

      const itemsToUpdateCategory = this.collectCategoryUpdates(
        items,
        existingItemMap,
      );

      if (itemsToInsert.length === 0 && itemsToUpdateCategory.length === 0) {
        this.productSyncStatus = {
          status: 'completed',
          message: 'Data already up to date - No new items to sync',
          startTime: this.productSyncStatus.startTime,
          endTime: new Date(),
          insertsCount: 0,
          categoryUpdatesCount: 0,
          duration: this.productSyncStatus.startTime
            ? Date.now() - this.productSyncStatus.startTime.getTime()
            : undefined,
        };
        throw new BadRequestException(
          'Data already up to date - No new items to sync',
        );
      }

      this.productSyncStatus.insertsCount = 0;
      this.productSyncStatus.categoryUpdatesCount = 0;
      this.productSyncStatus.processedRecords = 0;

      if (itemsToUpdateCategory.length > 0) {
        this.productSyncStatus.message = `Updating category for ${itemsToUpdateCategory.length} products...`;
        const updateBatches = Math.ceil(
          itemsToUpdateCategory.length / BATCH_SIZE,
        );
        for (let i = 0; i < itemsToUpdateCategory.length; i += BATCH_SIZE) {
          const batch = itemsToUpdateCategory.slice(i, i + BATCH_SIZE);
          await this.itemRepository.save(batch);
          this.productSyncStatus.categoryUpdatesCount = Math.min(
            i + BATCH_SIZE,
            itemsToUpdateCategory.length,
          );
          this.productSyncStatus.message = `Updated category batch ${i / BATCH_SIZE + 1} of ${updateBatches} (${batch.length} items)`;
          this.logger.log(this.productSyncStatus.message);
        }
      }

      if (itemsToInsert.length > 0) {
        this.productSyncStatus.message = `Inserting ${itemsToInsert.length} new items...`;
      }

      const lastItem = await this.itemRepository
        .createQueryBuilder('item')
        .where('item.masterID IS NOT NULL')
        .orderBy('CAST(item.masterID AS INTEGER)', 'DESC')
        .getOne();

      let nextMasterID =
        lastItem && lastItem.masterID
          ? parseInt(lastItem.masterID, 10) + 1
          : 10000001;

      for (const item of itemsToInsert) {
        if (!item.masterID) {
          item.masterID = nextMasterID.toString().padStart(8, '0');
          nextMasterID++;
        }
      }

      if (itemsToInsert.length > 0) {
        const totalBatches = Math.ceil(itemsToInsert.length / BATCH_SIZE);
        for (let i = 0; i < itemsToInsert.length; i += BATCH_SIZE) {
          const batch = itemsToInsert.slice(i, i + BATCH_SIZE);
          await this.itemRepository.save(batch);
          this.productSyncStatus.processedRecords = Math.min(
            i + BATCH_SIZE,
            itemsToInsert.length,
          );
          this.productSyncStatus.insertsCount =
            this.productSyncStatus.processedRecords;
          this.productSyncStatus.message = `Inserted batch ${i / BATCH_SIZE + 1} of ${totalBatches} (${batch.length} items)`;
          this.logger.log(this.productSyncStatus.message);
        }
      }

      const endTime = new Date();
      const completionParts: string[] = [];
      if (itemsToInsert.length > 0) {
        completionParts.push(`${itemsToInsert.length} new items inserted`);
      }
      if (itemsToUpdateCategory.length > 0) {
        completionParts.push(
          `${itemsToUpdateCategory.length} products updated to new category`,
        );
      }
      this.productSyncStatus = {
        status: 'completed',
        message: `Product sync completed. ${completionParts.join(', ')}.`,
        startTime: this.productSyncStatus.startTime,
        endTime,
        totalRecords: items.length,
        processedRecords: itemsToInsert.length + itemsToUpdateCategory.length,
        insertsCount: itemsToInsert.length,
        categoryUpdatesCount: itemsToUpdateCategory.length,
        duration: this.productSyncStatus.startTime
          ? endTime.getTime() - this.productSyncStatus.startTime.getTime()
          : undefined,
      };
      this.logger.log(this.productSyncStatus.message);
    } catch (error: any) {
      const endTime = new Date();
      const errorMessage =
        error?.message || 'Make Sure Tally is Open and logged In';
      this.productSyncStatus = {
        status: 'error',
        message: 'Product sync failed',
        error: errorMessage,
        startTime: this.productSyncStatus.startTime,
        endTime,
        duration: this.productSyncStatus.startTime
          ? endTime.getTime() - this.productSyncStatus.startTime.getTime()
          : undefined,
      };
      this.logger.error('Product sync failed:', errorMessage);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(errorMessage);
    }
  }

  async parseXmlToItems(xml: string): Promise<ItemEntity[]> {
    const parsedResult = await parseStringPromise(xml);
    const stockItems = parsedResult.ENVELOPE.STOCKITEM || [];

    return stockItems.map((item: any) => {
      const itemDto = new ItemDto();

      itemDto.itemName = this.cleanString(item.ITEMNAME?.[0]);
      itemDto.alias = this.cleanString(item.ALIAS?.[0]);
      itemDto.partNo = this.cleanString(item.PARTNO?.[0]);
      itemDto.description = this.cleanString(item.DESCRIPTION?.[0]);
      itemDto.group = this.cleanString(item.GROUP?.[0]);
      itemDto.subGroup1 = this.cleanString(item.SUBGROUP1?.[0]);
      itemDto.subGroup2 = this.cleanString(item.SUBGROUP2?.[0]);
      itemDto.stdPkg = parseInt(item.STDPKG?.[0]) || 0;
      itemDto.stdWeight = parseInt(item.STDWEIGHT?.[0]) || 0;
      itemDto.baseUnit = this.cleanString(item.BASEUNIT?.[0]);
      itemDto.alternateUnit = this.cleanString(item.ALTERNATEUNIT?.[0]);
      itemDto.conversion = this.cleanString(item.CONVERSION?.[0]);
      itemDto.denominator = parseInt(item.DENOMINATOR?.[0], 10) || 1;
      itemDto.sellingPriceDate = this.cleanString(item.SELLINGPRICEDATE?.[0]);
      itemDto.sellingPrice = parseFloat(item.SELLINGPRICE?.[0]) || 0;
      itemDto.gstApplicable = this.cleanString(item.GSTAPPLICABLE?.[0]);
      itemDto.gstApplicableDate = this.cleanString(item.GSTAPPLICABLEDATE?.[0]);
      itemDto.taxability = this.cleanString(item.TAXABILITY?.[0]);
      itemDto.gstRate = parseFloat(item.GSTRATE?.[0]) || 0;

      // Convert DTO to Entity
      return this.itemRepository.create(itemDto);
    });
  }

  private cleanString(value: string | undefined): string {
    return value?.replace(/\x04/g, '').trim() || '';
  }

  /** Only category / subcategory moved in Tally */
  private hasCategoryChanges(
    existingProduct: ItemEntity,
    tallyItem: ItemEntity,
  ): boolean {
    return (
      existingProduct.subGroup1 !== tallyItem.subGroup1 ||
      existingProduct.subGroup2 !== tallyItem.subGroup2
    );
  }

  private collectCategoryUpdates(
    tallyItems: ItemEntity[],
    existingItemMap: Map<string, ItemEntity>,
  ): ItemEntity[] {
    const itemsToUpdate: ItemEntity[] = [];

    for (const tallyItem of tallyItems) {
      if (!tallyItem.itemName) continue;

      const existing = existingItemMap.get(tallyItem.itemName);
      if (!existing || !this.hasCategoryChanges(existing, tallyItem)) continue;

      existing.subGroup1 = tallyItem.subGroup1;
      existing.subGroup2 = tallyItem.subGroup2;
      itemsToUpdate.push(existing);
    }

    return itemsToUpdate;
  }

  // Function to check if the existing product has changes
  private hasChanges(
    existingProduct: ItemEntity,
    newItem: ItemEntity,
  ): boolean {
    return (
      existingProduct.itemName !== newItem.itemName ||
      existingProduct.partNo !== newItem.partNo ||
      existingProduct.description !== newItem.description ||
      existingProduct.group !== newItem.group ||
      existingProduct.subGroup1 !== newItem.subGroup1 ||
      existingProduct.subGroup2 !== newItem.subGroup2 ||
      existingProduct.stdPkg !== newItem.stdPkg ||
      existingProduct.stdWeight !== newItem.stdWeight ||
      existingProduct.baseUnit !== newItem.baseUnit ||
      existingProduct.alternateUnit !== newItem.alternateUnit ||
      existingProduct.conversion !== newItem.conversion ||
      existingProduct.denominator !== newItem.denominator ||
      existingProduct.sellingPriceDate !== newItem.sellingPriceDate || // For dates, compare using getTime()
      existingProduct.sellingPrice !== newItem.sellingPrice ||
      existingProduct.gstApplicable !== newItem.gstApplicable ||
      existingProduct.gstApplicableDate !== newItem.gstApplicableDate ||
      existingProduct.taxability !== newItem.taxability ||
      existingProduct.gstRate !== newItem.gstRate
    );
  }

  // Updated findAll with optional pagination, search, and filters
  private applyItemSort(
    queryBuilder: ReturnType<Repository<ItemEntity>['createQueryBuilder']>,
    sortBy?: string,
  ) {
    switch (sortBy) {
      case 'priceDesc':
        queryBuilder.orderBy('item.sellingPrice', 'DESC');
        break;
      case 'priceAsc':
        queryBuilder.orderBy('item.sellingPrice', 'ASC');
        break;
      case 'newest':
        queryBuilder.orderBy('item.created_at', 'DESC');
        break;
      case 'AtoZ':
      default:
        queryBuilder.orderBy('item.itemName', 'ASC');
        break;
    }
  }

  async findAll(
    page?: number,
    limit?: number,
    search?: string,
    subGroup1?: string[],
    subGroup2?: string[],
    sortBy?: string,
  ): Promise<
    | ItemEntity[]
    | {
        data: ItemEntity[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }
  > {
    // If no pagination params provided, return all items (backward compatible)
    if (!page && !limit) {
      const queryBuilder = this.itemRepository.createQueryBuilder('item');

      // Apply filters if provided
      if (subGroup1 && subGroup1.length > 0) {
        queryBuilder.andWhere('item.subGroup1 IN (:...subGroup1)', {
          subGroup1,
        });
      }

      if (subGroup2 && subGroup2.length > 0) {
        queryBuilder.andWhere('item.subGroup2 IN (:...subGroup2)', {
          subGroup2,
        });
      }

      if (search && search.trim() !== '') {
        queryBuilder.andWhere(
          '(LOWER(item.itemName) LIKE LOWER(:search) OR LOWER(item.partNo) LIKE LOWER(:search) OR LOWER(item.group) LIKE LOWER(:search) OR LOWER(item.subGroup1) LIKE LOWER(:search) OR LOWER(item.subGroup2) LIKE LOWER(:search))',
          { search: `%${search}%` },
        );
      }

      this.applyItemSort(queryBuilder, sortBy);

      const items = await queryBuilder.getMany();

      // Optimize: Fetch all stock data in one query instead of N queries
      const itemNames = items.map((item) => item.itemName);
      const stockDataMap = new Map<string, number>();

      if (itemNames.length > 0) {
        const allStockData = await this.stockRepository
          .createQueryBuilder('stock')
          .where('stock.itemName IN (:...itemNames)', { itemNames })
          .getMany();

        // Create a map of itemName -> stockQuantity
        allStockData.forEach((stock) => {
          if (stock.quantity !== undefined) {
            const quantity = parseFloat(stock.quantity);
            if (!isNaN(quantity) && quantity >= 0) {
              stockDataMap.set(stock.itemName, Math.round(quantity / 2));
            }
          }
        });
      }

      // Map stock quantities to items
      const itemsWithStock = items.map((item) => ({
        ...item,
        stockQuantity: stockDataMap.get(item.itemName) || 0,
      }));

      return itemsWithStock;
    }

    // Pagination logic
    const pageNumber = page || 1;
    const limitNumber = limit || 10;
    const skip = (pageNumber - 1) * limitNumber;

    // Build query with optional search and filters
    const queryBuilder = this.itemRepository.createQueryBuilder('item');

    // Apply subGroup1 filter
    if (subGroup1 && subGroup1.length > 0) {
      queryBuilder.andWhere('item.subGroup1 IN (:...subGroup1)', { subGroup1 });
    }

    // Apply subGroup2 filter
    if (subGroup2 && subGroup2.length > 0) {
      queryBuilder.andWhere('item.subGroup2 IN (:...subGroup2)', { subGroup2 });
    }

    // Apply search filter
    if (search && search.trim() !== '') {
      queryBuilder.andWhere(
        '(LOWER(item.itemName) LIKE LOWER(:search) OR LOWER(item.partNo) LIKE LOWER(:search) OR LOWER(item.group) LIKE LOWER(:search) OR LOWER(item.subGroup1) LIKE LOWER(:search) OR LOWER(item.subGroup2) LIKE LOWER(:search))',
        { search: `%${search}%` },
      );
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Get paginated data
    this.applyItemSort(queryBuilder, sortBy);

    const items = await queryBuilder
      .skip(skip)
      .take(limitNumber)
      .getMany();

    // Optimize: Fetch all stock data in one query instead of N queries
    const itemNames = items.map((item) => item.itemName);
    const stockDataMap = new Map<string, number>();

    if (itemNames.length > 0) {
      const allStockData = await this.stockRepository
        .createQueryBuilder('stock')
        .where('stock.itemName IN (:...itemNames)', { itemNames })
        .getMany();

      // Create a map of itemName -> stockQuantity
      allStockData.forEach((stock) => {
        if (stock.quantity !== undefined) {
          const quantity = parseFloat(stock.quantity);
          if (!isNaN(quantity) && quantity >= 0) {
            stockDataMap.set(stock.itemName, Math.round(quantity / 2));
          }
        }
      });
    }

    // Map stock quantities to items
    const data = items.map((item) => ({
      ...item,
      stockQuantity: stockDataMap.get(item.itemName) || 0,
    }));

    const totalPages = Math.ceil(total / limitNumber);

    return {
      data,
      total,
      page: pageNumber,
      limit: limitNumber,
      totalPages,
    };
  }

  private isPlaceholderProductImage(url?: string | null): boolean {
    if (!url || !url.trim()) return true;

    const normalized = url.trim().toLowerCase();
    const placeholders = [
      '1179009439',
      'ftcdn.net/jpg/11/79/00/94',
      'unsplash.com/premium_photo-1664474619075',
      'no-image',
      'noimage',
      'placeholder',
      'dummy-image',
      '/assets/default/',
    ];

    return placeholders.some((marker) => normalized.includes(marker));
  }

  private getFirstRealProductImage(images?: string[] | null): string | undefined {
    if (!Array.isArray(images)) return undefined;
    return images.find((img) => !this.isPlaceholderProductImage(img));
  }

  /**
   * Lightweight category/subcategory listing for nav etc. Returns only id and name.
   * Includes ALL categories (subGroup1); those without subGroup2 get subcategories: [].
   */
  async getCategoryListing(): Promise<
    {
      id: string;
      name: string;
      subcategories: { id: string; name: string; image?: string }[];
      images: string[];
    }[]
  > {
    // 1) All distinct categories (subGroup1) — no filter on subGroup2, so all 12 show
    const allCategories = await this.itemRepository
      .createQueryBuilder('item')
      .select('DISTINCT item.subGroup1', 'subGroup1')
      .where('item.subGroup1 IS NOT NULL')
      .andWhere('item.subGroup1 != :empty', { empty: '' })
      .orderBy('item.subGroup1', 'ASC')
      .getRawMany();

    const categoryNames = allCategories
      .map((r) => (r.subGroup1 || '').trim())
      .filter(Boolean);
    if (categoryNames.length === 0) return [];

    // 2) Distinct (subGroup1, subGroup2) pairs where subGroup2 is present
    const pairs = await this.itemRepository
      .createQueryBuilder('item')
      .distinct(true)
      .select('item.subGroup1', 'subGroup1')
      .addSelect('item.subGroup2', 'subGroup2')
      .where('item.subGroup1 IN (:...categoryNames)', { categoryNames })
      .andWhere('item.subGroup2 IS NOT NULL')
      .andWhere('item.subGroup2 != :empty2', { empty2: '' })
      .orderBy('item.subGroup1', 'ASC')
      .addOrderBy('item.subGroup2', 'ASC')
      .getRawMany();

    const subByCategory = new Map<string, { id: string; name: string }[]>();
    for (const row of pairs) {
      const s1 = (row.subGroup1 || '').trim();
      const s2 = (row.subGroup2 || '').trim();
      if (!s1 || !s2) continue;
      if (!subByCategory.has(s1)) subByCategory.set(s1, []);
      const list = subByCategory.get(s1)!;
      if (!list.some((s) => s.id === s2)) list.push({ id: s2, name: s2 });
    }

    // 3) One product image per subcategory (for home category cards rotation)
    const itemsWithImages = await this.itemRepository
      .createQueryBuilder('item')
      .where('item.subGroup1 IN (:...categoryNames)', { categoryNames })
      .andWhere('item.productImages IS NOT NULL')
      .orderBy('item.subGroup1', 'ASC')
      .addOrderBy('item.subGroup2', 'ASC')
      .addOrderBy('item.itemName', 'ASC')
      .getMany();

    const imagesByCategory = new Map<string, Map<string, string>>();
    for (const item of itemsWithImages) {
      const s1 = (item.subGroup1 || '').trim();
      const s2 = (item.subGroup2 || '').trim() || '__default__';
      if (!s1) continue;

      const realImg = this.getFirstRealProductImage(item.productImages);
      if (!realImg) continue;

      if (!imagesByCategory.has(s1)) imagesByCategory.set(s1, new Map());
      const subMap = imagesByCategory.get(s1)!;
      if (!subMap.has(s2)) subMap.set(s2, realImg);
    }

    return categoryNames.map((name) => {
      const subMap = imagesByCategory.get(name);
      const images = subMap ? Array.from(subMap.values()) : [];
      const subcategories = (subByCategory.get(name) ?? []).map((sub) => ({
        ...sub,
        image: subMap?.get(sub.name),
      }));

      return {
        id: name,
        name,
        subcategories,
        images,
      };
    });
  }

  // Get all unique subGroup1 options
  async getAllSubGroup1Options(): Promise<string[]> {
    const items = await this.itemRepository
      .createQueryBuilder('item')
      .select('DISTINCT item.subGroup1', 'subGroup1')
      .where('item.subGroup1 IS NOT NULL')
      .andWhere('item.subGroup1 != :empty', { empty: '' })
      .orderBy('item.subGroup1', 'ASC')
      .getRawMany();

    return items.map((item) => item.subGroup1).filter(Boolean);
  }

  // Get subGroup2 options based on selected subGroup1
  async getSubGroup2Options(subGroup1: string[]): Promise<string[]> {
    if (!subGroup1 || subGroup1.length === 0) {
      return [];
    }

    const items = await this.itemRepository
      .createQueryBuilder('item')
      .select('DISTINCT item.subGroup2', 'subGroup2')
      .where('item.subGroup1 IN (:...subGroup1)', { subGroup1 })
      .andWhere('item.subGroup2 IS NOT NULL')
      .andWhere('item.subGroup2 != :empty', { empty: '' })
      .orderBy('item.subGroup2', 'ASC')
      .getRawMany();

    return items.map((item) => item.subGroup2).filter(Boolean);
  }

  async findAllPopularity(): Promise<ItemEntity[]> {
    return this.itemRepository.find({
      order: {
        popularity: 'DESC', // Order by popularity descending
      },
      take: 100, // Limit to top 100 products
    });
  }

  async findById(id: string): Promise<ItemEntity | null> {
    return this.itemRepository.findOne({ where: { id } }); // Load files for the item by ID
  }

  async delete(id: string): Promise<{ message: string }> {
    const items = await this.findById(id);
    // Check if the item exists
    if (!items) {
      throw new NotFoundException(`Item with id ${id} not found`); // or handle it differently
    }
    await this.itemRepository.remove(items);
    return { message: 'Product deleted successfully' };
  }

  async deleteByMasterID(masterID: string): Promise<{ message: string }> {
    const item = await this.itemRepository.findOne({ where: { masterID } });
    if (!item) {
      throw new NotFoundException(`Item with masterID ${masterID} not found`);
    }
    await this.itemRepository.remove(item);
    return { message: 'Product deleted successfully' };
  }

  async uploadFilesToCloudinary(
    itemId: string,
    productImages: Express.Multer.File[],
    dimensionalFiles: Express.Multer.File[],
    applyToAllProductImages: boolean,
    applyToAllDimensionalFiles: boolean,
  ): Promise<ItemEntity[]> {
    const item = await this.itemRepository.findOne({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundException('Item not found');
    }

    const newImageUrls: string[] = [];
    const newDimensionalUrls: string[] = [];
    const updatedItems: ItemEntity[] = [];

    // Upload product images
    if (productImages && productImages.length > 0) {
      for (const file of productImages) {
        const fileName = `${Date.now()}-${file.originalname}`;
        const imageUrl = await this.fileStorageService.uploadImage(
          file.buffer,
          'images',
          fileName,
          file.mimetype,
        );
        newImageUrls.push(imageUrl);
      }
    }

    // Upload dimensional files
    if (dimensionalFiles && dimensionalFiles.length > 0) {
      for (const file of dimensionalFiles) {
        const fileName = `${Date.now()}-${file.originalname}`;
        const fileUrl = await this.fileStorageService.uploadFile(
          file.buffer,
          'documents',
          fileName,
        );
        newDimensionalUrls.push(fileUrl);
      }
    }

    // Define items to update
    let itemsToUpdate: ItemEntity[];

    if (applyToAllProductImages || applyToAllDimensionalFiles) {
      // Fetch all items with the same subGroup1 if any applyToAll flag is true
      itemsToUpdate = await this.itemRepository.find({
        where: { subGroup2: item.subGroup2 },
      });

      for (const currentItem of itemsToUpdate) {
        // Apply new images to all items in the subgroup if applyToAllProductImages is true
        if (applyToAllProductImages) {
          currentItem.productImages = [
            ...(item.productImages || []),
            ...newImageUrls,
          ]; // Replace with combined images from specified item
        }

        // Apply new dimensional files to all items in the subgroup if applyToAllDimensionalFiles is true
        if (applyToAllDimensionalFiles) {
          currentItem.dimensionalFiles = [
            ...(item.dimensionalFiles || []),
            ...newDimensionalUrls,
          ]; // Replace with combined dimensional files from specified item
        }

        // Save each updated item
        const savedItem = await this.itemRepository.save(currentItem);
        updatedItems.push(savedItem);
      }
    } else {
      // Only update the specified item if no applyToAll flag is true
      if (newImageUrls.length > 0) {
        item.productImages = [...(item.productImages || []), ...newImageUrls];
      }

      if (newDimensionalUrls.length > 0) {
        item.dimensionalFiles = [
          ...(item.dimensionalFiles || []),
          ...newDimensionalUrls,
        ];
      }

      // Save the specified item
      const savedItem = await this.itemRepository.save(item);
      updatedItems.push(savedItem);
    }

    return updatedItems; // Return the list of updated items
  }

  // Method to delete specific images from Cloudinary
  async deleteImages(
    itemId: string,
    imagesToDelete: { productImages?: string[]; dimensionalFiles?: string[] },
  ): Promise<ItemEntity> {
    const item = await this.itemRepository.findOne({ where: { id: itemId } });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    // Delete specified product images from Cloudinary if URLs are provided
    const productImages = imagesToDelete.productImages;
    if (productImages?.length) {
      await this.fileStorageService.deleteFiles(productImages);
      // Remove deleted product image URLs from the item
      item.productImages = item.productImages.filter(
        (url) => !productImages.includes(url),
      );
    }

    // Delete specified dimensional files from Cloudinary if URLs are provided
    const dimensionalFiles = imagesToDelete.dimensionalFiles;
    if (dimensionalFiles?.length) {
      await this.fileStorageService.deleteFiles(dimensionalFiles);
      // Remove deleted dimensional file URLs from the item
      item.dimensionalFiles = item.dimensionalFiles.filter(
        (url) => !dimensionalFiles.includes(url),
      );
    }

    return await this.itemRepository.save(item); // Save the updated item entity
  }

  async deleteMultiple(ids: string[]): Promise<{ message: string }> {
    const notFoundIds: string[] = [];

    for (const id of ids) {
      const item = await this.findById(id);
      if (!item) {
        notFoundIds.push(id);
        continue; // skip this ID if not found
      }
      await this.itemRepository.remove(item);
    }

    if (notFoundIds.length > 0) {
      throw new NotFoundException(
        `Items with ids ${notFoundIds.join(', ')} not found`,
      );
    }

    return { message: 'Products deleted successfully' };
  }

  //Cron Job Set

  // @Cron('0 * * * *') // hour
  async cronFetchAndStoreItems(): Promise<void> {
    console.log('Item executed at:', new Date().toISOString());
    const REQUEST_TIMEOUT = 120000; // 2 minutes timeout
    const BATCH_SIZE = 500;

    const productSyncSetting = await this.syncControlSettingsRepository.findOne(
      {
        where: { moduleName: 'Products' },
      },
    );

    if (!productSyncSetting || !productSyncSetting.isAutoSyncEnabled) {
      throw new BadRequestException('Auto Sync for Products is disabled.');
    }

    try {
      // First get all existing items from database
      const existingItems = await this.itemRepository.find();
      // Create Map of existing items for quick lookup
      const existingItemMap = new Map(
        existingItems.map((item) => [item.itemName, item]),
      );
      // Fetch data from Tally - use POST for full response in one go
      const response = await axios.post(
        process.env.TALLY_URL as string,
        products,
        {
          headers: {
            'Content-Type': 'text/xml',
          },
          timeout: REQUEST_TIMEOUT,
          responseType: 'text',
          maxContentLength: 50 * 1024 * 1024,
          maxBodyLength: 50 * 1024 * 1024,
        },
      );

      // Parse XML response into items
      const items = await this.parseXmlToItems(response.data);
      const itemsToUpdateCategory = this.collectCategoryUpdates(
        items,
        existingItemMap,
      );

      if (itemsToUpdateCategory.length > 0) {
        for (let i = 0; i < itemsToUpdateCategory.length; i += BATCH_SIZE) {
          const batch = itemsToUpdateCategory.slice(i, i + BATCH_SIZE);
          await this.itemRepository.save(batch);
        }
        console.log(
          `Updated category for ${itemsToUpdateCategory.length} products from Tally`,
        );
      }

      // Find only new items to insert (items in Tally but not in database)
      const itemsToInsert: ItemEntity[] = [];
      for (const item of items) {
        if (!existingItemMap.has(item.itemName)) {
          itemsToInsert.push(item);
        }
      }

      // Generate masterID for new items before inserting
      if (itemsToInsert.length > 0) {
        // Get the starting masterID
        const lastItem = await this.itemRepository
          .createQueryBuilder('item')
          .where('item.masterID IS NOT NULL')
          .orderBy('CAST(item.masterID AS INTEGER)', 'DESC')
          .getOne();

        let nextMasterID =
          lastItem && lastItem.masterID
            ? parseInt(lastItem.masterID, 10) + 1
            : 10000001;

        // Assign masterID to each new item
        for (const item of itemsToInsert) {
          if (!item.masterID) {
            item.masterID = nextMasterID.toString().padStart(8, '0');
            nextMasterID++;
          }
        }

        // Insert new items in batches
        for (let i = 0; i < itemsToInsert.length; i += BATCH_SIZE) {
          const batch = itemsToInsert.slice(i, i + BATCH_SIZE);
          await this.itemRepository.save(batch);
          console.log(
            `Inserted batch ${i / BATCH_SIZE + 1} of ${Math.ceil(itemsToInsert.length / BATCH_SIZE)} (${batch.length} items)`,
          );
        }
      }

      await this.syncLogRepository.save({
        sync_type: 'Products',
        status: SyncLogStatus.SUCCESS,
      });
    } catch (error: any) {
      await this.syncLogRepository.save({
        sync_type: 'Products',
        status: SyncLogStatus.FAIL, // Enum value
      });

      throw new InternalServerErrorException('Open Tally to fetch items');
    }
  }

  @Cron('0 0 * * 0') // Runs weekly at midnight on Sunday to delete logs older than two minutes.
  async cleanupAllLogs(): Promise<void> {
    console.log('Complete log cleanup started:', new Date().toISOString());

    try {
      // Delete all logs without any condition
      const result = await this.syncLogRepository.delete({});

      console.log(
        `Complete log cleanup completed. Deleted ${result.affected} logs.`,
      );
    } catch (error) {
      console.error('Complete log cleanup failed:', error);
    }
  }
}
