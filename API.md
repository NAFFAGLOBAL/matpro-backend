# MatPro API Documentation

Complete API reference for MatPro backend.

**Base URL:** `https://your-api-url.com/api`

---

## Authentication

All endpoints except `/auth/login` require authentication.

**Include JWT token in header:**
```
Authorization: Bearer YOUR_TOKEN_HERE
```

### POST /auth/login

Login with phone number and PIN.

**Request:**
```json
{
  "phone": "+224620000001",
  "pin": "123456"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "phone": "+224620000001",
    "full_name": "Admin Owner",
    "role": "OWNER",
    "store_id": null
  }
}
```

### GET /auth/me

Get current user details.

**Response:**
```json
{
  "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "phone": "+224620000001",
  "full_name": "Admin Owner",
  "role": "OWNER",
  "store_id": null,
  "store_name": null
}
```

---

## Products

### GET /products

List all products. Store managers see retail prices only; owners see cost prices.

**Query Parameters:**
- `category` (optional): Filter by category
- `search` (optional): Search by name or SKU

**Response:**
```json
[
  {
    "id": "uuid",
    "sku": "MAT-001",
    "name": "Ciment Portland",
    "category": "Ciment",
    "unit": "bag",
    "variant_size": "50kg",
    "variant_thickness": null,
    "retail_price": "85000.00",
    "cost_price": "72000.00",  // Owner only
    "photo_url": null,
    "is_active": true
  }
]
```

### GET /products/:id

Get single product details.

### POST /products (Owner Only)

Create new product.

**Request:**
```json
{
  "name": "Fer à béton",
  "category": "Fer",
  "unit": "piece",
  "variant_size": "12mm",
  "retail_price": 45000,
  "cost_price": 38000,
  "photo_url": "https://..."
}
```

**Response:** Created product object with auto-generated SKU.

### PATCH /products/:id (Owner Only)

Update product.

**Request:** Partial update (send only fields to change)
```json
{
  "retail_price": 50000,
  "cost_price": 42000
}
```

---

## Sales

### GET /sales

List sales. Store managers see only their store.

**Query Parameters:**
- `storeId` (optional): Filter by store
- `status` (optional): ACTIVE | VOID
- `customerId` (optional): Filter by customer
- `from` (optional): Start date (ISO 8601)
- `to` (optional): End date (ISO 8601)

**Response:**
```json
[
  {
    "id": "uuid",
    "sale_number": "INV-20260204-001",
    "store_id": "uuid",
    "store_name": "Madina",
    "customer_id": "uuid",
    "customer_name": "Ibrahim Diallo",
    "sale_type": "CASH",
    "subtotal": "170000.00",
    "discount_amount": "0.00",
    "total_amount": "170000.00",
    "amount_paid": "170000.00",
    "amount_due": "0.00",
    "status": "ACTIVE",
    "created_by": "uuid",
    "created_by_name": "Manager Madina",
    "created_at": "2026-02-04T04:00:00.000Z"
  }
]
```

### GET /sales/:id

Get sale details with line items.

**Response:**
```json
{
  "id": "uuid",
  "sale_number": "INV-20260204-001",
  "store_name": "Madina",
  "customer_name": "Ibrahim Diallo",
  "customer_phone": "+224620111111",
  "sale_type": "PARTIAL",
  "total_amount": "170000.00",
  "amount_paid": "100000.00",
  "amount_due": "70000.00",
  "status": "ACTIVE",
  "created_at": "2026-02-04T04:00:00.000Z",
  "line_items": [
    {
      "id": "uuid",
      "product_id": "uuid",
      "product_name": "Ciment Portland",
      "sku": "MAT-001",
      "quantity": "2.00",
      "unit_price": "85000.00",
      "line_total": "170000.00"
    }
  ]
}
```

### POST /sales

Create new sale. Automatically creates stock events to reduce inventory.

