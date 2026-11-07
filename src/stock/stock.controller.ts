// stock.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  NotFoundException,
  Post,
  Res,
  UseGuards,
  Query,
} from '@nestjs/common';
import { StockService } from './stock.service';
import { Response } from 'express';
import { StockEntity } from './stock.entity';
import { JwtAuthGuard } from './../jwt/jwt-auth.guard';
import { SessionGuard } from './../jwt/session.guard';

@Controller('stocks')
@UseGuards(SessionGuard, JwtAuthGuard)
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Post('/fetch-summary')
  async fetchStockSummary(@Res() res: Response) {
    try {
      // Start sync in the background
      this.stockService.fetchAndStoreStockSummary();

      // Return 202 Accepted immediately
      res.status(HttpStatus.ACCEPTED).json({
        message: 'Stock sync started. Check status for progress.',
        status: 'started',
      });
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        res.status(error.getStatus()).json({ message: error.message });
        return;
      }
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message:
          error?.message ||
          'An unexpected error occurred while starting stock sync.',
      });
    }
  }

  @Get('/sync-status')
  getStockSyncStatus() {
    return this.stockService.getStockSyncStatus();
  }

  @Post('/reschedule-cron')
  async rescheduleStockCron(@Res() res: Response) {
    try {
      await this.stockService.scheduleCronJob();
      res.status(HttpStatus.OK).json({
        message: 'Stock Summary cron job rescheduled successfully.',
      });
    } catch (error: any) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: error?.message || 'Failed to reschedule cron job.',
      });
    }
  }

  @Get() // Get all stocks (with optional pagination and search only)
  async findAll(
    @Res() response: Response,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : undefined;
    const limitNumber = limit ? parseInt(limit, 10) : undefined;

    const result = await this.stockService.findAll(
      pageNumber,
      limitNumber,
      search,
    );

    // If paginated (result is object with data property)
    if (result && typeof result === 'object' && 'data' in result) {
      return response.status(HttpStatus.OK).json({
        success: true,
        ...result,
      });
    }

    // If all stocks (result is array) - backward compatible
    return response.status(HttpStatus.OK).json({
      length: (result as StockEntity[]).length,
      data: result,
    });
  }

  @Delete('/delete-selected') // Delete selected stocks by IDs
  async deleteSelected(@Body() ids: string[], @Res() response: Response) {
    try {
      await this.stockService.deleteSelected(ids); // Call deleteSelected service method
      return response.status(HttpStatus.OK).json({
        message: `${ids.length} stocks have been deleted successfully`,
      });
    } catch (error: any) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: 'Failed to delete selected stocks',
        error: error.message,
      });
    }
  }

  @Delete('/delete/stocks/all') // Delete selected stocks by IDs
  async deleteMultiple(@Body('ids') ids: string[], @Res() response: Response) {
    try {
      const result = await this.stockService.deleteMultiple(ids);
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
}
