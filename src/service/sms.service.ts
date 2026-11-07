import { Injectable } from '@nestjs/common';
import Twilio from 'twilio';

@Injectable()
export class SMSService {
  private twilioClient: Twilio.Twilio;

  constructor() {
    this.twilioClient = Twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
    );
  }

  /**
   * Sends an OTP via SMS.
   * @param mobile Recipient mobile number
   * @param otp The one-time password
   */
  async sendTextOTP(mobile: string, otp: string): Promise<string> {
    try {
      const message = await this.twilioClient.messages.create({
        body: `Your verification code is ${otp}. This code is valid for 5 minutes. 
                       Please do not share it with anyone. If you did not request this, please contact our support team.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: `+91${mobile}`,
      });

      console.log(`SMS sent to ${mobile}: SID ${message.sid}`);
      return otp; // Return OTP for verification purposes
    } catch (error) {
      console.error('Error sending SMS:', error);
      throw new Error('Failed to send OTP via SMS');
    }
  }
}
