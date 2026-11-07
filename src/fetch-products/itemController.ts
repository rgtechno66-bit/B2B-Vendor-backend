import {
  Controller,
  HttpStatus,
  Post,
  Get,
  Res,
  Param,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
  Delete,
  Body,
  NotFoundException,
  UseGuards,
  Put,
  InternalServerErrorException,
  Query,
} from '@nestjs/common';
import { Response } from 'express'; // Import Response from express
import { ItemService } from './item.service';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ItemEntity } from './item.entity';
import { ItemDto } from './item.dto';

@Controller('items')
export class ItemController {
  constructor(private readonly itemService: ItemService) {}

  // Only for telly

  @Post('create')
  async create(@Body() createItemDto: ItemDto, @Res() response: Response) {
    try {
      const newItem = await this.itemService.create(createItemDto);
      return response.status(HttpStatus.CREATED).json({
        message: 'Item created successfully',
        data: newItem,
      });
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          message: error.message,
        });
      }
      return response.status(HttpStatus.BAD_REQUEST).json({
        message: 'Failed to create item',
      });
    }
  }

  @Put('update-prod/:id')
  async update(
    @Param('id') id: string,
    @Body() updateItemDto: ItemDto,
    @Res() response: Response,
  ) {
    try {
      const updatedItem = await this.itemService.update(id, updateItemDto);
      return response.status(HttpStatus.OK).json({
        message: 'Item updated successfully',
        data: updatedItem,
      });
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
        message: 'Failed to update item',
      });
    }
  }

  /**
   * Bulk update product totalSalesAmount (for Top Hot Products ranking).
   * Body: { data: [ { masterID, itemName, totalSalesAmount }, ... ] }
   * Also accepts a single object for backward compatibility.
   * Tolerates alternate keys: MasterID, MASTERID, nxItemCode, ITEMNAME, salesAmount, etc.
   */
  @Post('update-total-sales-amount')
  async updateTotalSalesAmount(@Body() body: any, @Res() response: Response) {
    try {
      let rawRows: any[] = [];

      if (Array.isArray(body?.data)) {
        rawRows = body.data;
      } else if (Array.isArray(body)) {
        rawRows = body;
      } else if (body && typeof body === 'object') {
        rawRows = [body];
      }

      // If client nested as { data: [ { data: [...] } ] }, flatten one level
      if (
        rawRows.length === 1 &&
        Array.isArray(rawRows[0]?.data) &&
        !rawRows[0]?.masterID &&
        !rawRows[0]?.itemName
      ) {
        rawRows = rawRows[0].data;
      }

      const rows = rawRows.map((row) => this.normalizeSalesAmountRow(row));

      console.log(
        `📦 update-total-sales-amount | rows=${rows.length} | sampleKeys=${JSON.stringify(
          Object.keys(rawRows[0] || {}),
        )} | sample=${JSON.stringify(rows[0] || {})}`,
      );

      if (!rows.length) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: 'data must be a non-empty array',
        });
      }

      const result = await this.itemService.updateTotalSalesAmountBulk(rows);
      return response.status(HttpStatus.OK).json({
        message: 'totalSalesAmount update completed',
        updatedCount: result.updated.length,
        failedCount: result.failed.length,
        data: result.updated,
        failed: result.failed,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        return response.status(HttpStatus.NOT_FOUND).json({
          message: error.message,
        });
      }
      if (error instanceof BadRequestException) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: error.message,
        });
      }
      if (error instanceof InternalServerErrorException) {
        return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          message: error.message,
        });
      }
      return response.status(HttpStatus.BAD_REQUEST).json({
        message: 'Failed to update totalSalesAmount',
      });
    }
  }

  /** Map alternate / Tally-style keys to masterID, itemName, totalSalesAmount */
  private normalizeSalesAmountRow(row: any): {
    masterID?: string;
    itemName?: string;
    totalSalesAmount: number;
  } {
    if (!row || typeof row !== 'object') {
      return { totalSalesAmount: NaN };
    }

    const masterID =
      row.masterID ??
      row.masterId ??
      row.MasterID ??
      row.MASTERID ??
      row.nxItemCode ??
      row.nxitemcode ??
      row.NXITEMCODE ??
      row.MasterId;

    const itemName =
      row.itemName ??
      row.ItemName ??
      row.ITEMNAME ??
      row.item_name ??
      row.name ??
      row.productName ??
      row.ProductName;

    const totalSalesAmount =
      row.totalSalesAmount ??
      row.TotalSalesAmount ??
      row.TOTALSALESAMOUNT ??
      row.salesAmount ??
      row.SalesAmount ??
      row.amount ??
      row.Amount;

    return {
      masterID:
        masterID != null && String(masterID).trim() !== ''
          ? String(masterID).trim()
          : undefined,
      itemName:
        itemName != null && String(itemName).trim() !== ''
          ? String(itemName).trim()
          : undefined,
      totalSalesAmount: Number(totalSalesAmount),
    };
  }

  @Post('/fetch')
  async fetchItems(@Res() res: Response) {
    try {
      // Start product sync in the background (same as vendor/stock)
      this.itemService.fetchAndStoreItems().catch(() => {});
      return res.status(HttpStatus.ACCEPTED).json({
        message: 'Product sync started. Check status for progress.',
        status: 'started',
      });
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return res
          .status(HttpStatus.BAD_REQUEST)
          .json({ message: error.message });
      }
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message:
          error?.message ||
          'An unexpected error occurred while starting product sync.',
      });
    }
  }

  @Get('/sync-status')
  getProductSyncStatus(@Res() res: Response) {
    try {
      const status = this.itemService.getProductSyncStatus();
      return res.status(HttpStatus.OK).json(status);
    } catch (error: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: error?.message || 'Failed to get product sync status.',
      });
    }
  }

  @Post('/assign-master-id')
  async assignMasterID(@Res() response: Response) {
    try {
      const result = await this.itemService.assignMasterIDToExistingProducts();
      return response.status(HttpStatus.OK).json({
        success: true,
        ...result,
      });
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          message: error.message,
        });
      }
      return response.status(HttpStatus.BAD_REQUEST).json({
        message: 'Failed to assign masterID',
      });
    }
  }

  /**
   * Helper function to convert string values to their proper types
   * Converts number and float fields from string to number
   */
  private convertStringToTypes(
    data: any,
  ): ItemDto & { id?: string; masterID?: string } {
    const converted: any = { ...data };

    // Convert integer fields
    if (
      converted.stdPkg !== undefined &&
      typeof converted.stdPkg === 'string'
    ) {
      converted.stdPkg = parseInt(converted.stdPkg, 10) || 0;
    }
    if (
      converted.stdWeight !== undefined &&
      typeof converted.stdWeight === 'string'
    ) {
      converted.stdWeight = parseInt(converted.stdWeight, 10) || 0;
    }
    if (
      converted.denominator !== undefined &&
      typeof converted.denominator === 'string'
    ) {
      converted.denominator = parseInt(converted.denominator, 10) || 1;
    }
    if (
      converted.popularity !== undefined &&
      typeof converted.popularity === 'string'
    ) {
      converted.popularity = parseInt(converted.popularity, 10) || 1;
    }

    // Convert float fields
    if (
      converted.sellingPrice !== undefined &&
      typeof converted.sellingPrice === 'string'
    ) {
      converted.sellingPrice = parseFloat(converted.sellingPrice) || 0;
    }
    if (
      converted.gstRate !== undefined &&
      typeof converted.gstRate === 'string'
    ) {
      converted.gstRate = parseFloat(converted.gstRate) || 0;
    }

    return converted;
  }

  @Post('/create-or-update')
  async createOrUpdateProduct(
    @Body() productData: ItemDto & { id?: string; masterID?: string },
    @Res() response: Response,
  ) {
    try {
      // Convert string values to proper types
      const convertedData = this.convertStringToTypes(productData);

      // If ID is provided, update existing product by ID
      if (convertedData.id) {
        const { id, ...updateData } = convertedData;
        const updatedProduct = await this.itemService.update(id, updateData);
        return response.status(HttpStatus.OK).json({
          message: 'Product updated successfully',
          data: updatedProduct,
        });
      }
      // If masterID is provided, update existing product by masterID
      else if (convertedData.masterID) {
        const { masterID, ...updateData } = convertedData;
        const updatedProduct = await this.itemService.updateByMasterID(
          masterID,
          updateData,
        );
        return response.status(HttpStatus.OK).json({
          message: 'Product updated successfully',
          data: updatedProduct,
        });
      } else {
        // If no ID or masterID, create new product
        const newProduct = await this.itemService.create(convertedData);
        return response.status(HttpStatus.CREATED).json({
          message: 'Product created successfully',
          data: newProduct,
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
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  @Get('list') // Get only ID, Name, and masterID
  async getProductList(@Res() response: Response) {
    const items = (await this.itemService.findAll()) as ItemEntity[];
    const productList = items.map((item) => ({
      id: item.id,
      itemName: item.itemName,
      masterID: item.masterID,
    }));
    return response.status(HttpStatus.OK).json({
      length: productList.length,
      data: productList,
    });
  }

  @Get() // Get all items (with optional pagination and filters)
  async findAll(
    @Res() response: Response,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('subGroup1') subGroup1?: string | string[],
    @Query('subGroup2') subGroup2?: string | string[],
    @Query('sortBy') sortBy?: string,
  ) {
    // Parse query params
    const pageNumber = page ? parseInt(page, 10) : undefined;
    const limitNumber = limit ? parseInt(limit, 10) : undefined;

    // Handle array query params (can be string or array)
    const subGroup1Array = Array.isArray(subGroup1)
      ? subGroup1
      : subGroup1
        ? [subGroup1]
        : undefined;

    const subGroup2Array = Array.isArray(subGroup2)
      ? subGroup2
      : subGroup2
        ? [subGroup2]
        : undefined;

    const result = await this.itemService.findAll(
      pageNumber,
      limitNumber,
      search,
      subGroup1Array,
      subGroup2Array,
      sortBy,
    );

    // If paginated (result is object with data property)
    if (result && typeof result === 'object' && 'data' in result) {
      return response.status(HttpStatus.OK).json({
        success: true,
        ...result,
      });
    }

    // If all items (result is array) - backward compatible
    return response.status(HttpStatus.OK).json({
      length: (result as ItemEntity[]).length,
      data: result,
    });
  }

  @Get('category-listing') // Lightweight category + subcategory list (id & name only)
  async getCategoryListing(@Res() response: Response) {
    const data = await this.itemService.getCategoryListing();
    return response.status(HttpStatus.OK).json({
      success: true,
      data,
      length: data.length,
    });
  }

  @Get('subgroup1-options') // Get all subGroup1 options
  async getAllSubGroup1Options(@Res() response: Response) {
    const options = await this.itemService.getAllSubGroup1Options();

    return response.status(HttpStatus.OK).json({
      success: true,
      data: options,
    });
  }

  @Get('subgroup2-options') // Get subGroup2 options based on subGroup1
  async getSubGroup2Options(
    @Query('subGroup1') subGroup1: string | string[],
    @Res() response: Response,
  ) {
    // Handle array query params
    const subGroup1Array = Array.isArray(subGroup1)
      ? subGroup1
      : subGroup1
        ? [subGroup1]
        : [];

    const options = await this.itemService.getSubGroup2Options(subGroup1Array);

    return response.status(HttpStatus.OK).json({
      success: true,
      data: options,
    });
  }

  @Get('popularity') // Get all items
  async findPopularity(@Res() response: Response) {
    const items = await this.itemService.findAllPopularity();
    return response.status(HttpStatus.OK).json({
      length: items.length,
      data: items,
    });
  }

  @Get('get/:id') // Get item by ID
  async getById(@Param('id') id: string, @Res() response: Response) {
    const item = await this.itemService.findById(id);
    if (!item) {
      return response.status(HttpStatus.NOT_FOUND).json({
        message: 'Item not found',
      });
    }
    return response.status(HttpStatus.OK).json({
      data: item,
    });
  }

  @Post('/upload-files/:id')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'productImages', maxCount: 20 },
        { name: 'dimensionalFiles', maxCount: 20 },
      ],
      {
        limits: {
          fileSize: 10 * 1024 * 1024, // 10MB limit
          files: 20, // Total files limit
        },
      },
    ),
  )
  async uploadFiles(
    @Param('id') id: string,
    @UploadedFiles()
    files: {
      productImages?: Express.Multer.File[];
      dimensionalFiles?: Express.Multer.File[];
    },
    @Body('applyToAllProductImages') applyToAllProductImages: string, // Separate option for images
    @Body('applyToAllDimensionalFiles') applyToAllDimensionalFiles: string, // Separate option for dimensional files
  ) {
    // Convert apply options to booleans
    const shouldApplyToAllProductImages = applyToAllProductImages === 'true';
    const shouldApplyToAllDimensionalFiles =
      applyToAllDimensionalFiles === 'true';

    // Provide default empty arrays if undefined
    const productImages: Express.Multer.File[] = files.productImages || [];
    const dimensionalFiles: Express.Multer.File[] =
      files.dimensionalFiles || [];

    return await this.itemService.uploadFilesToCloudinary(
      id,
      productImages,
      dimensionalFiles,
      shouldApplyToAllProductImages,
      shouldApplyToAllDimensionalFiles,
    );
  }

  /** (For only Tally )POST delete product by id or masterID (query params: ?id=... or ?masterID=...) */
  @Post('delete')
  async deleteProduct(
    @Body() body: { id?: string; masterID?: string },
    @Res() response: Response,
  ) {
    try {
      if (body.id) {
        const result = await this.itemService.delete(body.id);
        return response.status(HttpStatus.OK).json(result);
      }
      if (body.masterID != null && String(body.masterID).trim() !== '') {
        const result = await this.itemService.deleteByMasterID(
          String(body.masterID).trim(),
        );
        return response.status(HttpStatus.OK).json(result);
      }
      return response.status(HttpStatus.BAD_REQUEST).json({
        message: 'Provide either id or masterID in the request body',
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        return response
          .status(HttpStatus.NOT_FOUND)
          .json({ message: error.message });
      }
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message:
          error instanceof Error
            ? error.message
            : 'An error occurred while deleting the product.',
      });
    }
  }

  // Product delete
  @Delete('delete/item/:id')
  async delete(@Param('id') id: string, @Res() response: Response) {
    try {
      const result = await this.itemService.delete(id);
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
        .json({ message: 'An error occurred while deleting the product.' });
    }
  }

  //  all image Delete
  @Delete('delete/:id')
  async deleteImages(
    @Param('id') itemId: string,
    @Body()
    imagesToDelete: { productImages?: string[]; dimensionalFiles?: string[] },
  ): Promise<ItemEntity> {
    return this.itemService.deleteImages(itemId, imagesToDelete);
  }

  // all product delete
  @Delete('delete/items/all')
  async deleteMultiple(@Body('ids') ids: string[], @Res() response: Response) {
    try {
      const result = await this.itemService.deleteMultiple(ids);
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
        .json({ message: 'An error occurred while deleting the products.' });
    }
  }
}