**Request:**
```json
{
  "store_id": "11111111-1111-1111-1111-111111111111",
  "customer_id": "uuid",  // Required for PARTIAL/CREDIT, optional for CASH
  "sale_type": "PARTIAL",  // CASH | PARTIAL | CREDIT
  "line_items": [
    {
      "product_id": "uuid",
      "quantity": 2,
      "unit_price": 85000
    }
  ],
  "discount_amount": 0,
  "amount_paid": 100000  // Partial payment
}
```

**Response:** Created sale object with line items.

### POST /sales/:id/void (Owner Only)

Void a sale. Reverses inventory (adds stock back).

**Request:**
```json
{
  "reason": "Customer returned items - quality issue"
}
```

**Response:**
```json
{
  "message": "Sale voided successfully"
}
```

---

## Inventory

### GET /inventory/:storeId

Get current inventory for a store.

**Response:**
```json
[
  {
    "product_id": "uuid",
    "sku": "MAT-001",
    "product_name": "Ciment Portland",
    "category": "Ciment",
    "unit": "bag",
    "variant_size": "50kg",
    "retail_price": "85000.00",
    "on_hand_qty": "98.00",
    "last_movement_at": "2026-02-04T04:00:00.000Z"
  }
]
```

### GET /inventory/:storeId/:productId

Get inventory and movement history for specific product.

**Response:**
```json
{
  "product_id": "uuid",
  "sku": "MAT-001",
  "product_name": "Ciment Portland",
  "on_hand_qty": "98.00",
  "last_movement_at": "2026-02-04T04:00:00.000Z",
  "movements": [
    {
      "id": "uuid",
      "event_type": "SALE",
      "quantity": "-2.00",
      "reference_type": "SALE",
      "reference_id": "sale-uuid",
      "notes": null,
      "created_at": "2026-02-04T04:00:00.000Z",
      "created_by_name": "Manager Madina"
    },
    {
      "event_type": "RECEIVE",
      "quantity": "100.00",
      "reference_type": "INITIAL",
      "notes": "Stock initial",
      "created_at": "2026-02-04T00:00:00.000Z"
    }
  ]
}
```

### GET /inventory/events/list

Get stock events with filtering.

**Query Parameters:**
- `storeId` (optional)
- `productId` (optional)
- `eventType` (optional): RECEIVE | SALE | TRANSFER_OUT | TRANSFER_IN | ADJUSTMENT
- `from` (optional)
- `to` (optional)

### POST /inventory/events

Create stock event (owner only for ADJUSTMENT).

**Request:**
```json
{
  "event_type": "RECEIVE",
  "product_id": "uuid",
  "store_id": "uuid",
  "quantity": 50,
  "reference_type": "PURCHASE_ORDER",
  "reference_id": "po-uuid",
  "notes": "Received from China supplier"
}
```

---

## Customers

### GET /customers

List all customers.

**Query Parameters:**
- `search` (optional): Search by name or phone

### GET /customers/:id

Get customer details.

### POST /customers

Create customer.

**Request:**
```json
{
  "name": "Ibrahim Diallo",
  "phone": "+224620111111",
  "whatsapp": "+224620111111",
  "address": "Madina, Conakry",
  "notes": "Regular customer"
}
```

### PATCH /customers/:id

Update customer (partial update supported).

### GET /customers/:id/ledger

Get customer's sales and payment history.

**Response:**
```json
{
  "sales": [
    {
      "id": "uuid",
      "sale_number": "INV-20260204-001",
      "sale_type": "PARTIAL",
      "total_amount": "170000.00",
      "amount_paid": "100000.00",
      "amount_due": "70000.00",
      "status": "ACTIVE",
      "created_at": "2026-02-04T04:00:00.000Z",
      "store_name": "Madina"
    }
  ],
  "payments": [
    {
      "id": "uuid",
      "payment_number": "PAY-20260204-001",
      "amount": "100000.00",
      "payment_method": "CASH",
      "created_at": "2026-02-04T04:00:00.000Z",
      "sale_number": "INV-20260204-001"
    }
  ],
  "totals": {
    "total_invoiced": "170000.00",
    "total_paid": "100000.00",
    "total_due": "70000.00"
  }
}
```

