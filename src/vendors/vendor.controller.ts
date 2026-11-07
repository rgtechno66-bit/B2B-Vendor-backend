import {
  Controller,
  HttpStatus,
  Post,
  Get,
  Res,
  Param,
  Delete,
  Body,
  NotFoundException,
  UseGuards,
  Query,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { VendorService } from './vendor.service';
import { JwtAuthGuard } from './../jwt/jwt-auth.guard';
import { SessionGuard } from './../jwt/session.guard';
import { UserEntity, UserRole } from './../user/users.entity';
import { VendorDto } from './../user/users.dto';

@Controller('vendors')
export class VendorController {
  constructor(private readonly vendorService: VendorService) {}

  @Post('/fetch') // Example of fetching and storing vendors
  @UseGuards(SessionGuard, JwtAuthGuard)
  async fetchVendors(@Res() res: Response) {
    try {
      // Start sync in the background
      this.vendorService.fetchAndStoreVendors();

      // Return 202 Accepted immediately
      res.status(HttpStatus.ACCEPTED).json({
        message: 'Vendor sync started. Check status for progress.',
        status: 'started',
      });
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        res.status(HttpStatus.BAD_REQUEST).json({ message: error.message });
        return;
      }
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message:
          error?.message ||
          'An unexpected error occurred while starting vendor sync.',
      });
    }
  }

  // Get vendor sync status
  @Get('/sync-status')
  @UseGuards(SessionGuard, JwtAuthGuard)
  async getVendorSyncStatus(@Res() res: Response) {
    try {
      const status = this.vendorService.getVendorSyncStatus();
      res.status(HttpStatus.OK).json(status);
    } catch (error: any) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: error?.message || 'Failed to get sync status.',
      });
    }
  }

  @Post('/reschedule-cron')
  @UseGuards(SessionGuard, JwtAuthGuard)
  async rescheduleVendorCron(@Res() res: Response) {
    try {
      await this.vendorService.scheduleCronJob();
      res.status(HttpStatus.OK).json({
        message: 'Vendor sync cron job rescheduled successfully.',
      });
    } catch (error: any) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: error?.message || 'Failed to reschedule cron job.',
      });
    }
  }

  @Post('/create-or-update')
  // @UseGuards(SessionGuard, JwtAuthGuard)
  async createOrUpdateVendor(
    @Body() vendorData: VendorDto & { id?: string },
    @Res() response: Response,
  ) {
    try {
      // If ID is provided, update existing vendor
      if (vendorData.id) {
        const updatedVendor = await this.vendorService.update(
          vendorData.id,
          vendorData,
        );
        return response.status(HttpStatus.OK).json({
          message: 'Vendor updated successfully',
          data: updatedVendor,
        });
      } else {
        // If no ID, create new vendor
        const newVendor = await this.vendorService.create(vendorData);
        return response.status(HttpStatus.CREATED).json({
          message: 'Vendor created successfully',
          data: newVendor,
        });
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        return response.status(HttpStatus.NOT_FOUND).json({
          message: error.message,
        });
      }
      if (error instanceof InternalServerErrorException) {
        return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          message: error.message,
        });
      }
      return response.status(HttpStatus.BAD_REQUEST).json({
        message: 'Failed to process request',
      });
    }
  }

  @Get('status-counts') // Get vendor status counts for tabs
  @UseGuards(SessionGuard, JwtAuthGuard)
  async getStatusCounts(@Res() response: Response) {
    const counts = await this.vendorService.getStatusCounts();
    return response.status(HttpStatus.OK).json({
      success: true,
      data: counts,
    });
  }

  @Get('list') // Get only ID, Email, and Alias (Public - No token required)
  async getVendorList(@Res() response: Response) {
    const vendors = (await this.vendorService.findAll()) as UserEntity[];
    const vendorList = vendors
      .filter((vendor) => vendor.role === UserRole.Vendor && !vendor.isDeleted)
      .map((vendor) => ({
        id: vendor.id,
        email: vendor.email,
        alias: vendor.alias || null,
      }));
    return response.status(HttpStatus.OK).json({
      length: vendorList.length,
      data: vendorList,
    });
  }

  @Get() // Get all vendors (with optional pagination)
  @UseGuards(SessionGuard, JwtAuthGuard)
  async findAll(
    @Res() response: Response,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : undefined;
    const limitNumber = limit ? parseInt(limit, 10) : undefined;

    const result = await this.vendorService.findAll(
      pageNumber,
      limitNumber,
      search,
      status,
    );

    // If paginated (result is object with data property)
    if (result && typeof result === 'object' && 'data' in result) {
      return response.status(HttpStatus.OK).json({
        success: true,
        ...result,
      });
    }

    // If all vendors (result is array) - backward compatible
    return response.status(HttpStatus.OK).json({
      length: (result as UserEntity[]).length,
      data: result,
    });
  }

  @Get(':id') // Get vendor by ID
  @UseGuards(SessionGuard, JwtAuthGuard)
  async getById(@Param('id') id: string, @Res() response: Response) {
    const vendor = await this.vendorService.findById(id);
    if (!vendor) {
      return response.status(HttpStatus.NOT_FOUND).json({
        message: 'Vendor not found',
      });
    }
    return response.status(HttpStatus.OK).json({
      data: vendor,
    });
  }

  @Delete('delete/:id')
  @UseGuards(SessionGuard, JwtAuthGuard)
  async delete(@Param('id') id: string): Promise<{ message: string }> {
    await this.vendorService.delete(id); // Call the delete method from the service
    return {
      message: `Vendor deleted successfully`, // Success message
    };
  }

  @Delete('delete/vendors/all')
  @UseGuards(SessionGuard, JwtAuthGuard)
  async deleteMultiple(@Body('ids') ids: string[], @Res() response: Response) {
    try {
      const result = await this.vendorService.deleteMultiple(ids);

      // Return appropriate status based on the result
      if (result.notFoundIds && result.notFoundIds.length > 0) {
        // Partial success - some vendors not found
        return response.status(HttpStatus.PARTIAL_CONTENT).json({
          success: true,
          ...result,
        });
      }

      // Complete success
      return response.status(HttpStatus.OK).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      // Handle the error appropriately
      if (error instanceof NotFoundException) {
        return response.status(HttpStatus.NOT_FOUND).json({
          success: false,
          message: error.message,
        });
      }
      if (error.name === 'BadRequestException') {
        return response.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: error.message,
        });
      }
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'An error occurred while deleting the vendors.',
      });
    }
  }
}
