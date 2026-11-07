// invoice-retry.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice, InvoiceStatus } from './invoice.entity';
import axios from 'axios';
import { SyncControlSettings } from './../settings/setting.entity';
import { Cron } from '@nestjs/schedule';
import { SyncLogEntity, SyncLogStatus } from './../sync-log/sync-log.entity';

@Injectable()
export class InvoiceRetryService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,

    @InjectRepository(SyncLogEntity)
    private readonly syncLogRepository: Repository<SyncLogEntity>,

    @InjectRepository(SyncControlSettings)
    private readonly syncControlSettingsRepository: Repository<SyncControlSettings>,
  ) {}

  private extractLineError(responseData: string): string | null {
    const lineErrorMatch = responseData.match(
      /<LINEERROR>([\s\S]*?)<\/LINEERROR>/,
    );
    if (lineErrorMatch && lineErrorMatch[1]) {
      // Decode HTML entities
      const errorMessage = lineErrorMatch[1]
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
      return errorMessage;
    }
    return null;
  }

  async postPendingInvoices(
    userId: string,
  ): Promise<{ status: string; message: string }> {
    const pendingInvoices = await this.invoiceRepository.find({
      where: {
        status: InvoiceStatus.PENDING,
        userId: userId,
      },
    });
    // Check if "Manual Sync" is enabled
    const SyncSetting = await this.syncControlSettingsRepository.findOne({
      where: { moduleName: 'Orders' },
    });

    if (!SyncSetting || !SyncSetting.isManualSyncEnabled) {
      throw new BadRequestException('Manual Sync for Invoice is disabled.');
    }

    if (pendingInvoices.length === 0) {
      return {
        status: 'success',
        message: 'All data is up to date.',
      };
    }
    for (const invoice of pendingInvoices) {
      try {
        const response = await axios.post(
          process.env.TALLY_URL as string,
          invoice.xmlContent,
          {
            headers: { 'Content-Type': 'application/xml' },
          },
        );
        console.log(response.data);
        if (response.data.includes('<LINEERROR>')) {
          // Extract the actual LINEERROR message
          const lineError = this.extractLineError(response.data);
          const errorMessage = lineError
            ? `${lineError}`
            : 'Some invoices could not be posted. Please log in to Tally or check sync logs for more details.';

          return {
            status: 'partial_success',
            message: errorMessage,
          };
        }

        // Delete the invoice from the database after successful posting
        await this.invoiceRepository.delete(invoice.id);
      } catch (error) {
        console.log(error);
        return {
          status: 'error',
          message:
            'Please ensure Tally is open and accessible, then try again.',
        };
      }
    }
    return {
      status: 'success',
      message: 'All pending invoices have been successfully posted to Tally.',
    };
  }

  @Cron('*/5 * * * *') // i want to run this every 5 minutes
  async retryPendingInvoices(
    userId: string,
  ): Promise<{ status: string; message: string }> {
    console.log('invoice executed at:', new Date().toISOString());

    // Check if "Auto Sync" is enabled
    const SyncSetting = await this.syncControlSettingsRepository.findOne({
      where: { moduleName: 'Orders' },
    });

    if (!SyncSetting || !SyncSetting.isAutoSyncEnabled) {
      throw new BadRequestException('Auto Sync for Orders is disabled.');
    }
    const pendingInvoices = await this.invoiceRepository.find({
      where: {
        status: InvoiceStatus.PENDING,
        userId: userId,
      },
    });

    if (pendingInvoices.length === 0) {
      await this.syncLogRepository.save({
        sync_type: 'Invoices',
        status: SyncLogStatus.SUCCESS,
      });
      return {
        status: 'success',
        message: 'All data is up to date.',
      };
    }

    for (const invoice of pendingInvoices) {
      try {
        const response = await axios.post(
          process.env.TALLY_URL as string,
          invoice.xmlContent,
          {
            headers: { 'Content-Type': 'application/xml' },
          },
        );

        if (response.data.includes('<LINEERROR>')) {
          // Extract the actual LINEERROR message
          const lineError = this.extractLineError(response.data);
          const errorMessage = lineError
            ? `${lineError}`
            : 'Some invoices could not be posted. Please log in to Tally or check sync logs for more details.';

          await this.syncLogRepository.save({
            sync_type: 'Invoices',
            status: SyncLogStatus.FAIL,
          });

          return {
            status: 'partial_success',
            message: errorMessage,
          };
        }
        // Delete the invoice from the database after successful posting
        await this.invoiceRepository.delete(invoice.id);
      } catch (error) {
        await this.syncLogRepository.save({
          sync_type: 'Invoices',
          status: SyncLogStatus.FAIL,
        });
        return {
          status: 'error',
          message:
            'Please ensure Tally is open and accessible, then try again.',
        };
      }
    }

    await this.syncLogRepository.save({
      sync_type: 'Invoices',
      status: SyncLogStatus.SUCCESS,
    });
    return {
      status: 'success',
      message: 'All pending invoices have been successfully posted to Tally.',
    };
  }
}
