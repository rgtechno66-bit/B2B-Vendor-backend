import * as nodemailer from 'nodemailer';
import { Injectable } from '@nestjs/common';
import { CheckoutEntity } from 'checkout/checkout.entity';
import { CreateCheckoutDto } from 'checkout/checkout.dto';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  constructor() {
  //   this.transporter = nodemailer.createTransport({
  //     service: 'Gmail', // Use your email service
  //     auth: {
  //       user: process.env.SMTP_USER,
  //       pass: process.env.SMTP_PASS,
  //     },
  //   });
  // }
  this.transporter = nodemailer.createTransport({
    // 1. 'Gmail' service hatakar direct secure Google SMTP host use karein
    host: 'smtp.gmail.com', 
    port: 465, // Secure SSL port use karein
    secure: true, // Port 465 ke liye ise true hona chahiye
    auth: {
      user: process.env.SMTP_USER, // info@intecomart.com
      pass: process.env.SMTP_PASS, // Aapka 16-character App Password (bina spaces ke)
    },
    // TLS requirements for security handshake
    tls: {
      rejectUnauthorized: false
    }
  });
}

  async sendOTP(email: string, otp: string): Promise<string> {
    const mailOptions = {
      from: process.env.SMTP_USER,
      to: email,
      subject: 'Your OTP Code',
      text: `Your OTP is: ${otp}`,
      html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 10px; padding: 20px; background-color: #f9f9f9;">
                <h2 style="color: #333; text-align: center;">One-Time Password (OTP)</h2>
                <p style="color: #555; font-size: 16px;">
                    Dear User,
                </p>
                <p style="color: #555; font-size: 16px;">
                    You requested a one-time password (OTP) to access your account. Use the code below to proceed:
                </p>
                <div style="text-align: center; margin: 20px;">
                    <span style="font-size: 24px; font-weight: bold; color: #2d89ef; border: 2px dashed #2d89ef; padding: 10px 20px; border-radius: 5px; display: inline-block;">
                        ${otp}
                    </span>
                </div>
                <p style="color: #555; font-size: 16px;">
                    This OTP is valid for the next <strong>5 minutes</strong>. If you did not request this, please ignore this email or contact support.
                </p>
                <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                <p style="color: #777; font-size: 12px; text-align: center;">
                    If you have any questions, feel free to reach out to our support team.
                </p>
            </div>
        `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`OTP sent to ${email}: ${otp}`);
      return otp; // Return OTP to verify later
    } catch (error) {
      throw new Error('Failed to send OTP');
    }
  }

  async sendOrderEmail(pdfBuffer: Buffer): Promise<void> {
    const mailOptions = {
      from: process.env.SMTP_USER,
      to: 'johndoe@yopmail.com',
      subject: 'New Order Created',
      text: 'A new order has been created. Please find the order details attached.',
      attachments: [
        {
          filename: 'order.pdf',
          content: pdfBuffer,
        },
      ],
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log('Order email sent to admin.');
    } catch (error) {
      throw new Error('Failed to send order email');
    }
  }

  async sendEmailPDF(
    pdfBuffer: Buffer,
    checkout: CheckoutEntity,
    createCheckoutDto: CreateCheckoutDto,
  ): Promise<void> {
    const mailOptions = {
      from: process.env.SMTP_USER,
      to: process.env.EMAIL_USER,
      subject: `New Order - ${checkout.name}`,
      html: `
              <h2>New Order Received</h2>
              <p><strong>Customer:</strong> ${checkout.name}</p>
              <p><strong>Email:</strong> ${checkout.email}</p>
              <p><strong>Mobile:</strong> ${checkout.mobile}</p>
              <p><strong>Address:</strong> ${checkout.address}, ${checkout.state}, ${checkout.country} - ${checkout.pincode}</p>
              <p><strong>Total Amount:</strong> ₹${checkout.total}</p>
              <p><strong>Status:</strong> ${checkout.status}</p>
              <br>
              <h3>Products Ordered:</h3>
              ${createCheckoutDto.products
                .map(
                  (product) => `
                <p><strong>${product.itemName}</strong></p>
                <p>Quantity: ${product.quantity} | Packages: ${product.noOfPkg} | Price: ₹${product.sellingPrice} | Subtotal: ₹${product.subtotal}</p>
              `,
                )
                .join('')}
            `,
      attachments: [
        {
          filename: `order-${checkout.id}.pdf`,
          content: pdfBuffer,
        },
      ],
    };
    try {
      await this.transporter.sendMail(mailOptions);
      console.log('Order email sent to admin.');
    } catch (error) {
      throw new Error('Failed to send order email');
    }
  }
}
