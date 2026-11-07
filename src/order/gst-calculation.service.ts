// gst-calculation.service.ts
import { Injectable } from '@nestjs/common';
import { OrderItemEntity } from './order.item.entity';
import { OrderEntity } from './order.entity';

export interface GSTBreakdown {
  cgst: number;
  sgst: number;
  igst: number;
  totalGST: number;
}

export interface ItemGSTDetails {
  itemId: string;
  itemName: string;
  price: number;
  quantity: number;
  itemDiscount: number;
  priceAfterItemDiscount: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGST: number;
  finalPrice: number;
}

export interface OrderSummary {
  items: ItemGSTDetails[];
  subtotal: number;
  totalItemDiscount: number;
  subtotalAfterItemDiscount: number;
  orderLevelDiscount: number;
  subtotalAfterOrderDiscount: number;
  gstBreakdown: GSTBreakdown;
  totalAmount: number;
  isSameState: boolean;
}

@Injectable()
export class GSTCalculationService {
  /**
   * Calculate GST breakdown for order items
   * @param orderItems - Array of order items
   * @param order - Order entity with address and discount
   * @param adminState - Admin's state for comparison
   * @returns Order summary with GST breakdown
   */
  calculateOrderSummary(
    orderItems: OrderItemEntity[],
    order: OrderEntity,
    adminState: string | null,
  ): OrderSummary {
    // Compare admin profile state with vendor/user profile state (not address state)
    // If admin state == vendor state, then CGST/SGST applies, else IGST applies
    const vendorState = order.user?.state || null;
    const isSameState = !!(
      adminState &&
      vendorState &&
      adminState === vendorState
    );
    const items: ItemGSTDetails[] = [];
    let subtotal = 0;
    let totalItemDiscount = 0;

    // Calculate per-item details
    for (const orderItem of orderItems) {
      const itemPrice = orderItem.product.sellingPrice;
      const quantity = orderItem.quantity;
      const itemTotal = itemPrice * quantity;
      const itemDiscount = orderItem.discount || 0;
      const priceAfterItemDiscount = itemTotal - itemDiscount;
      const gstRate = orderItem.product.gstRate || 0;

      // Calculate GST for this item
      let cgst = 0;
      let sgst = 0;
      let igst = 0;

      if (gstRate > 0) {
        if (isSameState) {
          // CGST and SGST are half of total GST rate each
          cgst = (priceAfterItemDiscount * gstRate) / 200; // Divide by 2 for CGST
          sgst = (priceAfterItemDiscount * gstRate) / 200; // Divide by 2 for SGST
        } else {
          // IGST is full GST rate
          igst = (priceAfterItemDiscount * gstRate) / 100;
        }
      }

      const totalGST = cgst + sgst + igst;
      const finalPrice = priceAfterItemDiscount + totalGST;

      items.push({
        itemId: orderItem.id,
        itemName: orderItem.product.itemName,
        price: itemPrice,
        quantity,
        itemDiscount,
        priceAfterItemDiscount,
        gstRate,
        cgst,
        sgst,
        igst,
        totalGST,
        finalPrice,
      });

      subtotal += itemTotal;
      totalItemDiscount += itemDiscount;
    }

    const subtotalAfterItemDiscount = subtotal - totalItemDiscount;

    // Calculate order-level discount amount (discount is stored as percentage)
    // Discount is applied ONLY on subtotal, NOT on GST
    const orderLevelDiscountPercentage = order.discount || 0;
    const orderLevelDiscount =
      (subtotalAfterItemDiscount * orderLevelDiscountPercentage) / 100;
    const subtotalAfterOrderDiscount =
      subtotalAfterItemDiscount - orderLevelDiscount;

    // Calculate total GST breakdown
    // GST is calculated on subtotalAfterItemDiscount, NOT affected by order discount
    let totalCGST = 0;
    let totalSGST = 0;
    let totalIGST = 0;

    items.forEach((item) => {
      totalCGST += item.cgst;
      totalSGST += item.sgst;
      totalIGST += item.igst;
    });

    // GST is NOT affected by order-level discount
    // Discount is applied only on subtotal, GST remains separate
    const gstBreakdown: GSTBreakdown = {
      cgst: totalCGST,
      sgst: totalSGST,
      igst: totalIGST,
      totalGST: totalCGST + totalSGST + totalIGST,
    };

    // Final amount = (Subtotal - Order Discount) + GST
    const totalAmount = subtotalAfterOrderDiscount + gstBreakdown.totalGST;

    return {
      items,
      subtotal,
      totalItemDiscount,
      subtotalAfterItemDiscount,
      orderLevelDiscount,
      subtotalAfterOrderDiscount,
      gstBreakdown,
      totalAmount,
      isSameState,
    };
  }
}
