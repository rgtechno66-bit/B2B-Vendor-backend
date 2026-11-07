import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BankAccountEntity } from './payment.entity';
import {
  BankAccountDto,
  PaymentType,
  BankAccountResponseDto,
} from './payment.dto';
import { FileStorageService } from '../service/file-storage.service';
import {
  EmailValidationUtils,
  validProviders,
} from '../utils/emailValidate.utils';

@Injectable()
export class BankAccountService {
  constructor(
    @InjectRepository(BankAccountEntity)
    private readonly bankAccountRepository: Repository<BankAccountEntity>,
    private readonly fileStorageService: FileStorageService,
  ) {}

  // Mask sensitive data for response
  private maskSensitiveData(
    data: string,
    type: 'account' | 'upi' | 'email',
  ): string {
    if (!data) return data;

    switch (type) {
      case 'account':
        return data.length > 4
          ? data.substring(0, 2) +
              '*'.repeat(data.length - 4) +
              data.substring(data.length - 2)
          : '*'.repeat(data.length);
      case 'upi':
        const [username, domain] = data.split('@');
        return username.length > 2
          ? username.substring(0, 2) +
              '*'.repeat(username.length - 2) +
              '@' +
              domain
          : '*'.repeat(username.length) + '@' + domain;
      case 'email':
        const [emailUser, emailDomain] = data.split('@');
        return emailUser.length > 2
          ? emailUser.substring(0, 2) +
              '*'.repeat(emailUser.length - 2) +
              '@' +
              emailDomain
          : '*'.repeat(emailUser.length) + '@' + emailDomain;
      default:
        return data;
    }
  }

  // Validate IFSC code format
  private validateIFSC(ifscCode: string): boolean {
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    return ifscRegex.test(ifscCode);
  }

  // Validate account number format
  private validateAccountNumber(accountNumber: string): boolean {
    // Remove spaces and validate
    const cleanAccountNumber = accountNumber.replace(/\s/g, '');
    return /^\d{9,18}$/.test(cleanAccountNumber);
  }

  // Validate UPI ID format
  private validateUpiId(upiId: string): boolean {
    if (!upiId || !upiId.includes('@')) {
      return false;
    }

    // UPI ID format: username@provider
    const upiRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$/;
    if (!upiRegex.test(upiId)) {
      return false;
    }

    // Check length
    if (upiId.length < 5 || upiId.length > 50) {
      return false;
    }

    // Get provider part
    const provider = upiId.split('@')[1]?.toLowerCase().trim();
    // Complete list of valid UPI providers
    return validProviders.includes(provider);
  }

  async createBankAccount(
    dto: BankAccountDto,
    files?: Express.Multer.File[],
  ): Promise<BankAccountResponseDto> {
    // Check for existing account based on type
    const existingAccount = await this.checkExistingAccount(dto);
    if (existingAccount) {
      throw new BadRequestException(
        `Account already exists for ${dto.type} type`,
      );
    }

    // Validate sensitive data
    if (dto.type === PaymentType.BANK) {
      if (!this.validateAccountNumber(dto.accountNumber!)) {
        throw new BadRequestException('Invalid account number format');
      }
      if (!this.validateIFSC(dto.ifscCode!)) {
        throw new BadRequestException('Invalid IFSC code format');
      }
    }

    if (dto.type === PaymentType.UPIType) {
      if (!this.validateUpiId(dto.upiId!)) {
        throw new BadRequestException('Invalid UPI ID format');
      }
    }

    // Validate PayPal email domain
    if (dto.type === PaymentType.PAYPAL) {
      if (!EmailValidationUtils.validateEmailDomain(dto.paypalEmail!)) {
        throw new BadRequestException(
          'Please use a valid email domain (gmail.com, yahoo.com, outlook.com, etc.). Temporary email domains are not allowed.',
        );
      }
    }

    const imageUrls: string[] = [];

    // Upload files to Cloudinary if present
    if (files && files.length > 0) {
      for (const file of files) {
        const fileName = `${Date.now()}-${file.originalname}`;
        const imageUrl = await this.fileStorageService.uploadImage(
          file.buffer,
          'qr-codes',
          fileName,
        );
        imageUrls.push(imageUrl);
      }
    }

    // Validation for UPI type
    if (dto.type === PaymentType.UPIType) {
      if (!dto.upiProvider) {
        throw new BadRequestException('UPI Provider is required for UPI type.');
      }
      if (!dto.upiId && imageUrls.length === 0) {
        throw new BadRequestException(
          'For UPI, either "upiId" or a QR code image must be provided.',
        );
      }
    }

    const bankAccount = this.bankAccountRepository.create({
      ...dto,
      qrCodeImageUrl: imageUrls.join(','),
    });

    const savedAccount = await this.bankAccountRepository.save(bankAccount);

    return this.getFullDataForResponse(savedAccount);
  }

