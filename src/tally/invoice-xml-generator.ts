// invoice-xml-generator.ts

import { TallySettings } from 'settings/setting.entity';
import { OrderEntity } from './../order/order.entity';
import { OrderItemEntity } from './../order/order.item.entity';

/**
 * Round to 2 decimal places (general)
 */
function roundToTwoDecimals(value: number): number {
  return Math.round((value - 0.0001) * 100) / 100;
}

/**
 * Round final amount: third decimal >= 5 → round UP so 8323.425 → 8323.43 (matches order summary display)
 */
function roundFinalAmountToTwoDecimals(value: number): number {
  return Math.round((value + 1e-9) * 100) / 100;
}

/**
 * Format with half-up: .5 rounds up, so 1269.675 → "1269.68". Use for GST/discount amounts in XML.
 */
function formatToTwoDecimalsHalfUp(value: number): string {
  return roundFinalAmountToTwoDecimals(value).toFixed(2);
}

/**
 * Format a number to 2 decimal places string with proper rounding
 */
function formatToTwoDecimals(value: number): string {
  const rounded = roundToTwoDecimals(value);
  return rounded.toFixed(2);
}

/**
 * Escape text for Tally XML: & → &amp;, ' → &apos;, " → &quot;, , → &#44;
 * Apply to all party names, addresses, and other user-supplied strings in the XML.
 */
