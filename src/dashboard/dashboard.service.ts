// dashboard.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ItemEntity } from './../fetch-products/item.entity';
import { UserEntity, UserRole } from './../user/users.entity';
import { OrderEntity } from './../order/order.entity';
import { OrderStatus } from './../order/order.enums';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(ItemEntity)
    private readonly itemRepository: Repository<ItemEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(OrderEntity)
    private readonly orderRepository: Repository<OrderEntity>,
  ) {}

  async getDashboardData() {
    try {
      // Use COUNT queries instead of fetching all data for better performance
      const [itemsCount, usersCount, ordersCount] = await Promise.all([
        this.itemRepository.count(),
        this.userRepository.count({ where: { role: UserRole.Vendor } }),
        this.orderRepository.count({ where: { status: OrderStatus.SUCCESS } }),
      ]);

      return {
        itemsCount,
        usersCount,
        ordersCount,
      };
    } catch (error: any) {
      // Log the actual error for debugging
      console.error('Dashboard data fetch error:', error);
      // Include the actual error message if available
      const errorMessage = error?.message || 'Failed to fetch dashboard data';
      throw new InternalServerErrorException({
        message: errorMessage,
        error: 'Internal Server Error',
      });
    }
  }

  /**
   * Top selling products by Items.totalSalesAmount (set via POST /items/update-total-sales-amount).
   */
  async getTopSellingProducts(
    limit: number = 12,
  ): Promise<{ data: (ItemEntity & { totalSalesAmt: number })[] }> {
    const safeLimit = Math.min(Math.max(1, limit), 50);

    try {
      const items = await this.itemRepository
        .createQueryBuilder('item')
        .where('item.totalSalesAmount IS NOT NULL')
        .andWhere('item.totalSalesAmount > 0')
        .orderBy('item.totalSalesAmount', 'DESC')
        .take(safeLimit)
        .getMany();

      const data = items.map((item) => ({
        ...item,
        totalSalesAmt: Number(item.totalSalesAmount) || 0,
      }));

      return { data };
    } catch (error: any) {
      console.error('Top selling products error:', error);
      throw new InternalServerErrorException({
        message: error?.message || 'Failed to fetch top selling products',
        error: 'Internal Server Error',
      });
    }
  }
}
