// cart.service.ts
import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CartItemEntity } from './cart.entity';
import { AddToCartDto, AddToCartItemDto } from './cart.dto';
import { ItemEntity } from './../fetch-products/item.entity';
import { StockEntity } from './../stock/stock.entity';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(CartItemEntity)
    private readonly cartRepository: Repository<CartItemEntity>,
    @InjectRepository(ItemEntity)
    private readonly itemRepository: Repository<ItemEntity>,
    @InjectRepository(StockEntity)
    private stockRepository: Repository<StockEntity>,
  ) {}

  async addMultipleToCart(
    userId: string,
    addToCartDto: AddToCartDto,
  ): Promise<CartItemEntity[]> {
    const items: AddToCartItemDto[] = addToCartDto.items || []; // Default to an empty array

    if (items.length === 0) {
      throw new HttpException(
        'No items provided to add to the cart',
        HttpStatus.BAD_REQUEST,
      );
    }

    const cartItems: CartItemEntity[] = [];
    const existingItems: string[] = []; // Store product IDs of items already in the cart

    for (const item of items) {
      const { productId, quantity } = item;

      const product = await this.itemRepository.findOne({
        where: { id: productId },
      });
      if (!product) {
        throw new NotFoundException(`Product not found`);
      }

      // Check if the product is already in the cart
      const existingCartItem = await this.cartRepository.findOne({
        where: { product: { id: productId }, userId },
      });

      if (existingCartItem) {
        existingItems.push(productId); // Add to the existing items list
        continue; // Skip to the next item
      }

      // Create a new cart item and add it to the cart
      const newCartItem = this.cartRepository.create({
        product,
        quantity,
        userId,
      });

      cartItems.push(await this.cartRepository.save(newCartItem));
    }

    return cartItems;
  }

  // async getCart(userId: string): Promise<CartItemEntity[]> {
  //   return this.cartRepository.find({ where: { userId }, relations: ['product'] });
  // }

  async getCartWithStockQuantity(userId: string): Promise<any[]> {
    // Fetch all cart items for the given user, ordered by createdAt to maintain insertion order
    const cartItems = await this.cartRepository.find({
      where: { userId },
      relations: ['product'], // Assuming 'product' relation holds the product info in CartItemEntity
      order: { createdAt: 'ASC' }, // Order by createdAt to maintain the original position
    });

    if (!cartItems || cartItems.length === 0) {
      // Return an empty array if no cart items are found
      return [];
    }

    const result = [];

    for (const cartItem of cartItems) {
      const productName = cartItem.product.itemName; // Assuming product has a 'itemName' field in ItemEntity

      // Fetch stock data based on product name
      const stockData = await this.stockRepository
        .createQueryBuilder('stock')
        .where('stock.itemName = :itemName', { itemName: productName })
        .getOne();

      // Check if stockData and stockData.quantity are valid before using it
      if (stockData && stockData.quantity !== undefined) {
        // Convert quantity to number before dividing
        let quantity = parseFloat(stockData.quantity); // Ensure quantity is a number

        if (isNaN(quantity) || quantity < 0) {
          // If quantity is negative or not a valid number, set it to 0
          quantity = 0;
        }

        // Round the half quantity to the nearest whole number
        const halfQuantity = Math.round(quantity / 2);

        // Push cart item data and half stock quantity together
        result.push({
          ...cartItem, // Include cart item data
          stockQuantity: halfQuantity, // Show half of stock quantity rounded to the nearest integer
        });
      } else {
        // Handle the case where stockData or quantity is missing (optional)
        result.push({
          ...cartItem,
          stockQuantity: 0, // Default to 0 if no quantity is found
        });
      }
    }

    return result;
  }

  async removeFromCart(userId: string, cartItemId: string): Promise<void> {
    const cartItem = await this.cartRepository.findOne({
      where: { id: cartItemId, userId },
    });

    if (!cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    await this.cartRepository.remove(cartItem);
  }

  async clearCart(userId: string): Promise<void> {
    await this.cartRepository.delete({ userId });
  }

  // Discount Apply

  async updateCartItemQuantity(
    userId: string,
    cartItemId: string,
    noOfPkg: number,
    quantity: number,
  ): Promise<CartItemEntity> {
    const cartItem = await this.cartRepository.findOne({
      where: { id: cartItemId, userId },
    });

    if (!cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    // Check for valid quantity
    if (quantity < 1) {
      throw new HttpException(
        'Quantity must be greater than 0',
        HttpStatus.BAD_REQUEST,
      );
    }
    // Validate noOfPkg (ensure it's valid as per your business logic)
    if (noOfPkg < 1) {
      throw new HttpException(
        'Number of packages must be greater than 0',
        HttpStatus.BAD_REQUEST,
      );
    }

    cartItem.quantity = quantity; // Update the cart item with the new quantity
    cartItem.noOfPkg = noOfPkg;

    return this.cartRepository.save(cartItem);
  }
  async applyDiscount(
    cartId: string,
    userId: string,
    discount: number,
  ): Promise<any> {
    // Fetch the cart by cartId and userId (to ensure the cart belongs to the user)
    const cart = await this.cartRepository.findOne({
      where: { id: cartId, userId },
    });

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    // Validate the discount value
    if (discount < 0) {
      throw new HttpException(
        'Invalid discount value. Discount must be between 0 and the cart subtotal.',
        HttpStatus.BAD_REQUEST,
      );
    }

    cart.discount = discount; // Apply the discount to the cart
    return this.cartRepository.save(cart); // Save the updated cart
  }
}
