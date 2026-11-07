# Sales Invoice - Table Mapping Guide

## Database Tables aur Unme Data Kaise Save Hota Hai

### 📊 **Table 1: `sales_invoices`** (Main Invoice Table)

**JSON Fields → Database Columns:**

| JSON Field (lowercase) | Database Column | Type |
|------------------------|-----------------|------|
| `vouchernumber` | `voucherNo` | varchar |
| `voucherdate` | `voucherDate` | varchar |
| `vouchertype` | `voucherType` | varchar |
| `referenceno` | `referenceNo` | varchar |
| `guid` | `guid` | varchar |
| `masterid` | `masterId` | varchar |
| `partyname` | `partyName` | varchar |
| `closingbalance` | `closingBalance` | float |
| `nxpartycode` | `nxPartyCode` | varchar (NULL if "NULL") |
| `amount` | `amount` | float |
| `customername` | `customerName` | varchar (NULL if "NULL") |
| `partygstin` | `partyGstin` | varchar |
| `emailid` | `emailId` | varchar |
| `mobilenumber` | `mobileNumber` | varchar |
| `buyeraddress` | `buyerAddress` | text |
| `email` | `eMail` | varchar |
| `consigneeaddress` | `consigneeAddress` | text |
| `state` | `state` | varchar |
| `placeofsupply` | `placeOfSupply` | varchar |

**Auto Generated:**
- `id` (UUID - Primary Key)
- `createdAt` (Timestamp)
- `updatedAt` (Timestamp)

---

### 📦 **Table 2: `sales_invoice_items`** (Invoice Items)

**JSON Path:** `voucher[].items[]`

**JSON Fields → Database Columns:**

| JSON Field (lowercase) | Database Column | Type |
|------------------------|-----------------|------|
| `orderno` | `orderNo` | varchar |
| `orderdue` | `orderDue` | varchar |
| `itemname` | `itemName` | varchar |
| `nxitemcode` | `nxItemCode` | varchar (NULL if "NULL") |
| `partno` | `partNo` | varchar (NULL if "NULL") |
| `baseunits` | `baseUnits` | varchar |
| `actualqty` | `actualQty` | float |
| `billedqty` | `billedQty` | float |
| `inclrate` | `inclRate` | float |
| `rate` | `rate` | float |
| `discperc` | `discPerc` | float |
| `discamt` | `discAmt` | float |
| `discprop` | `discProp` | float |
| `amount` | `amount` | float |
| `accountingname` | `accountingName` | varchar |
| `gstper` | `gstPer` | float |

**Auto Generated:**
- `id` (UUID - Primary Key)
- `salesInvoiceId` (Foreign Key → `sales_invoices.id`)

**Relationship:** 
- Ek invoice ke multiple items ho sakte hain
- Har item ek invoice se linked hota hai

---

### 📝 **Table 3: `sales_invoice_item_descriptions`** (Item Descriptions)

**JSON Path:** `voucher[].items[].description[]`

**JSON Fields → Database Columns:**

| JSON Field (lowercase) | Database Column | Type |
|------------------------|-----------------|------|
| `desc` | `desc` | text |

**Auto Generated:**
- `id` (UUID - Primary Key)
- `itemId` (Foreign Key → `sales_invoice_items.id`)

**Relationship:**
- Ek item ke multiple descriptions ho sakte hain
- Har description ek item se linked hota hai

**Example:**
```json
"description": [
  { "desc": "SFDC HYD B3 AMC" },
  { "desc": "Period 01.05.2025 to 30.07.2025" },
  { "desc": "Quarterly PPM Activity" }
]
```
→ 3 entries `sales_invoice_item_descriptions` table mein jayengi

---

### 💰 **Table 4: `sales_invoice_payment_terms`** (Payment Terms)

**JSON Path:** `voucher[].payment_terms[]`

**JSON Fields → Database Columns:**

| JSON Field (lowercase) | Database Column | Type |
|------------------------|-----------------|------|
| `terms` | `terms` | text |

