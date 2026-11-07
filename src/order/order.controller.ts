import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  Param,
  Delete,
  Res,
  HttpStatus,
  NotFoundException,
  Patch,
  Put,
  Query,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { Request, Response } from 'express';
import {
  CreateItemOrderDto,
  CreateOrderDto,
  UpdateOrderStatusDto,
} from './order.dto';
import { OrderEntity } from './order.entity';
import { OrderItemEntity } from './order.item.entity';
import { isAdmin } from './../utils/auth.utils';
import { JwtAuthGuard } from './../jwt/jwt-auth.guard';
import { RolesGuard } from './../jwt/roles.guard';
import { UserService } from './../user/users.service';
import { SessionGuard } from './../jwt/session.guard';
import { Public } from './../jwt/public.decorator';

@Controller('order')
@UseGuards(SessionGuard, JwtAuthGuard, RolesGuard)
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly userService: UserService, // Inject UserService
  ) {}

  @Post('generate')
  async createOrder(
    @Req() req: Request,
    @Body() createOrderDto: CreateOrderDto,
  ) {
    const userId = req.user.id; // Assume user is authenticated
    return this.orderService.createOrder(userId, createOrderDto);
  }

  @Get('get')
  async getOrders(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Res() response?: Response,
  ) {
    const user = req.user;
    const userRole = user?.role;

    // Admin users get all orders with pagination
    if (isAdmin(userRole)) {
      const pageNumber = page ? parseInt(page, 10) : undefined;
      const limitNumber = limit ? parseInt(limit, 10) : undefined;

      // Fix date range: set startDate to start of day and endDate to end of day
      let processedStartDate = startDate;
      let processedEndDate = endDate;

      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        processedStartDate = start.toISOString();
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        processedEndDate = end.toISOString();
      }

      const result = await this.orderService.getAllOrders(
        pageNumber,
        limitNumber,
        search,
        status,
        processedStartDate,
        processedEndDate,
      );

      if (response) {
        return response.status(HttpStatus.OK).json(result);
      }
      return result;
    }

    // Regular users get their own orders
    const userOrders = await this.orderService.getOrdersByUserId(user.id);
    if (response) {
      return response.status(HttpStatus.OK).json(userOrders);
    }
    return userOrders;
  }

  @Get('status-counts')
  async getStatusCounts(@Res() response: Response) {
    const counts = await this.orderService.getStatusCounts();
    if (response) {
      return response.status(HttpStatus.OK).json({
        success: true,
        data: counts,
      });
    }
    return counts;
  }

  @Get('get/monthly')
  async getOrdersMonthly(
    @Req() req: Request,
  ): Promise<Array<{ month: string; status: string; count: number }>> {
    const user = req.user;
    const userRole = user?.role;

    // Admin users get all orders
    if (isAdmin(userRole)) {
      return this.orderService.getMonthlyProductCounts();
    }
    // Handle case where the user is not an admin
    return [];
  }

  @Get('summary/:orderId')
  async getOrderSummary(@Param('orderId') orderId: string): Promise<any> {
    const adminState = (await this.userService.getAdminState()) ?? null;
    return this.orderService.getOrderSummary(orderId, adminState);
  }

  @Get(':orderId')
  async getOrderById(
    @Param('orderId') orderId: string,
  ): Promise<OrderEntity | null> {
    return this.orderService.getOrderById(orderId);
  }

  @Get(':id')
  async findOne(@Param('orderId') orderId: string, @Res() response: Response) {
    const result = await this.orderService.getOrderById(orderId);
    return response.status(HttpStatus.OK).json({
      data: result,
    });
  }

  @Public()
  @Delete('delete/:orderId')
  async deleteOrder(
    @Param('orderId') orderId: string,
  ): Promise<{ message: string }> {
    await this.orderService.deleteOrder(orderId);
    return { message: 'order has been deleted' };
  }

  /** Same as delete – no auth, for callers that cannot use DELETE */
  @Public()
  @Post('delete/:orderId')
  async deleteOrderByPost(
    @Param('orderId') orderId: string,
  ): Promise<{ message: string }> {
    await this.orderService.deleteOrder(orderId);
    return { message: 'order has been deleted' };
  }

  /** Same as delete – no auth, for callers that cannot use DELETE */
  @Public()
  @Get('delete/:orderId')
  async deleteOrderByGet(
    @Param('orderId') orderId: string,
  ): Promise<{ message: string }> {
    await this.orderService.deleteOrder(orderId);
    return { message: 'order has been deleted' };
  }

  @Delete('delete/orders/all')
  async deleteMultiple(@Body('ids') ids: string[], @Res() response: Response) {
    try {
      const result = await this.orderService.deleteMultiple(ids);
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
        .json({ message: 'An error occurred while deleting the data.' });
    }
  }

  // order item
  // @Post('add-items')
  // async addItemsToOrder(@Body() createItemOrderDto: CreateItemOrderDto): Promise<OrderItemEntity[]> {
  //     return this.orderService.addItemToOrder(createItemOrderDto);
  // }

  @Post('add-items')
  async addItemsToOrder(
    @Body() createItemOrderDto: CreateItemOrderDto,
  ): Promise<OrderItemEntity[]> {
    // Step 1: Fetch all users with the Admin role
    const adminState =
      (await this.userService.getAdminState()) ?? 'Not Specified';

    return this.orderService.addItemToOrder(createItemOrderDto, adminState);
  }

  @Delete('item-order/:orderItemId')
  async deleteOrderItemById(
    @Param('orderItemId') orderItemId: string,
  ): Promise<{ message: string }> {
    return this.orderService.deleteOrderItemById(orderItemId);
  }

  // Admin can only change the status

  @Put('update-status/:orderId')
  async updateOrderStatus(
    @Req() req: Request,
    @Param('orderId') orderId: string,
    @Body() updateStatusDto: UpdateOrderStatusDto,
  ): Promise<{ message: string }> {
    const user = req.user;

    if (!isAdmin(user?.role)) {
      throw new NotFoundException('Access denied. Admins only.');
    }

    await this.orderService.updateOrderStatus(orderId, updateStatusDto);
    return { message: 'Order status updated successfully.' };
  }
}
