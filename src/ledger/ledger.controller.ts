import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
  Query,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { LedgerService } from './ledger.service';
import { LedgerEntity, LedgerStatementEntity } from './ledger.entity';
import { JwtAuthGuard } from './../jwt/jwt-auth.guard';
import { RolesGuard } from './../jwt/roles.guard';
import { isAdmin, isVendor } from './../utils/auth.utils';
import { SessionGuard } from './../jwt/session.guard';

@Controller('ledgers')
@UseGuards(SessionGuard, JwtAuthGuard)
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Post('/receivable/fetch')
  async fetchLedgers(@Res() res: Response): Promise<void> {
    try {
      // Start sync asynchronously (don't wait for completion)
      this.ledgerService.fetchAndStoreLedgers().catch((error) => {
        // Error is already handled in the service, just log it
        console.error('Receivable sync error:', error);
      });

      // Return immediately with status
      res.status(HttpStatus.ACCEPTED).json({
        message:
          'Sync started successfully. Please check status endpoint for progress.',
        status: 'processing',
      });
    } catch (error: any) {
      if (error instanceof HttpException) {
        res.status(error.getStatus()).json({ message: error.message });
        return;
      }
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message:
          error?.message || 'An unexpected error occurred while starting sync.',
      });
    }
  }

  // Get receivable sync status
  @Get('/receivable/sync-status')
  async getReceivableSyncStatus(@Res() res: Response): Promise<void> {
    try {
      const status = this.ledgerService.getReceivableSyncStatus();
      res.status(HttpStatus.OK).json(status);
    } catch (error: any) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: error?.message || 'Failed to get sync status.',
      });
    }
  }

  @Post('/receivable/reschedule-cron')
  async rescheduleReceivableCron(@Res() res: Response): Promise<void> {
    try {
      await this.ledgerService.scheduleReceivableCronJob();
      res.status(HttpStatus.OK).json({
        message: 'Outstanding Receivable cron job rescheduled successfully.',
      });
    } catch (error: any) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: error?.message || 'Failed to reschedule cron job.',
      });
    }
  }

  @Get('/receivable')
  async findAll(
    @Req() req: Request,
    @Res() res: Response,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ): Promise<Response> {
    const user = req.user;
    const userRole = user?.role;
    const userName = user?.name;

    try {
      const pageNumber = page ? parseInt(page, 10) : undefined;
      const limitNumber = limit ? parseInt(limit, 10) : undefined;

      if (isAdmin(userRole)) {
        const result = await this.ledgerService.findAll(
          pageNumber,
          limitNumber,
          search,
        );

        if (result && typeof result === 'object' && 'data' in result) {
          return res.status(HttpStatus.OK).json({ success: true, ...result });
        }
        return res.status(HttpStatus.OK).json({ data: result });
      }

      if (isVendor(userRole) && userName) {
        const ledgers =
          await this.ledgerService.findAllDataByUserName(userName);
        return res.status(HttpStatus.OK).json({ data: ledgers });
      }

      return res
        .status(HttpStatus.FORBIDDEN)
        .json({ message: 'Unauthorized access' });
    } catch (error: any) {
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  }

  @Get('/receivable/:id')
  async findById(@Param('id') id: string, @Res() response: Response) {
    const ledger = await this.ledgerService.findById(id);
    if (!ledger) {
      throw new NotFoundException('Ledger not found');
    }
    return response.status(200).json({ data: ledger });
  }

  @Delete('/receivable/:id')
  async deleteById(@Param('id') id: string, @Res() response: Response) {
    const deleted = await this.ledgerService.deleteById(id);
    if (!deleted) {
      throw new NotFoundException('Ledger not found');
    }
    return response
      .status(200)
      .json({ message: 'Ledger deleted successfully.' });
  }

  @Delete('delete/all')
  async deleteMultiple(@Body('ids') ids: string[], @Res() response: Response) {
    try {
      const result = await this.ledgerService.deleteMultiple(ids);
      return response.status(HttpStatus.OK).json(result);
    } catch (error) {
      // Handle the error appropriately
      if (error instanceof NotFoundException) {
        return response
          .status(HttpStatus.NOT_FOUND)
          .json({ message: error.message });
      }
      return response
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: 'An error occurred while deleting the data.' });
    }
  }

  // Fetch data from Tally and store in the database
  @Post('/fetch')
  async fetchAndStoreLedgers(@Res() res: Response): Promise<void> {
    try {
      // Start sync asynchronously (don't wait for completion)
      this.ledgerService.fetchAndLedgers().catch((error) => {
        // Error is already handled in the service, just log it
        console.error('Sync error:', error);
      });

      // Return immediately with status
      res.status(HttpStatus.ACCEPTED).json({
        message:
          'Sync started successfully. Please check status endpoint for progress.',
        status: 'processing',
      });
    } catch (error: any) {
      if (error instanceof HttpException) {
        res.status(error.getStatus()).json({ message: error.message });
        return;
      }
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message:
          error?.message || 'An unexpected error occurred while starting sync.',
      });
    }
  }

  // Get sync status
  @Get('/sync-status')
  async getSyncStatus(@Res() res: Response): Promise<void> {
    try {
      const status = this.ledgerService.getLedgerSyncStatus();
      res.status(HttpStatus.OK).json(status);
    } catch (error: any) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: error?.message || 'Failed to get sync status.',
      });
    }
  }

  @Post('/reschedule-cron')
  async rescheduleLedgerCron(@Res() res: Response): Promise<void> {
    try {
      await this.ledgerService.scheduleLedgerCronJob();
      res.status(HttpStatus.OK).json({
        message: 'Ledger Statement cron job rescheduled successfully.',
      });
    } catch (error: any) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: error?.message || 'Failed to reschedule cron job.',
      });
    }
  }

  // Retrieve all ledger statements with pagination
  @Get('/get-all')
  async findLedgerAll(
    @Req() req: Request,
    @Res() res: Response,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ): Promise<Response> {
    const user = req.user;
    const userRole = user?.role;
    const userName = user?.name;

    try {
      const pageNumber = page ? parseInt(page, 10) : undefined;
      const limitNumber = limit ? parseInt(limit, 10) : undefined;

      if (isAdmin(userRole)) {
        const result = await this.ledgerService.findLedgerData(
          pageNumber,
          limitNumber,
          search,
        );

        if (result && typeof result === 'object' && 'data' in result) {
          return res.status(HttpStatus.OK).json({ success: true, ...result });
        }
        return res.status(HttpStatus.OK).json({ data: result });
      }

      if (isVendor(userRole) && userName) {
        const statements =
          await this.ledgerService.findLedgerDataByUserName(userName);
        return res.status(HttpStatus.OK).json({ data: statements });
      }

      return res
        .status(HttpStatus.FORBIDDEN)
        .json({ message: 'Unauthorized access' });
    } catch (error: any) {
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  }

  // Retrieve a specific ledger statement by ID
  @Get('/get/:id')
  async findByIdLedger(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const statement = await this.ledgerService.findByIdLedgerData(id);
      res.status(HttpStatus.OK).json({ data: statement });
    } catch (error: any) {
      if (error instanceof HttpException) {
        res.status(error.getStatus()).json({ message: error.message });
      } else {
        res
          .status(HttpStatus.INTERNAL_SERVER_ERROR)
          .json({ message: error.message });
      }
    }
  }
}