function escapeForTallyXml(str: string | null | undefined): string {
  if (str == null || str === '') return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/'/g, '&apos;')
    .replace(/"/g, '&quot;')
    .replace(/,/g, '&#44;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function generateInvoiceXML(
  order: OrderEntity,
  orderItems: OrderItemEntity[],
  adminState: string | null,
  tallySettings: TallySettings[],
): string {
  const {
    user,
    address,
    totalPrice,
    orderNo,
    discount,
    createdAt,
    finalAmount,
  } = order;
  // Check if createdAt is defined, or use the current date as fallback
  // finalAmount is the final amount from order summary (includes discounts and GST)

  // Note: discount calculation will be done after subtotalAfterItemDiscount is calculated
  // We'll calculate it later in the code

  // Map Tally settings
  const salesLedger =
    tallySettings.find((setting) => setting.name === 'Sales')?.value || 'Sales';
  const discountLedger =
    tallySettings.find((setting) => setting.name === 'Discount On Sale')
      ?.value || 'Discount On Sale';
  const cgstLedger =
    tallySettings.find((setting) => setting.name === 'Central Tax Ledger')
      ?.value || 'CGST';
  const sgstLedger =
    tallySettings.find((setting) => setting.name === 'State Tax Ledger')
      ?.value || 'SGST';
  const igstLedger =
    tallySettings.find((setting) => setting.name === 'Interstate Tax Ledger')
      ?.value || 'IGST';
  const currentCompanyName = tallySettings.find(
    (setting) => setting.name === 'Current Company Name',
  )?.value;

  // Determine tax type and amount based on adminState
  // Compare admin profile state with vendor/user profile state (not address state)
  // If admin state == vendor state, then CGST/SGST applies, else IGST applies
  const vendorState = user?.state || null;
  const isSameState = !!(
    adminState &&
    vendorState &&
    adminState === vendorState
  );

  // Generate XML for each product in the order
  const inventoryEntriesXML = orderItems
    .map((orderItem) => {
      // Create dynamic sales ledger name by appending GST rate
      // If IGST (different state): "IGSTSales18", if same state: "Sales18"
      const gstRate = orderItem.product.gstRate || 0;
      const dynamicSalesLedger = isSameState
        ? `${salesLedger}${gstRate}`
        : `IGST${salesLedger}${gstRate}`;

      return `
        <ALLINVENTORYENTRIES.LIST>
            <STOCKITEMNAME>${escapeForTallyXml(orderItem.product.itemName)}</STOCKITEMNAME>
            <GSTOVRDNISREVCHARGEAPPL>&#4; Not Applicable</GSTOVRDNISREVCHARGEAPPL>
            <GSTOVRDNTAXABILITY>Taxable</GSTOVRDNTAXABILITY>
            <GSTSOURCETYPE>Stock Item</GSTSOURCETYPE>
            <GSTITEMSOURCE>${escapeForTallyXml(orderItem.product.itemName)}</GSTITEMSOURCE>
            <GSTOVRDNSTOREDNATURE/>
            <GSTOVRDNTYPEOFSUPPLY>Goods</GSTOVRDNTYPEOFSUPPLY>
            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
            <RATE>${orderItem.product.sellingPrice}/PCS</RATE>
            ${(() => {
              const itemTotal =
                orderItem.product.sellingPrice * orderItem.quantity;
              const discountAmount = orderItem.discount || 0;
              const discountPercentage =
                itemTotal > 0 ? (discountAmount / itemTotal) * 100 : 0;
              return `<DISCOUNT>${Math.round(discountPercentage)}</DISCOUNT>`;
            })()}
            <AMOUNT>${orderItem.product.sellingPrice * orderItem.quantity - orderItem.discount}</AMOUNT>
            <ACTUALQTY>${orderItem.quantity} PCS</ACTUALQTY>
            <BILLEDQTY>${orderItem.quantity} PCS</BILLEDQTY>
            <BATCHALLOCATIONS.LIST>
                <BATCHNAME>Primary Batch</BATCHNAME>
                <INDENTNO>&#4; Not Applicable</INDENTNO>
                <ORDERNO></ORDERNO>
                <TRACKINGNUMBER>&#4; Not Applicable</TRACKINGNUMBER>
                <AMOUNT>${orderItem.product.sellingPrice * orderItem.quantity - orderItem.discount}</AMOUNT>
                <ACTUALQTY>${orderItem.quantity}</ACTUALQTY>
                <BILLEDQTY>${orderItem.quantity}</BILLEDQTY>
                
            </BATCHALLOCATIONS.LIST>
            <ACCOUNTINGALLOCATIONS.LIST>
                <LEDGERNAME>${escapeForTallyXml(dynamicSalesLedger)}</LEDGERNAME>
                <GSTCLASS>&#4; Not Applicable</GSTCLASS>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <AMOUNT>${orderItem.product.sellingPrice * orderItem.quantity - orderItem.discount}</AMOUNT>
            </ACCOUNTINGALLOCATIONS.LIST>
            <DUTYHEADDETAILS.LIST></DUTYHEADDETAILS.LIST>
            ${generateRateDetails(orderItem.product.gstRate)}
        </ALLINVENTORYENTRIES.LIST>
    `;
    })
    .join('');

  // Calculate final amount: Subtotal (after item discounts) - Order discount + GST
  // Step 1: Calculate subtotal and item discounts
  let subtotal = 0;
  let totalItemDiscount = 0;
  orderItems.forEach((orderItem) => {
    const itemTotal = orderItem.product.sellingPrice * orderItem.quantity;
    subtotal += itemTotal;
    totalItemDiscount += orderItem.discount || 0;
  });

  // Step 2: Subtotal after item discounts
  const subtotalAfterItemDiscount = subtotal - totalItemDiscount;

  // Step 3: Order-level discount amount (discount is percentage, same as frontend)
  const orderLevelDiscountPercentage = discount || 0;
  const orderLevelDiscount =
    (subtotalAfterItemDiscount * orderLevelDiscountPercentage) / 100;

  // Step 4: GST on amount AFTER order-level discount (proportional), same as frontend order summary
  // Frontend: itemPriceAfterOrderDiscount = priceAfterItemDiscount - (orderLevelDiscount * itemProportion); GST on that
  const totalBeforeOrderDiscount = subtotalAfterItemDiscount;
  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;

  orderItems.forEach((orderItem) => {
    const itemTotal = orderItem.product.sellingPrice * orderItem.quantity;
    const itemDiscount = orderItem.discount || 0;
    const priceAfterItemDiscount = itemTotal - itemDiscount;
    const itemProportion =
      totalBeforeOrderDiscount > 0
        ? priceAfterItemDiscount / totalBeforeOrderDiscount
        : 0;
    const itemPriceAfterOrderDiscount =
      priceAfterItemDiscount - orderLevelDiscount * itemProportion;
    const gstRate = orderItem.product.gstRate || 0;

    if (gstRate > 0) {
      if (isSameState) {
        totalCGST += (itemPriceAfterOrderDiscount * gstRate) / 200;
        totalSGST += (itemPriceAfterOrderDiscount * gstRate) / 200;
      } else {
        totalIGST += (itemPriceAfterOrderDiscount * gstRate) / 100;
      }
    }
  });

  // Step 5: Final = (Subtotal - Order Discount) + GST — same formula as frontend finalTotalWithGST
  const totalGST = isSameState ? totalCGST + totalSGST : totalIGST;
  const subtotalAfterOrderDiscount =
    subtotalAfterItemDiscount - orderLevelDiscount;
  const calculatedFinalAmount = subtotalAfterOrderDiscount + totalGST;

  // Use calculatedFinalAmount for XML (same formula as order summary); round-half-up so 8323.425 → 8323.43
  // order.finalAmount can be 8323.42 due to frontend float; we match order summary by using calculated + round-up
  const finalAmountRounded = roundFinalAmountToTwoDecimals(
    calculatedFinalAmount,
  );
  const finalAmountFormatted = finalAmountRounded.toFixed(2);

  // Calculate discount amount for discount ledger entry (for XML display)
  // Half-up same as GST: .5 rounds up so 371.255 → 371.26
  const discountAmount = orderLevelDiscount;
  const roundedDiscount = roundFinalAmountToTwoDecimals(discountAmount);
  const formattedAmount = `-${formatToTwoDecimalsHalfUp(roundedDiscount)}`;
  const formattedVatExpAmount = `-${formatToTwoDecimalsHalfUp(roundedDiscount)}`;

  // Calculate average GST rate from all order items for discount ledger naming
  let totalGSTValue = 0;
  let totalItemValue = 0;
  orderItems.forEach((orderItem) => {
    const itemValue = orderItem.product.sellingPrice * orderItem.quantity;
    totalItemValue += itemValue;
    const gstRate = orderItem.product.gstRate || 0;
    totalGSTValue += (itemValue * gstRate) / 100;
  });
  const averageGSTRate =
    totalItemValue > 0 ? (totalGSTValue / totalItemValue) * 100 : 0;

  // For discount ledger: if same state, use half rate (CGST/SGST), else full rate (IGST)
  const discountGSTRate = isSameState ? averageGSTRate / 2 : averageGSTRate;
  const dynamicDiscountLedger = `${discountLedger}${Math.round(discountGSTRate)}`;

  // Create dynamic GST ledger names with GST rates appended
  // If same state: CGST and SGST are half of average GST rate each
  // If different state: IGST is full average GST rate
  const cgstRate = isSameState ? Math.round(averageGSTRate / 2) : 0;
  const sgstRate = isSameState ? Math.round(averageGSTRate / 2) : 0;
  const igstRate = !isSameState ? Math.round(averageGSTRate) : 0;

  const dynamicCgstLedger = isSameState
    ? `${cgstLedger}${cgstRate}`
    : cgstLedger;
  const dynamicSgstLedger = isSameState
    ? `${sgstLedger}${sgstRate}`
    : sgstLedger;
  const dynamicIgstLedger = !isSameState
    ? `${igstLedger}${igstRate}`
    : igstLedger;

  // Use calculated GST amounts with half-up for XML so .5 rounds up (1269.675 → 1269.68)
  // Order entity values may have been saved with different rounding; XML uses item-based calc + half-up
  const cgstToUse = roundFinalAmountToTwoDecimals(totalCGST);
  const sgstToUse = roundFinalAmountToTwoDecimals(totalSGST);
  const igstToUse = roundFinalAmountToTwoDecimals(totalIGST);

  // Generate GST entries if applicable
  const gstXML = generateGSTDetails(
    isSameState,
    totalPrice,
    dynamicCgstLedger,
    dynamicSgstLedger,
    dynamicIgstLedger,
    cgstToUse,
    sgstToUse,
    igstToUse,
  );

  return `
<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Import Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <IMPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>Vouchers</REPORTNAME>
                 <STATICVARIABLES>
                   <SVCURRENTCOMPANY>${escapeForTallyXml(currentCompanyName)}</SVCURRENTCOMPANY>
                 </STATICVARIABLES>
            </REQUESTDESC>
            <REQUESTDATA>
                <TALLYMESSAGE xmlns:UDF="TallyUDF">
                    <VOUCHER VCHTYPE="Proforma Invoice" ACTION="Create" OBJVIEW="Invoice Voucher View">
                        <ADDRESS.LIST TYPE="String">
                            <ADDRESS>${escapeForTallyXml(address.street_address)}</ADDRESS>
                            <ADDRESS>${escapeForTallyXml(address.state)}</ADDRESS>
                            <ADDRESS>${escapeForTallyXml(address.country)}</ADDRESS>
                        </ADDRESS.LIST>
                        <BASICBUYERADDRESS.LIST TYPE="String">
                            <BASICBUYERADDRESS>${escapeForTallyXml(address.street_address)}</BASICBUYERADDRESS>
                            <BASICBUYERADDRESS>${escapeForTallyXml(address.state)}</BASICBUYERADDRESS>
                            <BASICBUYERADDRESS>${escapeForTallyXml(address.country)}</BASICBUYERADDRESS>
                        </BASICBUYERADDRESS.LIST>
                        <DATE>${formatDateT(new Date())}</DATE>
                        <GUID>${escapeForTallyXml(orderNo)}</GUID> 
                        <GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>
                        <VATDEALERTYPE>Regular</VATDEALERTYPE>
                        <STATENAME>${escapeForTallyXml(address.state)}</STATENAME>
                        <COUNTRYOFRESIDENCE>${escapeForTallyXml(address.country)}</COUNTRYOFRESIDENCE>
                        <PLACEOFSUPPLY>${escapeForTallyXml(address.state)}</PLACEOFSUPPLY>
                        <PARTYNAME>${escapeForTallyXml(user.name)}</PARTYNAME>
                        <BSID_NSIL_OracleID>${order.id}</BSID_NSIL_OracleID>
                        <CMPGSTIN>${escapeForTallyXml(user.gstNo)}</CMPGSTIN>
                        <PARTYGSTIN>${escapeForTallyXml(user.gstNo)}</PARTYGSTIN>
                        <VOUCHERTYPENAME>Proforma Invoice</VOUCHERTYPENAME>
                        <PARTYLEDGERNAME>${escapeForTallyXml(user.name)}</PARTYLEDGERNAME>
                        <BASICBUYERNAME>${escapeForTallyXml(user.name)}</BASICBUYERNAME>
                        <CMPGSTREGISTRATIONTYPE>Regular</CMPGSTREGISTRATIONTYPE>
                        <VOUCHERNUMBER>${escapeForTallyXml(orderNo)}</VOUCHERNUMBER>
                        <ISINVOICE>Yes</ISINVOICE>
                        <ISOPTIONAL>Yes</ISOPTIONAL>
                        <REFERENCE>${escapeForTallyXml(orderNo)}</REFERENCE>
                        <PARTYMAILINGNAME>${escapeForTallyXml(user.email)}</PARTYMAILINGNAME>
                        <CONSIGNEEMAILINGNAME>${escapeForTallyXml(user.email)}</CONSIGNEEMAILINGNAME>
                        <CONSIGNEESTATENAME>${escapeForTallyXml(address.state)}</CONSIGNEESTATENAME>
                        <CMPGSTSTATE>${escapeForTallyXml(address.state)}</CMPGSTSTATE>
                        <CONSIGNEECOUNTRYNAME>${escapeForTallyXml(address.country)}</CONSIGNEECOUNTRYNAME>
                        <BASICBASEPARTYNAME>${escapeForTallyXml(user.name)}</BASICBASEPARTYNAME>
                        <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
                        <BUYERPINNUMBER>${escapeForTallyXml(address.zip_code)}</BUYERPINNUMBER>
                        <CONSIGNEEPINNUMBER>${escapeForTallyXml(address.zip_code)}</CONSIGNEEPINNUMBER>
                        <EFFECTIVEDATE>${formatDateT(new Date())}</EFFECTIVEDATE>
                        <ISELIGIBLEFORITC>Yes</ISELIGIBLEFORITC>
                        <ISVATDUTYPAID>Yes</ISVATDUTYPAID>
                                 ${inventoryEntriesXML}
                        <LEDGERENTRIES.LIST>
                            <LEDGERNAME>${escapeForTallyXml(user.name)}</LEDGERNAME>
                            <GSTCLASS>&#4; Not Applicable</GSTCLASS>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <LEDGERFROMITEM>No</LEDGERFROMITEM>
                            <REMOVEZEROENTRIES>No</REMOVEZEROENTRIES>
                            <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
                            <ISLASTDEEMEDPOSITIVE>Yes</ISLASTDEEMEDPOSITIVE>
                            <AMOUNT>-${finalAmountFormatted}</AMOUNT>
                            <BILLALLOCATIONS.LIST>
                                <NAME>${escapeForTallyXml(orderNo)}</NAME>
                                <BILLTYPE>New Ref</BILLTYPE>
                                <AMOUNT>-${finalAmountFormatted}</AMOUNT>
                            </BILLALLOCATIONS.LIST>
                        </LEDGERENTRIES.LIST>

                         <LEDGERENTRIES.LIST>
                              <APPROPRIATEFOR>&#4; Not Applicable</APPROPRIATEFOR>
                               <ROUNDTYPE>&#4; Not Applicable</ROUNDTYPE>
                                 <LEDGERNAME>${escapeForTallyXml(discountLedger)}</LEDGERNAME>
                                  <GSTCLASS>&#4; Not Applicable</GSTCLASS>
                                      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                                       <AMOUNT>${formattedAmount}</AMOUNT>
                                      <VATEXPAMOUNT>${formattedVatExpAmount}</VATEXPAMOUNT>
                             </LEDGERENTRIES.LIST>
                            ${gstXML}
                    </VOUCHER>
                </TALLYMESSAGE>
            </REQUESTDATA>
        </IMPORTDATA>
    </BODY>
</ENVELOPE>
`;
}

// Helper function to generate GST details for CGST, SGST, or IGST
function generateGSTDetails(
  isSameState: boolean,
  totalPrice: number,
  cgstLedger: string,
  sgstLedger: string,
  igstLedger: string,
  cgstAmount: number,
  sgstAmount: number,
  igstAmount: number,
): string {
  // Round GST amounts half-up: .5 rounds up so 1269.675 → 1269.68
  const roundedCgst = roundFinalAmountToTwoDecimals(cgstAmount);
  const roundedSgst = roundFinalAmountToTwoDecimals(sgstAmount);
  const roundedIgst = roundFinalAmountToTwoDecimals(igstAmount);

  return isSameState
    ? `
                             <LEDGERENTRIES.LIST>
              <APPROPRIATEFOR>&#4; Not Applicable</APPROPRIATEFOR>
                <ROUNDTYPE>&#4; Not Applicable</ROUNDTYPE>
                 <LEDGERNAME>${escapeForTallyXml(cgstLedger)}</LEDGERNAME>
                            <GSTCLASS>&#4; Not Applicable</GSTCLASS>
                            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                            <AMOUNT>${formatToTwoDecimalsHalfUp(roundedCgst)}</AMOUNT>
                            <VATEXPAMOUNT>${formatToTwoDecimalsHalfUp(roundedCgst)}</VATEXPAMOUNT>
            </LEDGERENTRIES.LIST>

            <LEDGERENTRIES.LIST>
             <APPROPRIATEFOR>&#4; Not Applicable</APPROPRIATEFOR>
                <ROUNDTYPE>&#4; Not Applicable</ROUNDTYPE>
               <LEDGERNAME>${escapeForTallyXml(sgstLedger)}</LEDGERNAME>
                            <GSTCLASS>&#4; Not Applicable</GSTCLASS>
                            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                            <AMOUNT>${formatToTwoDecimalsHalfUp(roundedSgst)}</AMOUNT>
                            <VATEXPAMOUNT>${formatToTwoDecimalsHalfUp(roundedSgst)}</VATEXPAMOUNT>
            </LEDGERENTRIES.LIST>
        `
    : `
        <LEDGERENTRIES.LIST>
                            <APPROPRIATEFOR>&#4; Not Applicable</APPROPRIATEFOR>
                            <ROUNDTYPE>&#4; Not Applicable</ROUNDTYPE>
                            <LEDGERNAME>${escapeForTallyXml(igstLedger)}</LEDGERNAME>
                            <GSTCLASS>&#4; Not Applicable</GSTCLASS>
                            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                            <AMOUNT>${formatToTwoDecimalsHalfUp(roundedIgst)}</AMOUNT>
                            <VATEXPAMOUNT>${formatToTwoDecimalsHalfUp(roundedIgst)}</VATEXPAMOUNT>
                        </LEDGERENTRIES.LIST>
        `;
}

// Helper function to generate RATEDETAILS.LIST for GST rates
function generateRateDetails(gstRate: number): string {
  return `
        <RATEDETAILS.LIST>
            <GSTRATEDUTYHEAD>CGST</GSTRATEDUTYHEAD>
            <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>
            <GSTRATE>${gstRate}</GSTRATE>
        </RATEDETAILS.LIST>
        <RATEDETAILS.LIST>
            <GSTRATEDUTYHEAD>SGST/UTGST</GSTRATEDUTYHEAD>
            <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>
             <GSTRATE>${gstRate}</GSTRATE>
        </RATEDETAILS.LIST>
        <RATEDETAILS.LIST>
            <GSTRATEDUTYHEAD>IGST</GSTRATEDUTYHEAD>
            <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>
             <GSTRATE>${gstRate}</GSTRATE>
        </RATEDETAILS.LIST>
        <RATEDETAILS.LIST>
            <GSTRATEDUTYHEAD>Cess</GSTRATEDUTYHEAD>
            <GSTRATEVALUATIONTYPE>&#4; Not Applicable</GSTRATEVALUATIONTYPE>
        </RATEDETAILS.LIST>
        <RATEDETAILS.LIST>
            <GSTRATEDUTYHEAD>State Cess</GSTRATEDUTYHEAD>
            <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>
        </RATEDETAILS.LIST>
    `;
}

// Helper function to format date to YYYYMMDD
function formatDateT(date: Date): string {
  const isoString = date.toISOString(); // Gets "2025-06-17T09:38:29.165Z"
  return isoString.slice(0, 10).replace(/-/g, ''); // Will return "20250617"
}

function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}