  async getBankAccountDetails(id: string): Promise<BankAccountResponseDto> {
    const account = await this.bankAccountRepository.findOne({ where: { id } });
    if (!account) {
      throw new NotFoundException('Bank account not found');
    }
    // Return full data for vendor (no masking)
    return this.getFullDataForResponse(account);
  }

  async getAllBankAccounts(
    page?: number,
    limit?: number,
    search?: string,
  ): Promise<
    | BankAccountResponseDto[]
    | {
        data: BankAccountResponseDto[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }
  > {
    // If no pagination params, return all accounts
    if (!page && !limit) {
      const queryBuilder =
        this.bankAccountRepository.createQueryBuilder('account');

      // Apply search filter
      if (search && search.trim() !== '') {
        queryBuilder.where(
          '(LOWER(account.bankName) LIKE LOWER(:search) OR LOWER(account.accountName) LIKE LOWER(:search) OR LOWER(account.accountNumber) LIKE LOWER(:search) OR LOWER(account.ifscCode) LIKE LOWER(:search) OR LOWER(account.upiId) LIKE LOWER(:search) OR LOWER(account.paypalEmail) LIKE LOWER(:search))',
          { search: `%${search}%` },
        );
      }

      const accounts = await queryBuilder
        .orderBy('account.createdAt', 'DESC')
        .getMany();
      return accounts.map((account) => this.getFullDataForResponse(account));
    }

    // Pagination logic
    const pageNumber = page || 1;
    const limitNumber = limit || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const queryBuilder =
      this.bankAccountRepository.createQueryBuilder('account');

    // Apply search filter
    if (search && search.trim() !== '') {
      queryBuilder.where(
        '(LOWER(account.bankName) LIKE LOWER(:search) OR LOWER(account.accountName) LIKE LOWER(:search) OR LOWER(account.accountNumber) LIKE LOWER(:search) OR LOWER(account.ifscCode) LIKE LOWER(:search) OR LOWER(account.upiId) LIKE LOWER(:search) OR LOWER(account.paypalEmail) LIKE LOWER(:search))',
        { search: `%${search}%` },
      );
    }

    const total = await queryBuilder.getCount();
    const accounts = await queryBuilder
      .skip(skip)
      .take(limitNumber)
      .orderBy('account.createdAt', 'DESC')
      .getMany();

    return {
      data: accounts.map((account) => this.getFullDataForResponse(account)),
      total,
      page: pageNumber,
      limit: limitNumber,
      totalPages: Math.ceil(total / limitNumber),
    };
  }

  async updateBankAccount(
    id: string,
    dto: BankAccountDto,
    files?: Express.Multer.File[],
  ): Promise<BankAccountResponseDto> {
    // Find the existing bank account
    const existingAccount = await this.bankAccountRepository.findOne({
      where: { id },
    });
    if (!existingAccount) {
      throw new NotFoundException('Bank account not found');
    }

    // Validate sensitive data
    if (dto.type === PaymentType.BANK) {
      if (dto.accountNumber && !this.validateAccountNumber(dto.accountNumber)) {
        throw new BadRequestException('Invalid account number format');
      }
      if (dto.ifscCode && !this.validateIFSC(dto.ifscCode)) {
        throw new BadRequestException('Invalid IFSC code format');
      }
    }

    if (dto.type === PaymentType.UPIType && dto.upiId) {
      if (!this.validateUpiId(dto.upiId)) {
        throw new BadRequestException('Invalid UPI ID format');
      }
    }

    // Validate PayPal email domain for updates
    if (dto.type === PaymentType.PAYPAL && dto.paypalEmail) {
      if (!EmailValidationUtils.validateEmailDomain(dto.paypalEmail)) {
        throw new BadRequestException(
          'Please use a valid email domain (gmail.com, yahoo.com, outlook.com, etc.). Temporary email domains are not allowed.',
        );
      }
    }

    const newImageUrls: string[] = [];

    // Upload new files if provided
    if (files && files.length > 0) {
      for (const file of files) {
        const fileName = `${Date.now()}-${file.originalname}`;
        const imageUrl = await this.fileStorageService.uploadImage(
          file.buffer,
          'qr-codes',
          fileName,
        );
        newImageUrls.push(imageUrl);
      }
    }

    // Handle image replacement logic
    if (newImageUrls.length > 0) {
      // Remove old images if new ones are uploaded
      const oldImageUrls = existingAccount.qrCodeImageUrl
        ? existingAccount.qrCodeImageUrl.split(',')
        : [];

      for (const oldImageUrl of oldImageUrls) {
        await this.fileStorageService.deleteSingleFile(oldImageUrl);
      }

      existingAccount.qrCodeImageUrl = newImageUrls.join(',');
    }

    // Validation for UPI type
    if (dto.type === PaymentType.UPIType) {
      if (!dto.upiProvider) {
        throw new BadRequestException('UPI Provider is required for UPI type.');
      }
      if (
        !dto.upiId &&
        newImageUrls.length === 0 &&
        !existingAccount.qrCodeImageUrl
      ) {
        throw new BadRequestException(
          'For UPI, either "upiId" or a QR code image must be provided.',
        );
      }
    }

    // Update the account details
    Object.assign(existingAccount, dto);
    const savedAccount = await this.bankAccountRepository.save(existingAccount);

    return this.maskSensitiveDataForResponse(savedAccount);
  }

  async deleteBankAccount(id: string): Promise<{ message: string }> {
    // Retrieve the account details
    const account = await this.getBankAccountDetails(id);

    if (!account) {
      throw new NotFoundException('Bank account not found');
    }

    // Delete the associated single image from Cloudinary if it exists
    if (account.qrCodeImageUrl) {
      await this.fileStorageService.deleteSingleFile(account.qrCodeImageUrl);
    }
    // Remove the bank account from the database
    const accountEntity = await this.bankAccountRepository.findOne({
      where: { id },
    });
    if (accountEntity) {
      await this.bankAccountRepository.remove(accountEntity);
    }

    return {
      message: 'Bank account and associated image deleted successfully',
    };
  }

  async removeQrImage(id: string): Promise<{ message: string }> {
    // Retrieve the account details
    const account = await this.getBankAccountDetails(id);

    if (!account) {
      throw new NotFoundException('Bank account not found');
    }

    // Delete the associated image from Cloudinary if it exists
    if (account.qrCodeImageUrl) {
      await this.fileStorageService.deleteSingleFile(account.qrCodeImageUrl);
      account.qrCodeImageUrl = undefined;
      await this.bankAccountRepository.save(account);
    } else {
      return { message: 'No QR image found to delete' };
    }

    return { message: 'QR image removed successfully' };
  }

  // Helper method to return full data (no masking) for vendor
  private getFullDataForResponse(
    account: BankAccountEntity,
  ): BankAccountResponseDto {
    return {
      id: account.id,
      type: account.type,
      upiProvider: account.upiProvider,
      bankName: account.bankName,
      accountName: account.accountName,
      accountNumber: account.accountNumber, // Full account number
      ifscCode: account.ifscCode,
      upiId: account.upiId, // Full UPI ID
      paypalEmail: account.paypalEmail, // Full email
      qrCodeImageUrl: account.qrCodeImageUrl || undefined,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  // Keep the masked method for other use cases if needed
  private maskSensitiveDataForResponse(
    account: BankAccountEntity,
  ): BankAccountResponseDto {
    return {
      id: account.id,
      type: account.type,
      upiProvider: account.upiProvider,
      bankName: account.bankName,
      accountName: account.accountName,
      accountNumber: account.accountNumber
        ? this.maskSensitiveData(account.accountNumber, 'account')
        : undefined,
      ifscCode: account.ifscCode,
      upiId: account.upiId
        ? this.maskSensitiveData(account.upiId, 'upi')
        : undefined,
      paypalEmail: account.paypalEmail
        ? this.maskSensitiveData(account.paypalEmail, 'email')
        : undefined,
      qrCodeImageUrl: account.qrCodeImageUrl || undefined,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  // Check for existing account
  private async checkExistingAccount(
    dto: BankAccountDto,
  ): Promise<BankAccountEntity | null> {
    switch (dto.type) {
      case PaymentType.BANK:
        // Check if bank account with same account number exists
        if (dto.accountNumber) {
          return await this.bankAccountRepository.findOne({
            where: {
              type: PaymentType.BANK,
              accountNumber: dto.accountNumber,
            },
          });
        }
        break;

      case PaymentType.UPIType:
        // Check if UPI account with same UPI ID exists
        if (dto.upiId) {
          return await this.bankAccountRepository.findOne({
            where: {
              type: PaymentType.UPIType,
              upiId: dto.upiId,
            },
          });
        }
        break;

      case PaymentType.PAYPAL:
        // Check if PayPal account with same email exists
        if (dto.paypalEmail) {
          return await this.bankAccountRepository.findOne({
            where: {
              type: PaymentType.PAYPAL,
              paypalEmail: dto.paypalEmail,
            },
          });
        }
        break;
    }

    return null;
  }
}
