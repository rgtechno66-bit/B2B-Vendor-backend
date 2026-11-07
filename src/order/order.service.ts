import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OrderEntity } from './order.entity';
import { OrderSequenceEntity } from './order-sequence.entity';

import {
  CreateItemOrderDto,
  CreateOrderDto,
  UpdateOrderStatusDto,
} from './order.dto';
import { ItemEntity } from './../fetch-products/item.entity';
import { OrderItemEntity } from './order.item.entity';
import { CartItemEntity } from './../cart/cart.entity';
import { Like, Repository } from 'typeorm';
import { generateInvoiceXML } from '../tally/invoice-xml-generator';
import axios from 'axios';
import { Invoice, InvoiceStatus } from './../invoice/invoice.entity';
import { EmailService } from './../service/email.service';
import { UserEntity } from './../user/users.entity';
import { AddressEntity } from './../addresses/addresses.entity';
import { TallySettings } from 'settings/setting.entity';
import { OrderStatus } from './order.enums';
import { GSTCalculationService } from './gst-calculation.service';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly orderRepository: Repository<OrderEntity>,
    @InjectRepository(OrderSequenceEntity)
    private readonly orderSequenceRepository: Repository<OrderSequenceEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(AddressEntity)
    private readonly addressRepository: Repository<AddressEntity>,

    @InjectRepository(TallySettings)
    private readonly TallySettingsService: Repository<TallySettings>,

    @InjectRepository(ItemEntity)
    private readonly productRepository: Repository<ItemEntity>,
    @InjectRepository(OrderItemEntity)
    private readonly orderItemRepository: Repository<OrderItemEntity>,

    @InjectRepository(CartItemEntity)
    private readonly cartRepository: Repository<CartItemEntity>,

    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,

    private readonly gstCalculationService: GSTCalculationService,
  ) {}

  // Admin can only change the status

  async updateOrderStatus(
    orderId: string,
    updateOrderStatusDto: UpdateOrderStatusDto,
  ): Promise<void> {
    const { status } = updateOrderStatusDto; // Extract the status from the DTO

    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Only update timestamp if status is changing
    if (order.status !== status) {
      order.status = status;

      const now = new Date();

      switch (status) {
        case OrderStatus.SUCCESS:
          order.completedAt = now;
          order.cancelledAt = null;
          break;

        case OrderStatus.Cancelled:
          order.cancelledAt = now;
          order.completedAt = null;
          break;

        case OrderStatus.PENDING:
          order.completedAt = null;
          order.cancelledAt = null;
          break;

        // Add more cases as needed
        default:
          break;
      }
    }

    // Save the updated order to the database
    await this.orderRepository.save(order);
  }

  async getAllOrders(
    page?: number,
    limit?: number,
    search?: string,
    status?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<
    | OrderEntity[]
    | {
        data: OrderEntity[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }
  > {
    // If no pagination params, return all orders
    if (!page && !limit) {
      const queryBuilder = this.orderRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.address', 'address')
        .leftJoinAndSelect('order.user', 'user')
        .leftJoinAndSelect('order.orderItems', 'orderItems')
        .leftJoinAndSelect('orderItems.product', 'product');

      // Apply search filter
      if (search && search.trim() !== '') {
        queryBuilder.where(
          '(LOWER(order.orderNo) LIKE LOWER(:search) OR LOWER(user.name) LIKE LOWER(:search))',
          { search: `%${search}%` },
        );
      }

      // Apply status filter
      if (status && status !== 'all') {
        queryBuilder.andWhere('order.status = :status', { status });
      }

      // Apply date range filter
      if (startDate && endDate) {
        queryBuilder.andWhere(
          'order.createdAt BETWEEN :startDate AND :endDate',
          {
            startDate,
            endDate,
          },
        );
      }

      return queryBuilder.orderBy('order.createdAt', 'DESC').getMany();
    }

    // Pagination logic
    const pageNumber = page || 1;
    const limitNumber = limit || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.address', 'address')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('order.orderItems', 'orderItems')
      .leftJoinAndSelect('orderItems.product', 'product');

    // Apply search filter
    if (search && search.trim() !== '') {
      queryBuilder.where(
        '(LOWER(order.orderNo) LIKE LOWER(:search) OR LOWER(user.name) LIKE LOWER(:search))',
        { search: `%${search}%` },
      );
    }

    // Apply status filter
    if (status && status !== 'all') {
      queryBuilder.andWhere('order.status = :status', { status });
    }

    // Apply date range filter
    if (startDate && endDate) {
      queryBuilder.andWhere('order.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    }

    const total = await queryBuilder.getCount();
    const data = await queryBuilder
      .skip(skip)
      .take(limitNumber)
      .orderBy('order.createdAt', 'DESC')
      .getMany();

    return {
      data,
      total,
      page: pageNumber,
      limit: limitNumber,
      totalPages: Math.ceil(total / limitNumber),
    };
  }

  // Get status counts for tabs
  async getStatusCounts(): Promise<{
    all: number;
    pending: number;
    completed: number;
    cancelled: number;
  }> {
    const all = await this.orderRepository.count();

    const pending = await this.orderRepository.count({
      where: { status: OrderStatus.PENDING },
    });

    const completed = await this.orderRepository.count({
      where: { status: OrderStatus.SUCCESS },
    });

    const cancelled = await this.orderRepository.count({
      where: { status: OrderStatus.Cancelled },
    });

    return { all, pending, completed, cancelled };
  }

  async getMonthlyProductCounts(): Promise<
    Array<{ month: string; status: string; count: number }>
  > {
    // Fetch monthly data and group by month and status
    const monthlyData = await this.orderRepository
      .createQueryBuilder('order')
      .select("TO_CHAR(order.createdAt, 'YYYY-MM')", 'month')
      .addSelect('order.status', 'status')
      .addSelect('COUNT(order.id)', 'count')
      .where('order.status != :status', { status: OrderStatus.Cancelled }) // Exclude canceled orders
      .groupBy("TO_CHAR(order.createdAt, 'YYYY-MM'), order.status")
      .orderBy('month', 'ASC')
      .getRawMany();

    // Ensure the count is returned as a number
    return monthlyData.map((data) => ({
      month: data.month,
      status: data.status,
      count: Number(data.count),
    }));
  }

  async findAllCompleted(): Promise<OrderEntity[]> {
    return this.orderRepository.find({
      where: { status: OrderStatus.SUCCESS },
    });
  }

  async createOrder(
    userId: string,
    createOrderDto: CreateOrderDto,
  ): Promise<OrderEntity> {
    const {
      addressId,
      noOfPkgs,
      stdPkgs,
      totalPrice,
      totalQuantity,
      finalAmount,
      discount,
      delivery,
      cgst,
      sgst,
      igst,
      totalGst,
    } = createOrderDto;

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const address = await this.addressRepository.findOne({
      where: { id: addressId },
    });
    if (!address) {
      throw new NotFoundException('Address not found');
    }

    // Generate a unique order number (e.g., #12345)
    const orderNo = await this.generateUniqueOrderNumber();

    // Round discount percentage to 2 decimal places to avoid floating point precision issues
    const roundedDiscount = discount
      ? Math.round((discount as number) * 100) / 100
      : 0;

    // Round finalAmount to 2 decimals to match order summary (8323.435 → 8323.43)
    const roundedFinalAmount =
      finalAmount != null && finalAmount > 0
        ? Math.round((Number(finalAmount) - 0.0001) * 100) / 100
        : finalAmount;

    const order = this.orderRepository.create({
      orderNo,
      user,
      address,
      totalPrice,
      stdPkgs,
      noOfPkgs,
      discount: roundedDiscount,
      finalAmount: roundedFinalAmount,
      totalQuantity,
      delivery,
      cgst: cgst ?? 0,
      sgst: sgst ?? 0,
      igst: igst ?? 0,
      totalGst: totalGst ?? 0,
    });

    return this.orderRepository.save(order);
  }
  /**
   * Generate next sequential order number: Online-0001, Online-0002, ...
   * Uses stored last number so that even if orders are deleted, the next order
   * always gets the next number (e.g. 002 deleted -> next is 003).
   */
  private async generateUniqueOrderNumber(): Promise<string> {
    const prefix = 'Online-';
    const sequenceKey = 'order_no';

    try {
      return await this.orderRepository.manager.transaction(async (manager) => {
        const seqRepo = manager.getRepository(OrderSequenceEntity);
        const orderRepo = manager.getRepository(OrderEntity);

        // Lock the sequence row so concurrent requests get unique numbers
        let row = await seqRepo.findOne({
          where: { key: sequenceKey },
          lock: { mode: 'pessimistic_write' },
        });

        let nextNum: number;

        if (!row) {
          // First time: no sequence row — derive from max existing order
          const raw = await orderRepo
            .createQueryBuilder('order')
            .select(
              'MAX(CAST(SUBSTRING(order.orderNo FROM 8) AS INTEGER))',
              'maxNum',
            )
            .where('order.orderNo LIKE :pattern', { pattern: `${prefix}%` })
            .getRawOne<{ maxNum: string | null }>();

          nextNum =
            raw?.maxNum != null && raw.maxNum !== ''
              ? parseInt(raw.maxNum, 10) + 1
              : 1;

          row = seqRepo.create({
            key: sequenceKey,
            lastNumber: nextNum,
          });
          await seqRepo.save(row);
        } else {
          nextNum = row.lastNumber + 1;
          row.lastNumber = nextNum;
          await seqRepo.save(row);
        }

        return `${prefix}${nextNum.toString().padStart(4, '0')}`;
      });
    } catch (error) {
      throw new InternalServerErrorException(
        'Error generating unique order number',
      );
    }
  }

  async getOrdersByUserId(userId: string): Promise<any> {
    const orders = await this.orderRepository.find({
      where: { user: { id: userId } },
      relations: ['address', 'user', 'orderItems.product'],
    });

    // Aggregate counts of orders by status using QueryBuilder
    const statusCounts = await this.orderRepository
      .createQueryBuilder('order')
      .select('order.status', 'status')
      .addSelect('COUNT(order.id)', 'count')
      .where('order.userId = :userId', { userId })
      .groupBy('order.status')
      .getRawMany();

    // Convert query result into an easy-to-use object
    const statusSummary = statusCounts.reduce((acc, { status, count }) => {
      acc[status] = parseInt(count, 10);
      return acc;
    }, {});

    const totalOrders = orders.length;

    // Fetch monthly data and group by month and status
    const monthlyData = await this.orderRepository
      .createQueryBuilder('order')
      .select("TO_CHAR(order.createdAt, 'YYYY-MM')", 'month')
      .addSelect('order.status', 'status')
      .addSelect('COUNT(order.id)', 'count')
      .where('order.userId = :userId', { userId })
      .groupBy("TO_CHAR(order.createdAt, 'YYYY-MM'), order.status")
      .orderBy('month', 'ASC')
      .getRawMany();

    // Transform the monthly data into an array format
    const monthlySummary = this.transformMonthlyData(monthlyData);

    return {
      orders,
      statusSummary: {
        totalOrders,
        pending: statusSummary[OrderStatus.PENDING] || 0,
        completed: statusSummary[OrderStatus.SUCCESS] || 0,
        cancelled: statusSummary[OrderStatus.Cancelled] || 0,
      },
      monthlyData: monthlySummary, // Include the monthly summary here
    };
  }

  private transformMonthlyData(
    data: { month: string; status: string; count: string }[],
  ): {
    month: string;
    total: number;
    pending: number;
    completed: number;
    cancelled: number;
  }[] {
    // Define the type for the summary object
    const summary: Record<
      string,
      {
        month: string;
        total: number;
        pending: number;
        completed: number;
        cancelled: number;
      }
    > = {};

    // Helper function to map database statuses to object keys
    const mapStatus = (
      status: string,
    ): 'pending' | 'completed' | 'cancelled' => {
      switch (status) {
        case OrderStatus.PENDING:
          return 'pending';
        case OrderStatus.SUCCESS:
          return 'completed';
        case OrderStatus.Cancelled:
          return 'cancelled';
        default:
          throw new Error(`Unknown status: ${status}`);
      }
    };

    // Group data by month and accumulate status counts and total orders
    data.forEach(({ month, status, count }) => {
      if (!summary[month]) {
        summary[month] = {
          month,
          total: 0,
          pending: 0,
          completed: 0,
          cancelled: 0,
        };
      }
      const key = mapStatus(status);
      const parsedCount = parseInt(count, 10);

      // Accumulate counts for each status and the total
      summary[month][key] += parsedCount;
      summary[month].total += parsedCount;
    });

    // Convert the summary object into an array
    return Object.values(summary);
  }

  async getOrderById(orderId: string): Promise<OrderEntity> {
    try {
      const order = await this.orderRepository.findOne({
        where: { id: orderId },
        relations: ['address', 'user', 'orderItems.product'],
      });
      if (!order) {
        throw new NotFoundException(`order  not found`);
      }
      return order;
    } catch (error: any) {
      throw error;
    }
  }

  async deleteOrder(orderId: string): Promise<void> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.orderRepository.remove(order);
  }

  async deleteMultiple(ids: string[]): Promise<{ message: string }> {
    const notFoundIds: string[] = [];

    for (const id of ids) {
      try {
        await this.deleteOrder(id); // attempt to delete the order
      } catch (error) {
        notFoundIds.push(id); // if an error occurs, track the not found ID
        continue; // skip to the next ID
      }
    }
    if (notFoundIds.length > 0) {
      throw new NotFoundException(
        `orders with ids ${notFoundIds.join(', ')} not found`,
      );
    }

    return { message: 'orders deleted successfully' };
  }

  // order item

  async addItemToOrder(
    createItemOrderDto: CreateItemOrderDto,
    adminState: string,
  ): Promise<OrderItemEntity[]> {
    const { orderId, products } = createItemOrderDto;

    // Find the order by orderId and load relations for User and Address
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['user', 'address'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const savedOrderItems: OrderItemEntity[] = [];

    // Loop through each product in the list and add them to the order
    for (const productOrder of products) {
      const { productId, quantity, discount } = productOrder;

      // Find the product by productId
      const product = await this.productRepository.findOne({
        where: { id: productId },
      });
      if (!product) {
        throw new NotFoundException(`Product with ID ${productId} not found`);
      }

      // Increment the popularity of the product
      product.popularity = (product.popularity || 0) + 1;
      await this.productRepository.save(product);

      // Create and save each OrderItem with discount
      const orderItem = this.orderItemRepository.create({
        order,
        product,
        quantity,
        discount: discount || 0, // Include per-item discount
      });
      const savedOrderItem = await this.orderItemRepository.save(orderItem);
      savedOrderItems.push(savedOrderItem);
    }
    // Clear the cart for this user once all items are added
    await this.cartRepository.delete({ userId: order.user.id });

    // Fetch Tally settings data
    const tallySettings = await this.TallySettingsService.find();
    if (!tallySettings || tallySettings.length === 0) {
      throw new NotFoundException('Tally settings not found');
    }
    // Attempt to post the invoice to Tally
    try {
      await this.postToTally(order, savedOrderItems, adminState, tallySettings);
      console.log('Invoice posted to Tally successfully');
    } catch (error) {
      console.error('Failed to post invoice to Tally:', error);
      // Log error and continue without blocking order creation
    }

    return savedOrderItems;
  }

  /**
   * Get order summary with GST breakdown
   */
  async getOrderSummary(
    orderId: string,
    adminState: string | null,
  ): Promise<any> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['address', 'user', 'orderItems', 'orderItems.product'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const summary = this.gstCalculationService.calculateOrderSummary(
      order.orderItems,
      order,
      adminState,
    );

    return summary;
  }

  private async savePendingInvoice(
    order: OrderEntity,
    xmlContent: string,
  ): Promise<void> {
    const unsentInvoice = new Invoice();
    unsentInvoice.orderId = order.id;
    unsentInvoice.xmlContent = xmlContent;
    unsentInvoice.userId = order?.user?.id;
    unsentInvoice.status = InvoiceStatus.PENDING;
    await this.invoiceRepository.save(unsentInvoice);
  }

  async postToTally(
    order: OrderEntity,
    savedOrderItems: OrderItemEntity[],
    adminState: string | null,
    tallySettings: TallySettings[],
  ): Promise<void> {
    const xml = generateInvoiceXML(
      order,
      savedOrderItems,
      adminState,
      tallySettings,
    );
    let isInvoiceSaved = false;
    console.log('xml', xml);

    try {
      const response = await axios.post(process.env.TALLY_URL as string, xml, {
        headers: {
          'Content-Type': 'application/xml',
        },
      });
      console.log('response', response.data);
      if (response.data.includes('<LINEERROR>')) {
        await this.savePendingInvoice(order, xml);
        isInvoiceSaved = true;
        throw new Error(`Failed to post invoice to Tally due to line error.`);
      }
    } catch (error) {
      console.log('General error during Tally posting', error);
      if (!isInvoiceSaved) {
        await this.savePendingInvoice(order, xml);
      }

      throw new Error(
        'Failed to post invoice to Tally. It will be retried later.',
      );
    }
  }

  async getAll(): Promise<OrderItemEntity[]> {
    const address = await this.orderItemRepository.find();
    return address;
  }

  async deleteOrderItemById(orderItemId: string): Promise<{ message: string }> {
    // Find the order item by orderItemId
    const orderItem = await this.orderItemRepository.findOne({
      where: { id: orderItemId },
    });

    if (!orderItem) {
      throw new NotFoundException('Order item not found');
    }
    // Delete the order item
    await this.orderItemRepository.delete(orderItemId);

    return { message: 'Order item deleted successfully' };
  }
}
