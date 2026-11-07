//users.controller.ts
import {
  Controller,
  HttpStatus,
  Param,
  Get,
  Delete,
  Res,
  UseGuards,
  Patch,
  Put,
  Body,
  Req,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole, UpdateAdminProfileDto } from './users.dto';
import { Request, Response } from 'express';
import { UserService } from './users.service';
import { UserStatus } from './users.entity';
import { JwtAuthGuard } from './../jwt/jwt-auth.guard';
import { RolesGuard } from './../jwt/roles.guard';
import { Roles } from './../jwt/roles.decorator';
import { SessionGuard } from './../jwt/session.guard';

@Controller('users')
@UseGuards(SessionGuard, JwtAuthGuard, RolesGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}
  @Get()
  @Roles(UserRole.Admin)
  async getAllUsers(@Res() response: Response) {
    const users = await this.userService.getAll();
    return response.status(HttpStatus.OK).json({
      length: users.length,
      data: users,
    });
  }

  @Get('admin-state')
  async getAdminState(): Promise<string | null> {
    return this.userService.getAdminState();
  }

  @Get('current-user-state')
  async getCurrentUserState(@Req() request: Request): Promise<string | null> {
    const userId = request.user?.id;
    if (!userId) {
      return null;
    }
    return this.userService.getUserState(userId);
  }

  @Get(':id')
  async getUserById(@Param('id') id: string, @Res() response: Response) {
    const user = await this.userService.getById(id);
    return response.status(HttpStatus.OK).json({
      data: user,
    });
  }

  @Delete('delete/:id')
  async deleteUser(@Param('id') id: string, @Res() response: Response) {
    const result = await this.userService.delete(id);
    return response.status(HttpStatus.OK).json(result);
  }

  @Patch('status/:id')
  @Roles(UserRole.Admin)
  async updateUserStatus(
    @Param('id') id: string,
    @Body('status') status: UserStatus,
    @Res() response: Response,
  ) {
    const updatedUser = await this.userService.updateUserStatus(id, status);
    return response.status(HttpStatus.OK).json({
      message: `User status updated to ${status}`,
      data: updatedUser,
    });
  }

  @Put('profile/:id')
  @Roles(UserRole.Admin)
  @UseInterceptors(FileInterceptor('profile'))
  async updateAdminProfile(
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
    @Body() updateAdminProfileDto: UpdateAdminProfileDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const userId = request.user?.id;
    const userRole = request.user?.role;

    if (!userId || !userRole) {
      return response.status(HttpStatus.UNAUTHORIZED).json({
        message: 'Unauthorized: User information not found',
      });
    }

    const updatedAdmin = await this.userService.updateAdminProfile(
      id,
      updateAdminProfileDto,
      userId,
      userRole,
      file,
    );

    return response.status(HttpStatus.OK).json({
      message: 'Admin profile updated successfully',
      data: updatedAdmin,
    });
  }
}
