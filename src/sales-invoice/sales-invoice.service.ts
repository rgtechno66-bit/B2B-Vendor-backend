import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import {
  SalesInvoiceEntity,
  SalesInvoiceItemEntity,
  SalesInvoiceItemDescriptionEntity,
  SalesInvoicePaymentTermEntity,
  SalesInvoiceOrderEntity,
  SalesInvoiceLedgerEntity,
} from './sales-invoice.entity';
import {
  CreateSalesInvoiceVoucherDto,
  SalesInvoiceDto,
} from './sales-invoice.dto';
import { OrderEntity } from '../order/order.entity';
import { FileStorageService } from '../service/file-storage.service';
import { CronSchedulerService } from '../service/cron-scheduler.service';
import { CronJobType } from '../settings/setting.entity';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SalesInvoiceService implements OnModuleInit {
  private readonly logger = new Logger(SalesInvoiceService.name);
  private readonly CRON_JOB_NAME = 'uploadAllInvoices';

  constructor(
    @InjectRepository(SalesInvoiceEntity)
    private readonly salesInvoiceRepository: Repository<SalesInvoiceEntity>,
    @InjectRepository(SalesInvoiceItemEntity)
    private readonly salesInvoiceItemRepository: Repository<SalesInvoiceItemEntity>,
    @InjectRepository(SalesInvoiceItemDescriptionEntity)
    private readonly salesInvoiceItemDescriptionRepository: Repository<SalesInvoiceItemDescriptionEntity>,
    @InjectRepository(SalesInvoicePaymentTermEntity)
    private readonly salesInvoicePaymentTermRepository: Repository<SalesInvoicePaymentTermEntity>,
    @InjectRepository(SalesInvoiceOrderEntity)
    private readonly salesInvoiceOrderRepository: Repository<SalesInvoiceOrderEntity>,
    @InjectRepository(SalesInvoiceLedgerEntity)
    private readonly salesInvoiceLedgerRepository: Repository<SalesInvoiceLedgerEntity>,
    @InjectRepository(OrderEntity)
    private readonly orderRepository: Repository<OrderEntity>,
    private readonly fileStorageService: FileStorageService,
    private readonly cronSchedulerService: CronSchedulerService,
  ) {}

  async onModuleInit() {
    await this.scheduleCronJob();
  }

  /** Schedule or reschedule the invoice upload cron job */
  async scheduleCronJob(): Promise<void> {
    await this.cronSchedulerService.scheduleCronJob(
      this.CRON_JOB_NAME,
      CronJobType.INVOICE_UPLOAD,
      () => this.uploadAllInvoices(),
      { minutes: 2, seconds: 0, hours: 0 },
      'Invoice upload',
    );
  }

  /** Sync invoice PDFs from Tally path to Cloudinary; voucherNo from salesInvoiceRepository only */
  async uploadAllInvoices(): Promise<void> {
    this.logger.log('Invoice sync started: ' + new Date().toISOString());

    try {
      const invoices = await this.salesInvoiceRepository.find({
        where: { invoicePdf: IsNull() },
        select: ['id', 'voucherNo', 'invoicePdf'],
      });

      if (invoices.length === 0) {
        this.logger.log('No sales invoices without an invoice PDF.');
        return;
      }

      for (const invoice of invoices) {
        const voucherNo = invoice.voucherNo;
        if (!voucherNo) continue;

        const pdfFileName = `${voucherNo}.pdf`;
        const httpPdfUrl = `${process.env.TALLY_INVOICE_PATH}/${pdfFileName}`;

        this.logger.log(`Checking PDF URL: ${httpPdfUrl}`);

        try {
          const headResponse = await axios.head(httpPdfUrl);

          if (headResponse.status === 200) {
            const response = await axios.get(httpPdfUrl, {
              responseType: 'stream',
              timeout: 30000,
            });

            const tempFilePath = path.join(process.cwd(), 'temp', pdfFileName);
            const tempDir = path.dirname(tempFilePath);
            if (!fs.existsSync(tempDir)) {
              fs.mkdirSync(tempDir, { recursive: true });
            }

            const writer = fs.createWriteStream(tempFilePath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
              writer.on('finish', resolve);
              writer.on('error', reject);
            });

            const fileUrl = await this.fileStorageService.uploadFileToCloudinary(
              'invoices',
              tempFilePath,
              pdfFileName,
            );

            invoice.invoicePdf = fileUrl;
            await this.salesInvoiceRepository.save(invoice);

            if (fs.existsSync(tempFilePath)) {
              fs.unlinkSync(tempFilePath);
            }

            this.logger.log(
              `Invoice for voucherNo ${voucherNo} saved successfully to local storage.`,
            );
          } else {
            this.logger.log(
              `PDF ${pdfFileName} for voucherNo ${voucherNo} not found (HTTP ${headResponse.status}).`,
            );
          }
        } catch (error: any) {
          if (axios.isAxiosError(error) && error.response?.status === 404) {
            this.logger.log(
              `PDF ${pdfFileName} for voucherNo ${voucherNo} does not exist.`,
            );
          } else {
            this.logger.error(
              `Error processing invoice for voucherNo ${voucherNo}: ${error?.message}`,
            );
          }
        }
      }
    } catch (error: any) {
      this.logger.error('Error uploading invoices: ' + error?.message);
    }
  }

  // Helper function to convert "(-)200" format to -200 (negative number)
  private convertAmountToNumber(amount: any): number | undefined {
    if (amount === undefined || amount === null || amount === '') {
      return undefined;
    }

    const amountStr = String(amount).trim();

    // If amount is in "(-)200" format, convert to -200
    if (amountStr.startsWith('(-)')) {
      const numericValue = parseFloat(amountStr.substring(3));
      return isNaN(numericValue) ? undefined : -Math.abs(numericValue);
    }

    // Parse as float for positive or negative numbers
    const numericValue = parseFloat(amountStr);
    return isNaN(numericValue) ? undefined : numericValue;
  }

  /** Parse "3,198.00 pc" -> 3198.00 (strip commas and non-numeric suffix) */
  private parseTotalSalesQtyToNumber(value: any): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const str = String(value).trim().replace(/,/g, '');
    const num = parseFloat(str);
    return Number.isNaN(num) ? undefined : num;
  }

  // Create or update sales invoice from voucher data
  async createOrUpdateSalesInvoice(
    createDto: any,
  ): Promise<{ message: string; data: SalesInvoiceEntity[] }> {
    try {
      const invoices: SalesInvoiceEntity[] = [];
      let createdCount = 0;
      let updatedCount = 0;

      // Handle both VOUCHER (uppercase) and voucher (lowercase)
      const vouchers = createDto.VOUCHER || createDto.voucher || [];

      if (!Array.isArray(vouchers)) {
        throw new BadRequestException('VOUCHER/voucher must be an array');
      }

      for (const voucher of vouchers) {
        let salesInvoice: SalesInvoiceEntity;
        let isUpdate = false;

        // Get masterId and id from voucher (handle both camelCase and lowercase)
        const masterId =
          voucher.masterId || voucher.masterid || voucher.MASTERID;
        const id = voucher.id || voucher.ID;

        // Check if masterId or id is provided and invoice exists
        // Priority: masterId first, then id
        let existingInvoice: SalesInvoiceEntity | null = null;

        if (masterId) {
          // Check by masterId first (don't load relations to prevent cascade save issues)
          existingInvoice = await this.salesInvoiceRepository.findOne({
            where: { masterId },
          });
        }

        // If not found by masterId and id is provided, check by id
        if (!existingInvoice && id) {
          existingInvoice = await this.salesInvoiceRepository.findOne({
            where: { id },
          });
        }

        if (existingInvoice) {
          // Update existing invoice based on masterId
          // Delete ALL related entities FIRST, then update invoice, then recreate
          isUpdate = true;
          updatedCount++;

          const invoiceId = existingInvoice.id;

          // Step 1: Delete item descriptions first (due to foreign key constraints)
          const existingItemIds = await this.salesInvoiceItemRepository
            .find({
              where: { salesInvoiceId: invoiceId },
              select: ['id'],
            })
            .then((items) => items.map((item) => item.id));

          if (existingItemIds.length > 0) {
            const deleteDescriptionsResult =
              await this.salesInvoiceItemDescriptionRepository
                .createQueryBuilder()
                .delete()
                .where('itemId IN (:...itemIds)', { itemIds: existingItemIds })
                .execute();
            this.logger.log(
              `Deleted ${deleteDescriptionsResult.affected || 0} item descriptions`,
            );
          }

          // Step 2: Delete all items, payment terms, orders, and ledgers by salesInvoiceId
          const deleteItemsResult =
            await this.salesInvoiceItemRepository.delete({
              salesInvoiceId: invoiceId,
            });
          const deletePaymentTermsResult =
            await this.salesInvoicePaymentTermRepository.delete({
              salesInvoiceId: invoiceId,
            });
          const deleteOrdersResult =
            await this.salesInvoiceOrderRepository.delete({
              salesInvoiceId: invoiceId,
            });
          const deleteLedgersResult =
            await this.salesInvoiceLedgerRepository.delete({
              salesInvoiceId: invoiceId,
            });

          this.logger.log(
            `Deleted for invoice ${invoiceId} (masterId: ${masterId}): ` +
              `${deleteItemsResult.affected || 0} items, ` +
              `${deletePaymentTermsResult.affected || 0} payment terms, ` +
              `${deleteOrdersResult.affected || 0} orders, ` +
              `${deleteLedgersResult.affected || 0} ledgers`,
          );

          // Step 3: Get fresh invoice entity without relations
          const refreshedInvoice = await this.salesInvoiceRepository.findOne({
            where: { id: invoiceId },
          });

          if (!refreshedInvoice) {
            throw new NotFoundException(
              `Invoice ${invoiceId} not found after deletion`,
            );
          }

          salesInvoice = refreshedInvoice;
        } else {
          // No matching invoice found, create new
          salesInvoice = new SalesInvoiceEntity();
          createdCount++;
        }

        // Update or set invoice fields (handle both camelCase and lowercase)
        salesInvoice.voucherNo =
          voucher.voucherNo || voucher.vouchernumber || voucher.VOUCHERNO;
        salesInvoice.voucherDate =
          voucher.voucherDate || voucher.voucherdate || voucher.VOUCHERDATE;
        salesInvoice.voucherType =
          voucher.voucherType || voucher.vouchertype || voucher.VOUCHERTYPE;
        salesInvoice.referenceNo =
          voucher.referenceNo || voucher.referenceno || voucher.REFERENCENO;
        salesInvoice.guid = voucher.guid || voucher.GUID;
        salesInvoice.masterId =
          voucher.masterId || voucher.masterid || voucher.MASTERID;
        salesInvoice.partyName =
          voucher.partyName || voucher.partyname || voucher.PARTYNAME;
        const closingBal =
          voucher.closingBalance ||
          voucher.closingbalance ||
          voucher.CLOSINGBALANCE;
        salesInvoice.closingBalance = closingBal
          ? parseFloat(String(closingBal))
          : undefined;
        const nxPartyCodeVal =
          voucher.nxPartyCode || voucher.nxpartycode || voucher.NXPARTYCODE;
        salesInvoice.nxPartyCode =
          nxPartyCodeVal === 'NULL' || nxPartyCodeVal === 'null'
            ? null
            : nxPartyCodeVal;
        const amountVal = voucher.amount || voucher.AMOUNT;
        salesInvoice.amount = amountVal
          ? parseFloat(String(amountVal))
          : undefined;
        const customerNameVal =
          voucher.customerName || voucher.customername || voucher.CUSTOMERNAME;
        salesInvoice.customerName =
          customerNameVal === 'NULL' || customerNameVal === 'null'
            ? null
            : customerNameVal;
        salesInvoice.partyGstin =
          voucher.partyGstin || voucher.partygstin || voucher.PARTYGSTIN;
        salesInvoice.emailId =
          voucher.emailId || voucher.emailid || voucher.EMAILID;
        salesInvoice.mobileNumber =
          voucher.mobileNumber || voucher.mobilenumber || voucher.MOBILENUMBER;
        salesInvoice.buyerAddress =
          voucher.buyerAddress || voucher.buyeraddress || voucher.BUYERADDRESS;
        salesInvoice.eMail =
          voucher.eMail ||
          voucher.email ||
          voucher['E-Mail'] ||
          voucher['e-mail'] ||
          voucher.EMAIL;
        salesInvoice.consigneeAddress =
          voucher.consigneeAddress ||
          voucher.consigneeaddress ||
          voucher.CONSIGNEEADDRESS;
        salesInvoice.state = voucher.state || voucher.STATE;
        salesInvoice.placeOfSupply =
          voucher.placeOfSupply ||
          voucher.placeofsupply ||
          voucher.PLACEOFSUPPLY;

        // Save the main invoice
        const savedInvoice =
          await this.salesInvoiceRepository.save(salesInvoice);

        // Set vendorId from Order where orderNo = voucherNo (for vendor-scoped list)
        if (savedInvoice.voucherNo) {
          const order = await this.orderRepository.findOne({
            where: { orderNo: savedInvoice.voucherNo },
            select: ['id'],
            relations: ['user'],
          });
          if (order?.user?.id) {
            savedInvoice.vendorId = order.user.id;
            await this.salesInvoiceRepository.save(savedInvoice);
          }
        }

        // Create items (handle both ITEMS and items)
        const itemsArray = voucher.ITEMS || voucher.items || [];
        if (itemsArray && itemsArray.length > 0) {
          const items: SalesInvoiceItemEntity[] = [];
          for (const itemDto of itemsArray) {
            const item = new SalesInvoiceItemEntity();
            item.salesInvoiceId = savedInvoice.id;
            item.orderNo =
              itemDto.orderNo || itemDto.orderno || itemDto.ORDERNO;
            item.orderDue =
              itemDto.orderDue || itemDto.orderdue || itemDto.ORDERDUE;
            item.itemName =
              itemDto.itemName || itemDto.itemname || itemDto.ITEMNAME;
            const nxItemCodeVal =
              itemDto.nxItemCode || itemDto.nxitemcode || itemDto.NXITEMCODE;
            item.nxItemCode =
              nxItemCodeVal === 'NULL' || nxItemCodeVal === 'null'
                ? null
                : nxItemCodeVal;
            const partNoVal =
              itemDto.partNo || itemDto.partno || itemDto.PARTNO;
            item.partNo =
              partNoVal === 'NULL' || partNoVal === 'null' ? null : partNoVal;
            item.baseUnits =
              itemDto.baseUnits || itemDto.baseunits || itemDto.BASEUNITS;
            const actualQtyVal =
              itemDto.actualQty || itemDto.actualqty || itemDto.ACTUALQTY;
            item.actualQty = actualQtyVal
              ? parseFloat(String(actualQtyVal))
              : undefined;
            const billedQtyVal =
              itemDto.billedQty || itemDto.billedqty || itemDto.BILLEDQTY;
            item.billedQty = billedQtyVal
              ? parseFloat(String(billedQtyVal))
              : undefined;
            const inclRateVal =
              itemDto.inclRate || itemDto.inclrate || itemDto.INCLRATE;
            item.inclRate = inclRateVal
              ? parseFloat(String(inclRateVal))
              : undefined;
            const rateVal = itemDto.rate || itemDto.RATE;
            item.rate = rateVal ? parseFloat(String(rateVal)) : undefined;
            const discPercVal =
              itemDto.discPerc || itemDto.discperc || itemDto.DISCPERC;
            item.discPerc = discPercVal
              ? parseFloat(String(discPercVal))
              : undefined;
            const discAmtVal =
              itemDto.discAmt || itemDto.discamt || itemDto.DISCAMT;
            item.discAmt = discAmtVal
              ? parseFloat(String(discAmtVal))
              : undefined;
            const discPropVal =
              itemDto.discProp || itemDto.discprop || itemDto.DISCPROP;
            item.discProp = discPropVal
              ? parseFloat(String(discPropVal))
              : undefined;
            const itemAmountVal = itemDto.amount || itemDto.AMOUNT;
            item.amount = itemAmountVal
              ? parseFloat(String(itemAmountVal))
              : undefined;
            item.accountingName =
              itemDto.accountingName ||
              itemDto.accountingname ||
              itemDto.ACCOUNTINGNAME;
            const gstPerVal =
              itemDto.gstPer ||
              itemDto.gstper ||
              itemDto.GSTPer ||
              itemDto.GSTPER;
            item.gstPer = gstPerVal ? parseFloat(String(gstPerVal)) : undefined;
            item.totalSalesAmt = this.parseTotalSalesQtyToNumber(
              itemDto.totalSalesAmt ?? (itemDto as any).TOTALSALESAMT,
            );

            const savedItem = await this.salesInvoiceItemRepository.save(item);

            // Create descriptions for item (handle both Description and description)
            const descriptionArray =
              itemDto.Description || itemDto.description || [];
            if (descriptionArray && descriptionArray.length > 0) {
              const descriptions: SalesInvoiceItemDescriptionEntity[] = [];
              for (const descDto of descriptionArray) {
                const description = new SalesInvoiceItemDescriptionEntity();
                description.itemId = savedItem.id;
                description.desc = descDto.desc;
                descriptions.push(description);
              }
              await this.salesInvoiceItemDescriptionRepository.save(
                descriptions,
              );
            }
            items.push(savedItem);
          }
        }

        // Create payment terms (handle both PAYMENT_TERMS and payment_terms)
        const paymentTermsArray =
          voucher.PAYMENT_TERMS || voucher.payment_terms || [];
        if (paymentTermsArray && paymentTermsArray.length > 0) {
          const paymentTerms: SalesInvoicePaymentTermEntity[] = [];
          for (const termDto of paymentTermsArray) {
            const term = new SalesInvoicePaymentTermEntity();
            term.salesInvoiceId = savedInvoice.id;
            term.terms = termDto.terms || termDto.TERMS;
            paymentTerms.push(term);
          }
          await this.salesInvoicePaymentTermRepository.save(paymentTerms);
        }

        // Create orders (handle both ORDERS and orders)
        const ordersArray = voucher.ORDERS || voucher.orders || [];
        if (ordersArray && ordersArray.length > 0) {
          const orders: SalesInvoiceOrderEntity[] = [];
          for (const orderDto of ordersArray) {
            const order = new SalesInvoiceOrderEntity();
            order.salesInvoiceId = savedInvoice.id;
            const orderIdVal =
              orderDto.orderId || orderDto.orderid || orderDto.ORDERID;
            order.orderId =
              orderIdVal === 'NULL' || orderIdVal === 'null'
                ? null
                : orderIdVal;
            const nxOrderIdVal =
              orderDto.nxOrderId || orderDto.nxorderid || orderDto.NXORDERID;
            order.nxOrderId =
              nxOrderIdVal === 'NULL' || nxOrderIdVal === 'null'
                ? null
                : nxOrderIdVal;
            const tlOrderIdVal =
              orderDto.tlOrderId || orderDto.tlorderid || orderDto.TLORDERID;
            order.tlOrderId =
              tlOrderIdVal === 'NULL' || tlOrderIdVal === 'null'
                ? null
                : tlOrderIdVal;
            orders.push(order);
          }
          await this.salesInvoiceOrderRepository.save(orders);
        }

        // Create ledgers (handle both LEDGER and ledger)
        const ledgerArray = voucher.LEDGER || voucher.ledger || [];
        if (ledgerArray && ledgerArray.length > 0) {
          const ledgers: SalesInvoiceLedgerEntity[] = [];
          for (const ledgerDto of ledgerArray) {
            const ledger = new SalesInvoiceLedgerEntity();
            ledger.salesInvoiceId = savedInvoice.id;
            ledger.ledgerName =
              ledgerDto.ledgerName ||
              ledgerDto.ledgername ||
              ledgerDto.LEDGERNAME;
            const ratePercVal =
              ledgerDto.ratePerc || ledgerDto.rateperc || ledgerDto.RATEPERC;
            ledger.ratePerc = ratePercVal
              ? parseFloat(String(ratePercVal))
              : undefined;
            // Convert amount: "(-)200" to -200, positive numbers stay positive
            const ledgerAmountVal = ledgerDto.amount || ledgerDto.AMOUNT;
            ledger.amount = this.convertAmountToNumber(ledgerAmountVal);
            ledgers.push(ledger);
          }
          await this.salesInvoiceLedgerRepository.save(ledgers);
        }

        // Fetch the complete invoice with all relations
        const completeInvoice = await this.salesInvoiceRepository.findOne({
          where: { id: savedInvoice.id },
          relations: [
            'items',
            'items.descriptions',
            'paymentTerms',
            'orders',
            'ledgers',
          ],
        });

        if (completeInvoice) {
          invoices.push(completeInvoice);
        }
      }

      const actionMessage =
        createdCount > 0 && updatedCount > 0
          ? `Successfully created ${createdCount} and updated ${updatedCount} sales invoice(s)`
          : createdCount > 0
            ? `Successfully created ${createdCount} sales invoice(s)`
            : `Successfully updated ${updatedCount} sales invoice(s)`;

      return {
        message: actionMessage,
        data: invoices,
      };
    } catch (error: any) {
      this.logger.error(
        `Error creating/updating sales invoice: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Failed to create/update sales invoice: ${error.message}`,
      );
    }
  }

  /** Vendor filter by party name (priority) or email; order: party name match first, then createdAt */
  private vendorByPartyOrEmailWhere(
    vendorPartyName?: string,
    vendorEmail?: string,
  ): { clause: string; params: Record<string, string> } | null {
    if (!vendorPartyName && !vendorEmail) return null;
    const parts: string[] = [];
    const params: Record<string, string> = {};
    if (vendorPartyName?.trim()) {
      parts.push(
        'LOWER(TRIM(invoice.partyName)) = LOWER(TRIM(:vendorPartyName))',
      );
      params.vendorPartyName = vendorPartyName.trim();
    }
    if (vendorEmail?.trim()) {
      parts.push(
        '(LOWER(TRIM(invoice.emailId)) = LOWER(TRIM(:vendorEmail)) OR LOWER(TRIM(invoice.eMail)) = LOWER(TRIM(:vendorEmail)))',
      );
      params.vendorEmail = vendorEmail.trim();
    }
    if (parts.length === 0) return null;
    return { clause: `(${parts.join(' OR ')})`, params };
  }

  /** Sort list so party name matches (vendor name) come first, then by createdAt DESC */
  private sortPartyNameFirst(
    list: SalesInvoiceEntity[],
    vendorPartyName?: string,
  ): SalesInvoiceEntity[] {
    if (!vendorPartyName?.trim() || !list.length) return list;
    const key = vendorPartyName.trim().toLowerCase();
    return [...list].sort((a, b) => {
      const aMatch = (a.partyName || '').trim().toLowerCase() === key ? 0 : 1;
      const bMatch = (b.partyName || '').trim().toLowerCase() === key ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }

  // Get all sales invoices with pagination. Vendor: filter by party name (priority) or email; order party name first.
  async findAll(
    page?: number,
    limit?: number,
    search?: string,
    vendorId?: string,
    vendorPartyName?: string,
    vendorEmail?: string,
  ): Promise<
    | SalesInvoiceEntity[]
    | {
        data: SalesInvoiceEntity[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }
  > {
    const vendorByPartyOrEmail = this.vendorByPartyOrEmailWhere(
      vendorPartyName,
      vendorEmail,
    );
    const useVendorPartyOrEmail = !!vendorByPartyOrEmail;
    const vendorFilter =
      !useVendorPartyOrEmail && vendorId ? { vendorId } : undefined;

    if (!page && !limit) {
      let list: SalesInvoiceEntity[];
      if (search && search.trim() !== '') {
        const qb = this.salesInvoiceRepository
          .createQueryBuilder('invoice')
          .leftJoinAndSelect('invoice.items', 'items')
          .leftJoinAndSelect('items.descriptions', 'descriptions')
          .leftJoinAndSelect('invoice.paymentTerms', 'paymentTerms')
          .leftJoinAndSelect('invoice.orders', 'orders')
          .leftJoinAndSelect('invoice.ledgers', 'ledgers')
          .where(
            'LOWER(invoice.partyName) LIKE LOWER(:search) OR LOWER(invoice.voucherNo) LIKE LOWER(:search)',
            {
              search: `%${search}%`,
            },
          );
        if (useVendorPartyOrEmail && vendorByPartyOrEmail) {
          qb.andWhere(vendorByPartyOrEmail.clause, vendorByPartyOrEmail.params);
        } else if (vendorId) {
          qb.andWhere('invoice.vendorId = :vendorId', { vendorId });
        }
        qb.orderBy('invoice.createdAt', 'DESC');
        list = this.sortPartyNameFirst(await qb.getMany(), vendorPartyName);
      } else {
        if (useVendorPartyOrEmail && vendorByPartyOrEmail) {
          const qb = this.salesInvoiceRepository
            .createQueryBuilder('invoice')
            .leftJoinAndSelect('invoice.items', 'items')
            .leftJoinAndSelect('items.descriptions', 'descriptions')
            .leftJoinAndSelect('invoice.paymentTerms', 'paymentTerms')
            .leftJoinAndSelect('invoice.orders', 'orders')
            .leftJoinAndSelect('invoice.ledgers', 'ledgers')
            .where(vendorByPartyOrEmail.clause, vendorByPartyOrEmail.params)
            .orderBy('invoice.createdAt', 'DESC');
          list = this.sortPartyNameFirst(await qb.getMany(), vendorPartyName);
        } else {
          list = await this.salesInvoiceRepository.find({
            where: vendorFilter as any,
            relations: [
              'items',
              'items.descriptions',
              'paymentTerms',
              'orders',
              'ledgers',
            ],
            order: { createdAt: 'DESC' },
          });
        }
      }
      return list;
    }

    const pageNumber = page || 1;
    const limitNumber = limit || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const queryBuilder = this.salesInvoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.items', 'items')
      .leftJoinAndSelect('items.descriptions', 'descriptions')
      .leftJoinAndSelect('invoice.paymentTerms', 'paymentTerms')
      .leftJoinAndSelect('invoice.orders', 'orders')
      .leftJoinAndSelect('invoice.ledgers', 'ledgers');

    if (useVendorPartyOrEmail && vendorByPartyOrEmail) {
      queryBuilder.where(
        vendorByPartyOrEmail.clause,
        vendorByPartyOrEmail.params,
      );
    } else if (vendorId) {
      queryBuilder.where('invoice.vendorId = :vendorId', { vendorId });
    }
    if (search && search.trim() !== '') {
      const searchCond =
        'LOWER(invoice.partyName) LIKE LOWER(:search) OR LOWER(invoice.voucherNo) LIKE LOWER(:search)';
      const searchParam = { search: `%${search}%` };
      if (useVendorPartyOrEmail || vendorId) {
        queryBuilder.andWhere(searchCond, searchParam);
      } else {
        queryBuilder.where(searchCond, searchParam);
      }
    }

    queryBuilder.orderBy('invoice.createdAt', 'DESC');

    const total = await queryBuilder.getCount();
    let rawData = await queryBuilder.skip(skip).take(limitNumber).getMany();
    rawData = this.sortPartyNameFirst(rawData, vendorPartyName);

    return {
      data: rawData,
      total,
      page: pageNumber,
      limit: limitNumber,
      totalPages: Math.ceil(total / limitNumber),
    };
  }

  /** Check if invoice belongs to vendor by vendorId, party name, or email */
  private invoiceBelongsToVendor(
    invoice: SalesInvoiceEntity,
    vendorId?: string,
    vendorPartyName?: string,
    vendorEmail?: string,
  ): boolean {
    if (vendorId && invoice.vendorId === vendorId) return true;
    if (vendorPartyName?.trim() && invoice.partyName?.trim()) {
      if (
        invoice.partyName.trim().toLowerCase() ===
        vendorPartyName.trim().toLowerCase()
      )
        return true;
    }
    if (vendorEmail?.trim()) {
      const email = (invoice.emailId || invoice.eMail || '')
        .trim()
        .toLowerCase();
      if (email === vendorEmail.trim().toLowerCase()) return true;
    }
    return false;
  }

  // Get sales invoice by ID (vendor: can only access own invoice by vendorId, party name, or email)
  // Optional itemPage/itemLimit: paginate items when invoice has many line items
  async findById(
    id: string,
    vendorId?: string,
    vendorPartyName?: string,
    vendorEmail?: string,
    itemPage?: number,
    itemLimit?: number,
  ): Promise<
    | SalesInvoiceEntity
    | {
        invoice: SalesInvoiceEntity;
        itemsMeta: {
          total: number;
          page: number;
          limit: number;
          totalPages: number;
        };
      }
  > {
    const useItemPagination =
      itemPage !== undefined && itemLimit !== undefined && itemLimit > 0;

    let invoice: SalesInvoiceEntity | null;
    if (useItemPagination) {
      invoice = await this.salesInvoiceRepository.findOne({
        where: { id },
        relations: ['paymentTerms', 'orders', 'ledgers'],
      });
    } else {
      invoice = await this.salesInvoiceRepository.findOne({
        where: { id },
        relations: [
          'items',
          'items.descriptions',
          'paymentTerms',
          'orders',
          'ledgers',
        ],
      });
    }

    if (!invoice) {
      throw new NotFoundException(`Sales invoice with ID ${id} not found`);
    }
    const isVendor =
      vendorId !== undefined ||
      vendorPartyName !== undefined ||
      vendorEmail !== undefined;
    if (
      isVendor &&
      !this.invoiceBelongsToVendor(
        invoice,
        vendorId,
        vendorPartyName,
        vendorEmail,
      )
    ) {
      throw new ForbiddenException(
        'You can only view your own sales invoices.',
      );
    }

    if (useItemPagination) {
      const pageNum = Math.max(1, itemPage!);
      const limitNum = Math.min(100, Math.max(1, itemLimit!));
      const skip = (pageNum - 1) * limitNum;

      const [items, total] = await this.salesInvoiceItemRepository.findAndCount(
        {
          where: { salesInvoiceId: id },
          relations: ['descriptions'],
          order: { id: 'ASC' },
          skip,
          take: limitNum,
        },
      );

      invoice.items = items;

      return {
        invoice,
        itemsMeta: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      };
    }

    return invoice;
  }

  // Get sales invoice by voucher number
  async findByVoucherNo(voucherNo: string): Promise<SalesInvoiceEntity | null> {
    return this.salesInvoiceRepository.findOne({
      where: { voucherNo },
      relations: [
        'items',
        'items.descriptions',
        'paymentTerms',
        'orders',
        'ledgers',
      ],
    });
  }

  // Delete sales invoice (vendor: can only delete own by vendorId, party name, or email)
  async delete(
    id: string,
    vendorId?: string,
    vendorPartyName?: string,
    vendorEmail?: string,
  ): Promise<{ message: string }> {
    const result = await this.findById(
      id,
      vendorId,
      vendorPartyName,
      vendorEmail,
    );
    const invoice =
      result && typeof result === 'object' && 'itemsMeta' in result
        ? result.invoice
        : result;
    await this.salesInvoiceRepository.remove(invoice);
    return { message: 'Sales invoice deleted successfully' };
  }

  // Delete multiple sales invoices (vendorId: when provided, only that vendor's invoices)
  async deleteMultiple(
    ids: string[],
    vendorId?: string,
    vendorPartyName?: string,
    vendorEmail?: string,
  ): Promise<{ message: string }> {
    const notFoundIds: string[] = [];

    for (const id of ids) {
      const invoice = await this.salesInvoiceRepository.findOne({
        where: { id },
      });
      if (!invoice) {
        notFoundIds.push(id);
        continue;
      }
      const isVendor =
        vendorId !== undefined ||
        vendorPartyName !== undefined ||
        vendorEmail !== undefined;
      if (
        isVendor &&
        !this.invoiceBelongsToVendor(
          invoice,
          vendorId,
          vendorPartyName,
          vendorEmail,
        )
      ) {
        continue; // skip invoices not belonging to vendor
      }
      await this.salesInvoiceRepository.remove(invoice);
    }

    if (notFoundIds.length > 0) {
      throw new NotFoundException(
        `Sales invoices with IDs ${notFoundIds.join(', ')} not found`,
      );
    }

    return {
      message: `${ids.length - notFoundIds.length} sales invoice(s) deleted successfully`,
    };
  }
}
