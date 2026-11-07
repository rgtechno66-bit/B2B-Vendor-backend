import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { SalesInvoiceService } from './sales-invoice.service';
import { CreateSalesInvoiceVoucherDto } from './sales-invoice.dto';
import { JwtAuthGuard } from '../jwt/jwt-auth.guard';
import { SessionGuard } from '../jwt/session.guard';
import { RolesGuard } from '../jwt/roles.guard';
import { isAdmin } from '../utils/auth.utils';

@Controller('items/sales-invoices')
export class SalesInvoiceController {
  constructor(private readonly salesInvoiceService: SalesInvoiceService) {}

  // Create or update sales invoice from voucher data
  // Updates based on masterId (priority) or id; creates new if neither matches
  @Post()
  async createOrUpdate(
    @Body() createDto: CreateSalesInvoiceVoucherDto,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const result =
        await this.salesInvoiceService.createOrUpdateSalesInvoice(createDto);

      // Determine status code based on action (201 for create, 200 for update)
      const hasUpdates = result.message.includes('updated');
      const statusCode =
        hasUpdates && !result.message.includes('created')
          ? HttpStatus.OK
          : HttpStatus.CREATED;

      res.status(statusCode).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message || 'Failed to create/update sales invoice',
      });
    }
  }

  // Get all sales invoices with pagination. Vendor: own invoices by party name (priority) or email.
  @Get()
  @UseGuards(SessionGuard, JwtAuthGuard)
  async findAll(
    @Req() req: Request,
    @Res() res: Response,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ): Promise<void> {
    try {
      const pageNumber = page ? parseInt(page, 10) : undefined;
      const limitNumber = limit ? parseInt(limit, 10) : undefined;
      const user = req.user as
        | { id?: string; role?: string; name?: string; email?: string }
        | undefined;
      const isVendor = user?.role === 'Vendor';
      const vendorId = isVendor ? user.id : undefined;
      const vendorPartyName = isVendor ? user?.name : undefined;
      const vendorEmail = isVendor ? user?.email : undefined;

      const result = await this.salesInvoiceService.findAll(
        pageNumber,
        limitNumber,
        search,
        vendorId,
        vendorPartyName,
        vendorEmail,
      );

      if (result && typeof result === 'object' && 'data' in result) {
        res.status(HttpStatus.OK).json({ success: true, ...result });
        return;
      }

      res.status(HttpStatus.OK).json({
        success: true,
        data: result,
        total: Array.isArray(result) ? result.length : 0,
      });
    } catch (error: any) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message || 'Failed to fetch sales invoices',
      });
    }
  }

  // Get sales invoice by voucher number (must be before :id)
  @Get('voucher/:voucherNo')
  async findByVoucherNo(
    @Param('voucherNo') voucherNo: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const invoice = await this.salesInvoiceService.findByVoucherNo(voucherNo);
      if (!invoice) {
        res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          message: `Sales invoice with voucher number ${voucherNo} not found`,
        });
        return;
      }
      res.status(HttpStatus.OK).json({
        success: true,
        data: invoice,
      });
    } catch (error: any) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message || 'Failed to fetch sales invoice',
      });
    }
  }

  // Get sales invoice by ID (Vendor can only view own: by vendorId, party name, or email)
  // Optional ?itemPage=1&itemLimit=10 for paginated items (useful when invoice has many line items)
  @Get(':id')
  @UseGuards(SessionGuard, JwtAuthGuard)
  async findById(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
    @Query('itemPage') itemPage?: string,
    @Query('itemLimit') itemLimit?: string,
  ): Promise<void> {
    try {
      const user = req.user as
        | { id?: string; role?: string; name?: string; email?: string }
        | undefined;
      const isVendor = user?.role === 'Vendor';
      const vendorId = isVendor ? user.id : undefined;
      const vendorPartyName = isVendor ? user?.name : undefined;
      const vendorEmail = isVendor ? user?.email : undefined;

      const itemPageNum = itemPage ? parseInt(itemPage, 10) : undefined;
      const itemLimitNum = itemLimit ? parseInt(itemLimit, 10) : undefined;

      const result = await this.salesInvoiceService.findById(
        id,
        vendorId,
        vendorPartyName,
        vendorEmail,
        itemPageNum,
        itemLimitNum,
      );

      if (result && typeof result === 'object' && 'itemsMeta' in result) {
        res.status(HttpStatus.OK).json({
          success: true,
          data: result.invoice,
          itemsMeta: result.itemsMeta,
        });
        return;
      }

      res.status(HttpStatus.OK).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      const status =
        error instanceof Error && error.message.includes('not found')
          ? HttpStatus.NOT_FOUND
          : error?.statusCode === 403
            ? HttpStatus.FORBIDDEN
            : HttpStatus.INTERNAL_SERVER_ERROR;

      res.status(status).json({
        success: false,
        message: error.message || 'Failed to fetch sales invoice',
      });
    }
  }

  // Delete sales invoice (Vendor can only delete own: by vendorId, party name, or email)
  @Delete(':id')
  @UseGuards(SessionGuard, JwtAuthGuard)
  async delete(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const user = req.user as
        | { id?: string; role?: string; name?: string; email?: string }
        | undefined;
      const isVendor = user?.role === 'Vendor';
      const vendorId = isVendor ? user.id : undefined;
      const vendorPartyName = isVendor ? user?.name : undefined;
      const vendorEmail = isVendor ? user?.email : undefined;

      const result = await this.salesInvoiceService.delete(
        id,
        vendorId,
        vendorPartyName,
        vendorEmail,
      );
      res.status(HttpStatus.OK).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      const status =
        error instanceof Error && error.message.includes('not found')
          ? HttpStatus.NOT_FOUND
          : error?.statusCode === 403
            ? HttpStatus.FORBIDDEN
            : HttpStatus.INTERNAL_SERVER_ERROR;

      res.status(status).json({
        success: false,
        message: error.message || 'Failed to delete sales invoice',
      });
    }
  }

  // Invoice sync: upload all order invoice PDFs from Tally path to Cloudinary
  @Post('upload-all-invoices')
  async uploadAllInvoices(@Res() res: Response): Promise<void> {
    try {
      await this.salesInvoiceService.uploadAllInvoices();
      res.status(HttpStatus.OK).json({
        success: true,
        message: 'All invoices uploaded successfully (if files exist).',
      });
    } catch (error: any) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message || 'Failed to upload invoices',
      });
    }
  }

  // Reschedule invoice upload cron job (Admin only)
  @Post('reschedule-invoice-upload-cron')
  @UseGuards(SessionGuard, JwtAuthGuard, RolesGuard)
  async rescheduleInvoiceUploadCron(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const user = req.user;
    if (!isAdmin(user?.role)) {
      throw new NotFoundException('Access denied. Admins only.');
    }
    await this.salesInvoiceService.scheduleCronJob();
    res.status(HttpStatus.OK).json({
      success: true,
      message: 'Invoice upload cron job rescheduled successfully.',
    });
  }

  // Delete multiple sales invoices (Vendor can only delete own)
  @Delete('delete/multiple')
  @UseGuards(SessionGuard, JwtAuthGuard)
  async deleteMultiple(
    @Req() req: Request,
    @Body('ids') ids: string[],
    @Res() res: Response,
  ): Promise<void> {
    try {
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: 'Please provide an array of IDs to delete',
        });
        return;
      }

      const user = req.user as
        | { id?: string; role?: string; name?: string; email?: string }
        | undefined;
      const isVendor = user?.role === 'Vendor';
      const vendorId = isVendor ? user.id : undefined;
      const vendorPartyName = isVendor ? user?.name : undefined;
      const vendorEmail = isVendor ? user?.email : undefined;

      const result = await this.salesInvoiceService.deleteMultiple(
        ids,
        vendorId,
        vendorPartyName,
        vendorEmail,
      );
      res.status(HttpStatus.OK).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      const status =
        error instanceof Error && error.message.includes('not found')
          ? HttpStatus.NOT_FOUND
          : HttpStatus.INTERNAL_SERVER_ERROR;

      res.status(status).json({
        success: false,
        message: error.message || 'Failed to delete sales invoices',
      });
    }
  }
}
