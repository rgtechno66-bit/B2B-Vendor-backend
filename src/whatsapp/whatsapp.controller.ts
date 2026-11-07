import {
  Controller,
  Post,
  Body,
  HttpStatus,
  Res,
  Get,
  Param,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { Response } from 'express';
import { WhatsAppService } from './whatsapp.service';
import {
  SendMessageDto,
  SendPDFDto,
  SendMediaDto,
  SendBulkMessageDto,
} from './whatsapp.dto';

@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  @Post('send-message')
  @UsePipes(new ValidationPipe())
  async sendMessage(@Body() dto: SendMessageDto, @Res() response: Response) {
    try {
      if (!this.whatsappService.validatePhoneNumber(dto.phoneNumber)) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: 'Invalid phone number format',
        });
      }

      const messageId = await this.whatsappService.sendMessage(
        dto.phoneNumber,
        dto.message,
      );

      return response.status(HttpStatus.OK).json({
        success: true,
        message: 'WhatsApp message sent successfully',
        data: {
          messageId,
          phoneNumber: dto.phoneNumber,
        },
      });
    } catch (error: any) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message,
      });
    }
  }

  @Post('send-pdf')
  @UsePipes(new ValidationPipe())
  async sendPDF(@Body() dto: SendPDFDto, @Res() response: Response) {
    try {
      if (!this.whatsappService.validatePhoneNumber(dto.phoneNumber)) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: 'Invalid phone number format',
        });
      }

      const messageId = await this.whatsappService.sendPDF(
        dto.phoneNumber,
        dto.pdfUrl,
        dto.caption,
      );

      return response.status(HttpStatus.OK).json({
        success: true,
        message: 'WhatsApp PDF sent successfully',
        data: {
          messageId,
          phoneNumber: dto.phoneNumber,
          pdfUrl: dto.pdfUrl,
        },
      });
    } catch (error: any) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message,
      });
    }
  }

  @Post('send-image')
  @UsePipes(new ValidationPipe())
  async sendImage(@Body() dto: SendMediaDto, @Res() response: Response) {
    try {
      if (!this.whatsappService.validatePhoneNumber(dto.phoneNumber)) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: 'Invalid phone number format',
        });
      }

      const messageId = await this.whatsappService.sendImage(
        dto.phoneNumber,
        dto.mediaUrl,
        dto.caption,
      );

      return response.status(HttpStatus.OK).json({
        success: true,
        message: 'WhatsApp image sent successfully',
        data: {
          messageId,
          phoneNumber: dto.phoneNumber,
          imageUrl: dto.mediaUrl,
        },
      });
    } catch (error: any) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message,
      });
    }
  }

  @Post('send-video')
  @UsePipes(new ValidationPipe())
  async sendVideo(@Body() dto: SendMediaDto, @Res() response: Response) {
    try {
      if (!this.whatsappService.validatePhoneNumber(dto.phoneNumber)) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: 'Invalid phone number format',
        });
      }

      const messageId = await this.whatsappService.sendVideo(
        dto.phoneNumber,
        dto.mediaUrl,
        dto.caption,
      );

      return response.status(HttpStatus.OK).json({
        success: true,
        message: 'WhatsApp video sent successfully',
        data: {
          messageId,
          phoneNumber: dto.phoneNumber,
          videoUrl: dto.mediaUrl,
        },
      });
    } catch (error: any) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message,
      });
    }
  }

  @Post('send-bulk')
  @UsePipes(new ValidationPipe())
  async sendBulkMessages(
    @Body() dto: SendBulkMessageDto,
    @Res() response: Response,
  ) {
    try {
      // Validate all phone numbers
      const invalidNumbers = dto.phoneNumbers.filter(
        (number) => !this.whatsappService.validatePhoneNumber(number),
      );

      if (invalidNumbers.length > 0) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: 'Some phone numbers are invalid',
          invalidNumbers,
        });
      }

      const result = await this.whatsappService.sendBulkMessages(
        dto.phoneNumbers,
        dto.message,
      );

      return response.status(HttpStatus.OK).json({
        success: true,
        message: 'Bulk messages sent successfully',
        data: result,
      });
    } catch (error: any) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message,
      });
    }
  }

  @Post('send-template')
  async sendTemplateMessage(
    @Body()
    body: {
      phoneNumber: string;
      templateName: string;
      language?: string;
      components?: any[];
    },
    @Res() response: Response,
  ) {
    try {
      if (!this.whatsappService.validatePhoneNumber(body.phoneNumber)) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: 'Invalid phone number format',
        });
      }

      const messageId = await this.whatsappService.sendTemplateMessage(
        body.phoneNumber,
        body.templateName,
        body.language,
        body.components,
      );

      return response.status(HttpStatus.OK).json({
        success: true,
        message: 'Template message sent successfully',
        data: {
          messageId,
          phoneNumber: body.phoneNumber,
          templateName: body.templateName,
        },
      });
    } catch (error: any) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message,
      });
    }
  }

  @Get('status/:messageId')
  async getMessageStatus(
    @Param('messageId') messageId: string,
    @Res() response: Response,
  ) {
    try {
      const status = await this.whatsappService.getMessageStatus(messageId);

      return response.status(HttpStatus.OK).json({
        success: true,
        data: status,
      });
    } catch (error: any) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message,
      });
    }
  }
}
