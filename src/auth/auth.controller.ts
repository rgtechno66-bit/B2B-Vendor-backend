// src/auth/auth.controller.ts
import { Controller, Post, Body, Res, HttpStatus, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthDto } from './auth.dto';
import { Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  // @UseInterceptors(FileInterceptor('profile')) // Use 'profile' as the field name for the uploaded file
  async register(
    @Res() response: Response, // Move the required parameter before the optional one
    @Body() authDto: AuthDto,
    // @UploadedFile() file?: Express.Multer.File // Optional profile image
  ) {
    const result = await this.authService.register(authDto);
    return response.status(HttpStatus.OK).json({
      message: result.message,
      user: result.user,
    });
  }

  @Post('verify-otp')
  async verifyOtp(@Body() authDto: AuthDto) {
    return this.authService.verifyOtp(authDto);
  }

  @Post('login')
  async login(@Body() authDto: AuthDto) {
    return this.authService.login(authDto);
  }
}
