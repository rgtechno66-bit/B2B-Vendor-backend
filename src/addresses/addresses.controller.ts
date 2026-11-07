import {
  Controller,
  Get,
  Post,
  Param,
  Put,
  Delete,
  Body,
  Res,
  HttpStatus,
  UseGuards,
  Req,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AddressesService } from './addresses.service';
import { CreateAddressDto, UpdateAddressDto } from './addresses.dto';
import { Request, Response } from 'express';
import { JwtAuthGuard } from './../jwt/jwt-auth.guard';

@Controller('addresses')
@UseGuards(JwtAuthGuard)
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  async getAllAddresses(@Req() request: Request, @Res() response: Response) {
    const userId = request.user?.id; // Assuming you store the logged-in user's ID in request.user
    try {
      const addresses = await this.addressesService.findByUserAll(userId); // Pass userId directly
      return response.status(HttpStatus.OK).json(addresses);
    } catch (error: any) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: 'Error retrieving addresses.',
        error: error.message,
      });
    }
  }

  @Post('create')
  async createAddress(
    @Body() createAddressDto: CreateAddressDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    // Check if user is authenticated
    if (!request.user) {
      throw new UnauthorizedException('User is not authenticated');
    }
    const userId = createAddressDto.userId || request.user.id;
    try {
      // Assuming create method takes the createAddressDto and userId as arguments
      const address = await this.addressesService.create(
        createAddressDto,
        userId,
      );
      return response.status(HttpStatus.CREATED).json(address);
    } catch (err: unknown) {
      if (err instanceof Error) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Get('get/:id')
  async getAddressById(@Param('id') id: string, @Res() response: Response) {
    const address = await this.addressesService.getById(id);
    return response.status(HttpStatus.OK).json(address);
  }
  @Put('update/:id')
  async updateAddress(
    @Param('id') id: string,
    @Body() updateAddressDto: UpdateAddressDto,
    @Res() response: Response,
  ) {
    const address = await this.addressesService.update(id, updateAddressDto);
    return response.status(HttpStatus.OK).json(address);
  }

  @Delete('delete/:id')
  async deleteAddress(@Param('id') id: string, @Res() response: Response) {
    await this.addressesService.delete(id);
    return response
      .status(HttpStatus.OK)
      .json({ message: 'Address deleted successfully' });
  }
}
