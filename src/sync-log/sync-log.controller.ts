import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Query,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { SyncLogService } from './sync-log.service';
import { CreateSyncLogDto } from './create-sync-log.dto';
import { SyncLogEntity } from './sync-log.entity';
import { JwtAuthGuard } from './../jwt/jwt-auth.guard';
import { SessionGuard } from './../jwt/session.guard';

@Controller('sync-log')
@UseGuards(SessionGuard, JwtAuthGuard)
export class SyncLogController {
  constructor(private readonly syncLogService: SyncLogService) {}

  // Create a new sync log
  @Post()
  async createSyncLog(
    @Body() createSyncLogDto: CreateSyncLogDto,
  ): Promise<SyncLogEntity> {
    return this.syncLogService.createSyncLog(createSyncLogDto);
  }

  // Get all sync logs with pagination, search, and filtering
  @Get()
  async getAllSyncLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Res() response?: Response,
  ) {
    const pageNumber = page ? parseInt(page, 10) : undefined;
    const limitNumber = limit ? parseInt(limit, 10) : undefined;

    const result = await this.syncLogService.getAllSyncLogs(
      pageNumber,
      limitNumber,
      search,
      status,
    );

    if (response) {
      return response.status(HttpStatus.OK).json(result);
    }
    return result;
  }

  // Get status counts for tabs
  @Get('status-counts')
  async getStatusCounts(@Res() response: Response) {
    const counts = await this.syncLogService.getStatusCounts();
    return response.status(HttpStatus.OK).json(counts);
  }
}
