import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Put,
  Delete,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFiles,
  UseGuards,
  HttpStatus,
  HttpCode,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { BankAccountService } from './payment.service';
import { BankAccountDto, BankAccountResponseDto } from './payment.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from './../jwt/jwt-auth.guard';
import { SessionGuard } from './../jwt/session.guard';

@Controller('bank-accounts')
@UseGuards(SessionGuard, JwtAuthGuard)
export class BankAccountController {
  constructor(private readonly bankAccountService: BankAccountService) {}

  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FilesInterceptor('qrCodeImageUrl', 10))
  async createBankAccount(
    @Body() dto: BankAccountDto,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<BankAccountResponseDto> {
    return this.bankAccountService.createBankAccount(dto, files);
  }

  @Get('get')
  @HttpCode(HttpStatus.OK)
  async getAllBankAccounts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Res() response?: Response,
  ) {
    const pageNumber = page ? parseInt(page, 10) : undefined;
    const limitNumber = limit ? parseInt(limit, 10) : undefined;

    const result = await this.bankAccountService.getAllBankAccounts(
      pageNumber,
      limitNumber,
      search,
    );

    if (response) {
      return response.status(HttpStatus.OK).json(result);
    }
    return result;
  }

  @Get('get/:id')
  @HttpCode(HttpStatus.OK)
  async getBankAccountDetails(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BankAccountResponseDto> {
    return this.bankAccountService.getBankAccountDetails(id);
  }

  @Put('update/:id')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FilesInterceptor('qrCodeImageUrl', 10))
  async updateBankAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BankAccountDto,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<BankAccountResponseDto> {
    return this.bankAccountService.updateBankAccount(id, dto, files);
  }

  @Delete('delete/:id')
  @HttpCode(HttpStatus.OK)
  async deleteBankAccount(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    return this.bankAccountService.deleteBankAccount(id);
  }

  @Delete('remove-qr-image/:id')
  @HttpCode(HttpStatus.OK)
  async removeQrImage(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    return this.bankAccountService.removeQrImage(id);
  }
}