**Auto Generated:**
- `id` (UUID - Primary Key)
- `salesInvoiceId` (Foreign Key → `sales_invoices.id`)

**Relationship:**
- Ek invoice ke multiple payment terms ho sakte hain
- Har term ek invoice se linked hota hai

**Example:**
```json
"payment_terms": [
  { "terms": "Smartworks Coworking Spaces Limited" },
  { "terms": "Tower D, Cyber Park," },
  { "terms": "C-28 & 29" },
  { "terms": "NOIDA 201309 UP" },
  { "terms": "Mohammad Faiz / Sandeep" },
  { "terms": "7017772623/9996068238" }
]
```
→ 6 entries `sales_invoice_payment_terms` table mein jayengi

---

### 📋 **Table 5: `sales_invoice_orders`** (Related Orders)

**JSON Path:** `voucher[].orders[]`

**JSON Fields → Database Columns:**

| JSON Field (lowercase) | Database Column | Type |
|------------------------|-----------------|------|
| `orderid` | `orderId` | varchar (NULL if "NULL") |
| `nxorderid` | `nxOrderId` | varchar (NULL if "NULL") |
| `tlorderid` | `tlOrderId` | varchar (NULL if "NULL") |

**Auto Generated:**
- `id` (UUID - Primary Key)
- `salesInvoiceId` (Foreign Key → `sales_invoices.id`)

**Relationship:**
- Ek invoice ke multiple orders ho sakte hain
- Har order ek invoice se linked hota hai

---

### 📊 **Table 6: `sales_invoice_ledgers`** (GST Ledger Entries)

**JSON Path:** `voucher[].ledger[]`

**JSON Fields → Database Columns:**

| JSON Field (lowercase) | Database Column | Type |
|------------------------|-----------------|------|
| `ledgername` | `ledgerName` | varchar |
| `rateperc` | `ratePerc` | float |
| `amount` | `amount` | float |

**Auto Generated:**
- `id` (UUID - Primary Key)
- `salesInvoiceId` (Foreign Key → `sales_invoices.id`)

**Relationship:**
- Ek invoice ke multiple ledger entries ho sakte hain (CGST, SGST, etc.)
- Har ledger entry ek invoice se linked hota hai

**Example:**
```json
"ledger": [
  { "ledgername": "CGST", "rateperc": "0", "amount": "27.27" },
  { "ledgername": "SGST", "rateperc": "0", "amount": "27.27" }
]
```
→ 2 entries `sales_invoice_ledgers` table mein jayengi

---

## 📈 **Example: Complete Data Flow**

Agar aap ek invoice submit karte ho with this JSON:

```json
{
  "voucher": [{
    "vouchernumber": "1",
    "partyname": "ABC Company",
    "items": [
      { "itemname": "Product 1", "description": [{ "desc": "Desc 1" }, { "desc": "Desc 2" }] },
      { "itemname": "Product 2" }
    ],
    "payment_terms": [{ "terms": "Term 1" }, { "terms": "Term 2" }],
    "orders": [{ "orderid": "123" }],
    "ledger": [{ "ledgername": "CGST" }, { "ledgername": "SGST" }]
  }]
}
```

**Database mein ye entries banengi:**

1. **`sales_invoices`**: 1 entry (main invoice)
2. **`sales_invoice_items`**: 2 entries (2 items)
3. **`sales_invoice_item_descriptions`**: 2 entries (Product 1 ke 2 descriptions)
4. **`sales_invoice_payment_terms`**: 2 entries (2 payment terms)
5. **`sales_invoice_orders`**: 1 entry (1 order)
6. **`sales_invoice_ledgers`**: 2 entries (CGST aur SGST)

**Total: 10 entries across 6 tables**

---

## 🔗 **Relationships Summary**

```
sales_invoices (1)
  ├── sales_invoice_items (many)
  │     └── sales_invoice_item_descriptions (many)
  ├── sales_invoice_payment_terms (many)
  ├── sales_invoice_orders (many)
  └── sales_invoice_ledgers (many)
```

**Cascade Delete:** Agar invoice delete ho, to automatically sab related entries bhi delete ho jayengi.

