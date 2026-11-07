// checkout.controller.ts
import { Controller, Post, Body, Res, Get, Param } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CreateCheckoutDto } from './checkout.dto';
import { Response } from 'express';

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('/create')
  async createCheckout(
    @Body() createCheckoutDto: CreateCheckoutDto,
    @Res() res: Response,
  ) {
    try {
      // Generate a simple userId for public access
      const userId = `public-${Date.now()}`;
      const checkout = await this.checkoutService.createCheckout(
        userId,
        createCheckoutDto,
      );

      return res.status(201).json({
        success: true,
        message: 'Checkout created successfully',
        data: checkout,
      });
    } catch (error: any) {
      return res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Failed to create checkout',
        error: error.response || error,
      });
    }
  }

  @Get('/:checkoutId')
  async getCheckoutById(
    @Param('checkoutId') checkoutId: string,
    @Res() res: Response,
  ) {
    try {
      const checkout = await this.checkoutService.getCheckoutById(checkoutId);

      return res.status(200).json({
        success: true,
        message: 'Checkout retrieved successfully',
        data: checkout,
      });
    } catch (error: any) {
      return res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Failed to retrieve checkout',
        error: error.response || error,
      });
    }
  }
}
