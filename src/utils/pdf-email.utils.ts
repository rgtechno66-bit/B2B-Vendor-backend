import * as nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';
import { CheckoutEntity } from '../checkout/checkout.entity';
import { CreateCheckoutDto } from '../checkout/checkout.dto';
import { EmailService } from '../service/email.service';
import { FileStorageService } from '../service/file-storage.service';

export class PdfEmailUtils {
  /**
   * Generate Professional PDF for order details with proper ₹ symbol
   */
  static async generatePDF(
    checkout: CheckoutEntity,
    createCheckoutDto: CreateCheckoutDto,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 40,
          autoFirstPage: true,
          font: 'Helvetica',
        });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (error) => reject(error));

        let y = 40;

        // Header with Company Info
        doc
          .fontSize(18)
          .font('Helvetica-Bold')
          .fillColor('#000000')
          .text('Intecomart', { align: 'center' });
        doc.moveDown(0.4);
        y = doc.y;
        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#000000')
          .text(
            'RG TECHNO INDUSTRIAL PRODUCTS PVT LTD F-471 SECTOR-63, NOIDA-201301 Uttar Pradesh, INDIA',
            { align: 'center' },
          );
        doc.moveDown(0.2);
        y = doc.y;
        doc.text('Phone: +91 9811068569 | Email: intecomart.com', {
          align: 'center',
        });
        doc.moveDown(0.8);
        y = doc.y;

        // Invoice Title
        doc
          .fontSize(20)
          .font('Helvetica-Bold')
          .fillColor('#000000')
          .text('PROFORMA INVOICE', { align: 'center' });
        doc.moveDown(0.9);
        y = doc.y;

        // Order and Customer Info in two columns
        const leftX = 40;
        const rightX = 300;
        const leftColumnWidth = 240; // Width for Customer Information to prevent overflow

        // Headers on same line - Customer Info left, Order Info right
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .fillColor('#000000')
          .text('Customer Information:', leftX, y)
          .text('Order Information:', rightX, y);
        y += 20;

        // Left Column - Customer Info Details with text wrapping
        let currentY = y;
        doc.fontSize(10).font('Helvetica').fillColor('#000000');

        // Name
        const nameText = `Name: ${checkout.name || 'N/A'}`;
        const nameHeight = doc.heightOfString(nameText, {
          width: leftColumnWidth,
        });
        doc.text(nameText, leftX, currentY, { width: leftColumnWidth });
        currentY += Math.max(nameHeight, 15);

        // Email
        const emailText = `Email: ${checkout.email || 'N/A'}`;
        const emailHeight = doc.heightOfString(emailText, {
          width: leftColumnWidth,
        });
        doc.text(emailText, leftX, currentY, { width: leftColumnWidth });
        currentY += Math.max(emailHeight, 15);

        // Mobile
        const mobileText = `Mobile: ${checkout.mobile || 'N/A'}`;
        const mobileHeight = doc.heightOfString(mobileText, {
          width: leftColumnWidth,
        });
        doc.text(mobileText, leftX, currentY, { width: leftColumnWidth });
        currentY += Math.max(mobileHeight, 15);

        // Address (includes address, city/state, and pincode)
        const addressParts = [];
        if (checkout.address) addressParts.push(checkout.address);
        if (checkout.state) addressParts.push(checkout.state);
        if (checkout.pincode) addressParts.push(checkout.pincode);
        const fullAddress =
          addressParts.length > 0 ? addressParts.join(', ') : 'N/A';
        const addressText = `Address: ${fullAddress}`;
        const addressHeight = doc.heightOfString(addressText, {
          width: leftColumnWidth,
        });
        doc.text(addressText, leftX, currentY, { width: leftColumnWidth });
        currentY += Math.max(addressHeight, 15);

        // Right Column - Order Info Details (aligned to start at same y as Customer Info)
        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#000000')
          .text(
            `Order No: ${checkout.orderNo || checkout.id || 'N/A'}`,
            rightX,
            y,
          )
          .text(
            `Date: ${new Date(checkout.createdAt || Date.now()).toLocaleDateString()}`,
            rightX,
            y + 15,
          )
          .text(`Status: Pending`, rightX, y + 45);

        // Update y to the maximum of customer info height or fixed height for next section
        y = Math.max(currentY, y + 60) + 20;

        // Products Table Header
        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .fillColor('#000000')
          .text('Order Items:', 40, y);
        y += 25;

        // Table header with background
        doc.rect(40, y, 520, 25).fillColor('#e0e0e0').fill();
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .fillColor('#000000')
          .text('Sr.', 50, y + 5)
          .text('Product Name', 80, y + 5)
          .text('Qty', 350, y + 5)
          .text('Price', 400, y + 5)
          .text('Total', 470, y + 5);
        y += 30;

        // Products List
        let totalAmount = 0;
        createCheckoutDto.products.forEach((product, index) => {
          const qty = product.quantity || product.noOfPkg || 0;
          const price = product.sellingPrice || 0;
          const total = qty * price;
          totalAmount += total;

          // Alternate row colors
          if (index % 2 === 0) {
            doc
              .rect(40, y - 5, 520, 20)
              .fillColor('#f5f5f5')
              .fill();
          }

          doc
            .fontSize(10)
            .font('Helvetica')
            .fillColor('#000000')
            .text(`${index + 1}`, 50, y)
            .text(product.itemName || 'N/A', 80, y, { width: 260 })
            .text(`${qty}`, 350, y)
            .text(`Rs. ${Number(price).toLocaleString('en-IN')}`, 400, y)
            .text(`Rs. ${Number(total).toLocaleString('en-IN')}`, 470, y);
          y += 20;
        });

        y += 20;

        // Summary Box
        const summaryWidth = 200;
        const summaryX = 400;

        doc
          .rect(summaryX, y, summaryWidth, 100)
          .fillColor('#f8f9fa')
          .fill()
          .strokeColor('#000000')
          .lineWidth(1)
          .stroke();

        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .fillColor('#000000')
          .text('Order Summary', summaryX + 10, y + 10);
        y += 30;

        const discount = Number(checkout.discount) || 0;
        const total = Number(checkout.total) || totalAmount - discount;

        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .fillColor('#000000')
          .text('Subtotal:', summaryX + 10, y)
          .text('Discount:', summaryX + 10, y + 20)
          .text('Total:', summaryX + 10, y + 40);

        doc
          .font('Helvetica')
          .fillColor('#000000')
          .text(
            `Rs. ${Number(totalAmount).toLocaleString('en-IN')}`,
            summaryX + 100,
            y,
          )
          .text(
            `-Rs. ${Number(discount).toLocaleString('en-IN')}`,
            summaryX + 100,
            y + 20,
          )
          .font('Helvetica-Bold')
          .fontSize(12)
          .text(
            `Rs. ${Number(total).toLocaleString('en-IN')}`,
            summaryX + 100,
            y + 40,
          );

        // Amount in words
        y += 60;
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .fillColor('#000000')
          .text('Amount in Words:', 40, y);
        doc
          .font('Helvetica')
          .fillColor('#000000')
          .text(this.numberToWords(total), 40, y + 15, { width: 350 });

        // Footer
        y += 40;
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .fillColor('#000000')
          .text('Terms & Conditions:', 40, y);
        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor('#000000')
          .text('• Payment is due within 30 days', 40, y + 15)
          .text('• Goods once sold will not be taken back', 40, y + 25)
          .text('• This is a computer generated invoice', 40, y + 35);

        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .fillColor('#000000')
          .text('Thank you for your business!', { align: 'center' });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private static numberToWords(num: number): string {
    if (num === 0) return 'Zero Rupees Only';

    const rupees = Math.floor(num);
    const paise = Math.round((num - rupees) * 100);

    let result = '';

    if (rupees > 0) {
      result += this.convertNumberToWords(rupees) + ' Rupees ';
    }

    if (paise > 0) {
      result += this.convertNumberToWords(paise) + ' Paise ';
    }

    return result.trim() + ' Only';
  }

  private static convertNumberToWords(num: number): string {
    const ones = [
      '',
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
      'Six',
      'Seven',
      'Eight',
      'Nine',
    ];
    const tens = [
      '',
      '',
      'Twenty',
      'Thirty',
      'Forty',
      'Fifty',
      'Sixty',
      'Seventy',
      'Eighty',
      'Ninety',
    ];
    const teens = [
      'Ten',
      'Eleven',
      'Twelve',
      'Thirteen',
      'Fourteen',
      'Fifteen',
      'Sixteen',
      'Seventeen',
      'Eighteen',
      'Nineteen',
    ];

    if (num === 0) return 'Zero';

    let result = '';

    if (num >= 10000000) {
      result +=
        this.convertNumberToWords(Math.floor(num / 10000000)) + ' Crore ';
      num %= 10000000;
    }
    if (num >= 100000) {
      result += this.convertNumberToWords(Math.floor(num / 100000)) + ' Lakh ';
      num %= 100000;
    }
    if (num >= 1000) {
      result +=
        this.convertNumberToWords(Math.floor(num / 1000)) + ' Thousand ';
      num %= 1000;
    }
    if (num >= 100) {
      result += ones[Math.floor(num / 100)] + ' Hundred ';
      num %= 100;
    }
    if (num >= 20) {
      result += tens[Math.floor(num / 10)] + ' ';
      num %= 10;
    }
    if (num >= 10) {
      result += teens[num - 10] + ' ';
    } else if (num > 0) {
      result += ones[num] + ' ';
    }

    return result.trim();
  }

  /**
   * Send email with PDF attachment and save the file locally
   */
  static async sendEmailWithPDF(
    checkout: CheckoutEntity,
    createCheckoutDto: CreateCheckoutDto,
    fileStorageService: FileStorageService,
  ): Promise<string | null> {
    try {
      // Create PDF
      const pdfBuffer = await this.generatePDF(checkout, createCheckoutDto);

      // Send email using EmailService
      const emailService = new EmailService();
      await emailService.sendEmailPDF(pdfBuffer, checkout, createCheckoutDto);

      let fileUrl: string | null = null;
      try {
        const fileName = `invoice-${checkout.id}-${Date.now()}.pdf`;
        fileUrl = await fileStorageService.uploadFile(
          pdfBuffer,
          'invoices',
          fileName,
        );
        console.log('PDF saved locally:', fileUrl);
      } catch (uploadError) {
        console.error('Local PDF save failed:', uploadError);
        // Don't throw error, just log it - email was still sent successfully
      }

      console.log('Email sent successfully');
      return fileUrl;
    } catch (error: any) {
      console.error('Email sending failed:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }
}
