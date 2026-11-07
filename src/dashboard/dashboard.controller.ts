// dashboard.controller.ts
import {
  Controller,
  Get,
  InternalServerErrorException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { SessionGuard } from './../jwt/session.guard';
import { JwtAuthGuard } from './../jwt/jwt-auth.guard';

@Controller('dashboard')
// @UseGuards(SessionGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('data')
  async getDashboardData() {
    try {
      return await this.dashboardService.getDashboardData();
    } catch (error: any) {
      // Log error for debugging
      console.error('Dashboard controller error:', error);

      // If error is already an HttpException, rethrow it
      if (error?.response) {
        throw error;
      }

      // Otherwise, create a new error with the message
      const errorMessage = error?.message || 'Failed to fetch dashboard data';
      throw new InternalServerErrorException({
        message: errorMessage,
        error: 'Internal Server Error',
      });
    }
  }

  @Get('top-selling-products')
  async getTopSellingProducts(@Query('limit') limit?: string) {
    try {
      const limitNum = limit ? Math.min(parseInt(limit, 10) || 12, 50) : 12;
      return await this.dashboardService.getTopSellingProducts(limitNum);
    } catch (error: any) {
      console.error('Top selling products controller error:', error);
      if (error?.response) throw error;
      const errorMessage =
        error?.message || 'Failed to fetch top selling products';
      throw new InternalServerErrorException({
        message: errorMessage,
        error: 'Internal Server Error',
      });
    }
  }
}
