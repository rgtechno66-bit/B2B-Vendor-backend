// cart.controller.ts
import {
  Controller,
  Post,
  Body,
  Get,
  Delete,
  Param,
  Req,
  UseGuards,
  Res,
  Patch,
  Put,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { AddToCartDto } from './cart.dto';
import { Request, Response } from 'express';
import { JwtAuthGuard } from './../jwt/jwt-auth.guard';
import { SessionGuard } from './../jwt/session.guard';

@Controller('cart')
@UseGuards(SessionGuard, JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  // @Patch('/increment/:cartItemId')
  // async incrementQuantity(@Req() req: Request, @Param('cartItemId') cartItemId: string) {
  //   const userId = req.user.id;
  //   return this.cartService.updateCartItemQuantity(userId, cartItemId, 100); // Increment by 1
  // }

  // @Patch('/decrement/:cartItemId')
  // async decrementQuantity(@Req() req: Request, @Param('cartItemId') cartItemId: string) {
  //   const userId = req.user.id;
  //   return this.cartService.updateCartItemQuantity(userId, cartItemId, -100); // Decrement by 1
  // }

  // Update quantity (this now handles both increment and decrement)
  @Put('/updateQuantity/:cartItemId')
  async updateQuantity(
    @Req() req: Request,
    @Param('cartItemId') cartItemId: string,
    @Body() body: { noOfPkg: number; quantity: number }, // Get the new quantity value from the request body
  ) {
    const userId = req.user.id; // Get the user ID from the request
    const { noOfPkg, quantity } = body; // Get the new quantity from the request body
    return this.cartService.updateCartItemQuantity(
      userId,
      cartItemId,
      noOfPkg,
      quantity,
    );
  }

  // Discount
  @Patch('/discount/:cartItemId')
  async applyDiscount(
    @Req() req: Request,
    @Param('cartItemId') cartItemId: string,
    @Body() body: { discount: number }, // Get discount value from the request body
  ) {
    const userId = req.user.id; // Get the user ID from the request
    const { discount } = body; // Get the discount value from the request body
    return this.cartService.applyDiscount(cartItemId, userId, discount);
  }

  @Post('/add')
  async addToCart(@Req() request: Request, @Body() addToCartDto: AddToCartDto) {
    const userId = request.user.id; // Assume user is authenticated
    return this.cartService.addMultipleToCart(userId, addToCartDto);
  }

  @Get()
  async getCart(@Req() req: Request) {
    const userId = req.user.id;
    return this.cartService.getCartWithStockQuantity(userId);
  }

  // @Get('matched-quantities')
  // async getMatchedQuantities(@Req() req: Request) {
  //   const userId = req.user.id;
  //   return await this.cartService.getCartWithStockQuantity(userId);
  // }

  @Delete('/delete/:cartItemId')
  async removeFromCart(
    @Req() req: Request,
    @Res() res: Response,
    @Param('cartItemId') cartItemId: string,
  ) {
    const userId = req.user.id;
    await this.cartService.removeFromCart(userId, cartItemId);
    return res.status(200).json({ message: 'Cart item removed successfully' });
  }

  @Delete('/clear')
  async clearCart(@Req() req: Request, @Res() res: Response) {
    const userId = req.user.id;
    await this.cartService.clearCart(userId);
    return res.status(200).json({ message: 'Cart cleared successfully' });
  }
}
