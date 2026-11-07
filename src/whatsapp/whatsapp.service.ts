import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly apiUrl =
    process.env.WHATSAPP_API_URL || 'https://api.whatsapp.com';
  private readonly accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  private readonly phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  constructor() {
    if (!this.accessToken || !this.phoneNumberId) {
      this.logger.warn('WhatsApp credentials not configured properly');
    }
  }

  /**
   * Send simple WhatsApp message using WhatsApp Business API
   */
  async sendMessage(phoneNumber: string, message: string): Promise<string> {
    try {
      // Remove any non-digit characters and ensure proper format
      const cleanPhoneNumber = this.formatPhoneNumber(phoneNumber);

      const payload = {
        messaging_product: 'whatsapp',
        to: cleanPhoneNumber,
        type: 'text',
        text: {
          body: message,
        },
      };

      const response = await axios.post(
        `${this.apiUrl}/v17.0/${this.phoneNumberId}/messages`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(
        `WhatsApp message sent to ${phoneNumber}: ${response.data.messages[0].id}`,
      );
      return response.data.messages[0].id;
    } catch (error: any) {
      this.logger.error(
        'Error sending WhatsApp message:',
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to send WhatsApp message: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  /**
   * Send PDF document via WhatsApp
   */
  async sendPDF(
    phoneNumber: string,
    pdfUrl: string,
    caption?: string,
  ): Promise<string> {
    try {
      const cleanPhoneNumber = this.formatPhoneNumber(phoneNumber);

      const payload = {
        messaging_product: 'whatsapp',
        to: cleanPhoneNumber,
        type: 'document',
        document: {
          link: pdfUrl,
          caption: caption || 'Document',
          filename: 'document.pdf',
        },
      };

      const response = await axios.post(
        `${this.apiUrl}/v17.0/${this.phoneNumberId}/messages`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(
        `WhatsApp PDF sent to ${phoneNumber}: ${response.data.messages[0].id}`,
      );
      return response.data.messages[0].id;
    } catch (error: any) {
      this.logger.error(
        'Error sending WhatsApp PDF:',
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to send WhatsApp PDF: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  /**
   * Send image via WhatsApp
   */
  async sendImage(
    phoneNumber: string,
    imageUrl: string,
    caption?: string,
  ): Promise<string> {
    try {
      const cleanPhoneNumber = this.formatPhoneNumber(phoneNumber);

      const payload = {
        messaging_product: 'whatsapp',
        to: cleanPhoneNumber,
        type: 'image',
        image: {
          link: imageUrl,
          caption: caption,
        },
      };

      const response = await axios.post(
        `${this.apiUrl}/v17.0/${this.phoneNumberId}/messages`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(
        `WhatsApp image sent to ${phoneNumber}: ${response.data.messages[0].id}`,
      );
      return response.data.messages[0].id;
    } catch (error: any) {
      this.logger.error(
        'Error sending WhatsApp image:',
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to send WhatsApp image: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  /**
   * Send video via WhatsApp
   */
  async sendVideo(
    phoneNumber: string,
    videoUrl: string,
    caption?: string,
  ): Promise<string> {
    try {
      const cleanPhoneNumber = this.formatPhoneNumber(phoneNumber);

      const payload = {
        messaging_product: 'whatsapp',
        to: cleanPhoneNumber,
        type: 'video',
        video: {
          link: videoUrl,
          caption: caption,
        },
      };

      const response = await axios.post(
        `${this.apiUrl}/v17.0/${this.phoneNumberId}/messages`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(
        `WhatsApp video sent to ${phoneNumber}: ${response.data.messages[0].id}`,
      );
      return response.data.messages[0].id;
    } catch (error: any) {
      this.logger.error(
        'Error sending WhatsApp video:',
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to send WhatsApp video: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  /**
   * Send bulk messages to multiple numbers
   */
  async sendBulkMessages(
    phoneNumbers: string[],
    message: string,
  ): Promise<{ success: string[]; failed: string[] }> {
    const success: string[] = [];
    const failed: string[] = [];

    for (const phoneNumber of phoneNumbers) {
      try {
        const messageId = await this.sendMessage(phoneNumber, message);
        success.push(phoneNumber);
        this.logger.log(`Bulk message sent to ${phoneNumber}: ${messageId}`);
      } catch (error: any) {
        failed.push(phoneNumber);
        this.logger.error(
          `Failed to send bulk message to ${phoneNumber}:`,
          error.message,
        );
      }
    }

    return { success, failed };
  }

  /**
   * Send template message (for approved templates)
   */
  async sendTemplateMessage(
    phoneNumber: string,
    templateName: string,
    language: string = 'en_US',
    components?: any[],
  ): Promise<string> {
    try {
      const cleanPhoneNumber = this.formatPhoneNumber(phoneNumber);

      const payload = {
        messaging_product: 'whatsapp',
        to: cleanPhoneNumber,
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: language,
          },
          components: components || [],
        },
      };

      const response = await axios.post(
        `${this.apiUrl}/v17.0/${this.phoneNumberId}/messages`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(
        `Template message sent to ${phoneNumber}: ${response.data.messages[0].id}`,
      );
      return response.data.messages[0].id;
    } catch (error: any) {
      this.logger.error(
        'Error sending template message:',
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to send template message: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  /**
   * Check message status
   */
  async getMessageStatus(messageId: string): Promise<any> {
    try {
      const response = await axios.get(`${this.apiUrl}/v17.0/${messageId}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      return response.data;
    } catch (error: any) {
      this.logger.error(
        'Error getting message status:',
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to get message status: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  /**
   * Format phone number to international format
   */
  private formatPhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters
    let cleanNumber = phoneNumber.replace(/\D/g, '');

    // If number starts with 0, remove it
    if (cleanNumber.startsWith('0')) {
      cleanNumber = cleanNumber.substring(1);
    }

    // If number doesn't start with country code, add +91 for India
    if (!cleanNumber.startsWith('91') && cleanNumber.length === 10) {
      cleanNumber = '91' + cleanNumber;
    }

    // Add + prefix
    return '+' + cleanNumber;
  }

  /**
   * Validate phone number format
   */
  validatePhoneNumber(phoneNumber: string): boolean {
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    return cleanNumber.length >= 10 && cleanNumber.length <= 15;
  }
}