### GET /customers/:id/aging

Get aging analysis (debt buckets).

**Response:**
```json
{
  "days_0_7": "50000.00",
  "days_8_30": "20000.00",
  "days_31_60": "0.00",
  "days_60_plus": "0.00"
}
```

---

## Payments

### GET /payments

List payments.

**Query Parameters:**
- `customerId` (optional)
- `saleId` (optional)
- `from` (optional)
- `to` (optional)

### POST /payments

Record payment. Automatically updates sale amounts if linked.

**Request:**
```json
{
  "customer_id": "uuid",
  "sale_id": "uuid",  // Optional: link to specific sale
  "amount": 50000,
  "payment_method": "CASH",  // CASH | MOBILE_MONEY | BANK_TRANSFER
  "reference": "TXN123456",  // Optional: transaction reference
  "notes": "Partial payment"
}
```

---

## Approvals

### GET /approvals

List approval requests. Store managers see only their store.

**Query Parameters:**
- `status` (optional): PENDING | APPROVED | REJECTED
- `storeId` (optional)

### POST /approvals

Submit approval request (store manager).

**Request:**
```json
{
  "request_type": "INVENTORY_ADJUSTMENT",
  "store_id": "uuid",
  "product_id": "uuid",
  "requested_quantity": -5,
  "reason": "Damaged items found during inventory count"
}
```

### POST /approvals/:id/approve (Owner Only)

Approve request. Creates stock event automatically.

**Request:**
```json
{
  "notes": "Approved - verified damage report"
}
```

### POST /approvals/:id/reject (Owner Only)

Reject request.

**Request:**
```json
{
  "notes": "Need more evidence of damage"
}
```

---

## Sync (Offline Support)

### POST /sync/push

Push offline data from mobile app to server.

**Request:**
```json
{
  "customers": [
    {
      "id": "uuid",
      "name": "New Customer",
      "phone": "+224620999999",
      "created_at": "2026-02-04T04:00:00.000Z"
    }
  ],
  "sales": [
    {
      "id": "uuid",
      "sale_number": "INV-20260204-002",
      "store_id": "uuid",
      "sale_type": "CASH",
      "line_items": [...],
      "created_at": "2026-02-04T04:00:00.000Z"
    }
  ],
  "stock_events": [...],
  "payments": [...]
}
```

**Response:**
```json
{
  "message": "Sync completed",
  "results": {
    "sales": { "success": 1, "failed": 0, "errors": [] },
    "payments": { "success": 1, "failed": 0, "errors": [] },
    "stock_events": { "success": 2, "failed": 0, "errors": [] },
    "customers": { "success": 1, "failed": 0, "errors": [] }
  },
  "timestamp": "2026-02-04T04:05:00.000Z"
}
```

### GET /sync/pull?since=timestamp

Pull server updates since last sync.

**Query Parameters:**
- `since` (required): ISO 8601 timestamp of last successful sync

**Response:**
```json
{
  "products": [...],
  "sales": [...],
  "sale_line_items": [...],
  "stock_events": [...],
  "customers": [...],
  "payments": [...],
  "timestamp": "2026-02-04T04:05:00.000Z"
}
```

---

## Error Responses

All endpoints return consistent error format:

```json
{
  "error": "Error message here"
}
```

**HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad request (invalid input)
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not found
- `500` - Server error

---

## Rate Limiting

No rate limiting currently implemented. May be added in future for production.

---

## Webhook Support

Not yet implemented. Future feature for real-time notifications.

---

## Testing

Use Postman, Insomnia, or curl to test endpoints.

**Example Postman Collection:** (TODO: Generate and include)

---

**API Version:** 1.0.0  
**Last Updated:** 2026-02-04  
**Questions?** Check ARCHITECTURE.md for system design details.
