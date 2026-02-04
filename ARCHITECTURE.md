# MatPro - Architecture Document

## Executive Summary

**Purpose:** Offline-first inventory + sales + credit + cash control app for construction materials merchant in Guinea (2 stores: Madina, Lambandji)

**Target Users:**
- Owner (admin): Full access across stores, sees costs/margins/profits
- Store Managers: Single-store access, no cost visibility

**Core Constraint:** Internet is slow/unreliable → app must work offline, sync when online

**Tech Stack:**
- **Mobile:** Flutter (Android + iOS)
- **Backend:** Node.js + Express + PostgreSQL
- **Local Storage:** SQLite (on-device)
- **Auth:** Phone + 6-digit PIN (no SMS dependency)
- **Language:** French UI

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     MOBILE APP (Flutter)                     │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │ UI Layer   │  │ Business     │  │ Local Storage    │    │
│  │ (Screens)  │→│ Logic        │→│ (SQLite)         │    │
│  │            │  │              │  │                  │    │
│  │            │  │ Sync Engine  │  │ Sync Queue       │    │
│  └────────────┘  └──────────────┘  └──────────────────┘    │
│                          ↓                                   │
│                   Network Available?                         │
│                          ↓                                   │
└──────────────────────────┼───────────────────────────────────┘
                           ↓
                    ┌──────────────┐
                    │   REST API   │
                    │ (Node/Express)│
                    └──────────────┘
                           ↓
                    ┌──────────────┐
                    │  PostgreSQL  │
                    │  (Server DB) │
                    └──────────────┘
                           ↑
                    ┌──────────────┐
                    │ Admin Panel  │
                    │   (Web)      │
                    └──────────────┘
```

---

## Core Principles

### 1. Offline-First Design
- **All writes go to local SQLite first** (instant feedback)
- **Sync queue** tracks pending operations
- **Event sourcing** for inventory (immutable log of all stock movements)
- **Append-only transactions** (sales, payments, stock events never deleted)
- **Conflict resolution:** Server is source of truth; client reconciles on sync

### 2. Role-Based Access Control (RBAC)
- **OWNER:** Full access, sees costs/margins, approves adjustments, voids sales
- **STORE_MANAGER:** Single-store only, no cost visibility, submits approval requests

### 3. Audit Trail
- **Immutable log** of all sensitive actions
- **Tracks:** user, timestamp, action, before/after values, reason
- **Alerts** for suspicious patterns (frequent voids, negative stock attempts)

### 4. Event-Driven Inventory
- **No direct qty updates** → all changes via StockEvents
- **Types:** RECEIVE, SALE, TRANSFER_OUT, TRANSFER_IN, ADJUSTMENT
- **Server recalculates inventory** from event log (prevents desync)

---

## Data Model

### Core Entities

#### Store
```sql
CREATE TABLE stores (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,        -- "Madina", "Lambandji"
  location TEXT,
  phone VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### User
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  pin_hash VARCHAR(255) NOT NULL,    -- bcrypt hash
  full_name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL,         -- OWNER, STORE_MANAGER
  store_id UUID REFERENCES stores(id), -- NULL for OWNER
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Product
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY,
  sku VARCHAR(50) UNIQUE NOT NULL,   -- Auto-generated: MAT-001
  name VARCHAR(200) NOT NULL,
  category VARCHAR(100),             -- Ciment, Fer, Bois, etc.
  unit VARCHAR(20) NOT NULL,         -- bag, piece, box, sheet, kg, meter
  variant_size VARCHAR(50),          -- 50kg, 25kg, 12mm, etc.
  variant_thickness VARCHAR(50),
  retail_price DECIMAL(12,2) NOT NULL,
  cost_price DECIMAL(12,2),          -- Owner-only visibility
  photo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### StockEvent (Event Sourcing)
```sql
CREATE TABLE stock_events (
  id UUID PRIMARY KEY,
  event_type VARCHAR(20) NOT NULL,   -- RECEIVE, SALE, TRANSFER_OUT, TRANSFER_IN, ADJUSTMENT
  product_id UUID REFERENCES products(id) NOT NULL,
  store_id UUID REFERENCES stores(id) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,   -- Can be negative for OUT events
  reference_type VARCHAR(20),        -- SALE, PURCHASE_ORDER, TRANSFER, ADJUSTMENT
  reference_id UUID,                 -- Links to sale_id, transfer_id, etc.
  notes TEXT,
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  synced_at TIMESTAMP                -- NULL if pending sync
);

-- View: Current Inventory (calculated from events)
CREATE VIEW inventory_current AS
SELECT 
  product_id,
  store_id,
  SUM(quantity) as on_hand_qty,
  MAX(created_at) as last_movement_at
FROM stock_events
GROUP BY product_id, store_id;
```

#### Customer
```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(20),
  whatsapp VARCHAR(20),
  address TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Sale
```sql
CREATE TABLE sales (
  id UUID PRIMARY KEY,
  sale_number VARCHAR(50) UNIQUE NOT NULL, -- AUTO: INV-20260204-001
  store_id UUID REFERENCES stores(id) NOT NULL,
  customer_id UUID REFERENCES customers(id), -- NULL for walk-in
  sale_type VARCHAR(20) NOT NULL,    -- CASH, PARTIAL, CREDIT
  subtotal DECIMAL(12,2) NOT NULL,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL,
  amount_paid DECIMAL(12,2) DEFAULT 0,
  amount_due DECIMAL(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, VOID
  void_reason TEXT,
  voided_by UUID REFERENCES users(id),
  voided_at TIMESTAMP,
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  synced_at TIMESTAMP
);
```

#### SaleLineItem
```sql
CREATE TABLE sale_line_items (
  id UUID PRIMARY KEY,
  sale_id UUID REFERENCES sales(id) NOT NULL,
  product_id UUID REFERENCES products(id) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Payment
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  payment_number VARCHAR(50) UNIQUE NOT NULL, -- AUTO: PAY-20260204-001
  customer_id UUID REFERENCES customers(id) NOT NULL,
  sale_id UUID REFERENCES sales(id),  -- NULL for general payment
  amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(20) DEFAULT 'CASH', -- CASH, MOBILE_MONEY, BANK_TRANSFER
  reference VARCHAR(100),              -- Transaction ref
  notes TEXT,
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  synced_at TIMESTAMP
);
```

#### Vendor
```sql
CREATE TABLE vendors (
  id UUID PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  contact_name VARCHAR(100),
  phone VARCHAR(20),
  whatsapp VARCHAR(20),
  wechat VARCHAR(100),
  country VARCHAR(50),                -- China, Guinea
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### PurchaseOrder
```sql
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY,
  po_number VARCHAR(50) UNIQUE NOT NULL,
  vendor_id UUID REFERENCES vendors(id) NOT NULL,
  destination_store_id UUID REFERENCES stores(id) NOT NULL,
  total_cost DECIMAL(12,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'DRAFT', -- DRAFT, ORDERED, SHIPPED, ARRIVED, DELIVERED
  ordered_date DATE,
  expected_arrival_date DATE,
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY,
  po_id UUID REFERENCES purchase_orders(id) NOT NULL,
  product_id UUID REFERENCES products(id) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  unit_cost DECIMAL(12,2) NOT NULL,
  line_total DECIMAL(12,2) NOT NULL
);
```

#### VendorInvoice
```sql
CREATE TABLE vendor_invoices (
  id UUID PRIMARY KEY,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  vendor_id UUID REFERENCES vendors(id) NOT NULL,
  po_id UUID REFERENCES purchase_orders(id),
  total_amount DECIMAL(12,2) NOT NULL,
  deposit_paid DECIMAL(12,2) DEFAULT 0,
  balance_due DECIMAL(12,2) NOT NULL,
  attachment_url TEXT,               -- Photo/PDF
  status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, PAID
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### ApprovalRequest (for Adjustments)
```sql
CREATE TABLE approval_requests (
  id UUID PRIMARY KEY,
  request_type VARCHAR(50) NOT NULL, -- INVENTORY_ADJUSTMENT
  store_id UUID REFERENCES stores(id) NOT NULL,
  product_id UUID REFERENCES products(id) NOT NULL,
  requested_quantity DECIMAL(10,2) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
  requested_by UUID REFERENCES users(id) NOT NULL,
  requested_at TIMESTAMP DEFAULT NOW(),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  review_notes TEXT
);
```

#### AuditLog
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) NOT NULL,
  action VARCHAR(100) NOT NULL,      -- SALE_VOID, DISCOUNT_OVERRIDE, etc.
  entity_type VARCHAR(50) NOT NULL,  -- SALE, STOCK_EVENT, PRODUCT
  entity_id UUID NOT NULL,
  before_value JSONB,
  after_value JSONB,
  reason TEXT,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## API Endpoints

### Authentication
```
POST   /api/auth/login          { phone, pin } → { token, user }
POST   /api/auth/logout         { token }
GET    /api/auth/me             → { user }
```

### Products
```
GET    /api/products            → [products] (store managers see retail price only)
GET    /api/products/:id        → product
POST   /api/products            → product (owner only)
PATCH  /api/products/:id        → product (owner only)
GET    /api/products/search?q=  → [products]
```

### Inventory
```
GET    /api/inventory/:storeId                → [{ product, on_hand_qty, last_movement }]
GET    /api/inventory/:storeId/:productId     → { product, on_hand_qty, movements }
POST   /api/stock-events                      → stock_event
GET    /api/stock-events?storeId=&productId=  → [stock_events]
```

### Sales
```
GET    /api/sales?storeId=&status=    → [sales]
GET    /api/sales/:id                 → sale + line_items
POST   /api/sales                     → sale (creates stock events automatically)
POST   /api/sales/:id/void            → { reason } (owner only)
```

### Customers
```
GET    /api/customers                 → [customers]
GET    /api/customers/:id             → customer
POST   /api/customers                 → customer
PATCH  /api/customers/:id             → customer
GET    /api/customers/:id/ledger      → { invoices, payments, balance }
GET    /api/customers/:id/aging       → { buckets: [0-7, 8-30, 31-60, 60+] }
```

### Payments
```
GET    /api/payments?customerId=      → [payments]
POST   /api/payments                  → payment
```

### Vendors & Purchasing
```
GET    /api/vendors                   → [vendors] (owner only)
POST   /api/vendors                   → vendor (owner only)
GET    /api/purchase-orders           → [pos] (owner only)
POST   /api/purchase-orders           → po (owner only)
PATCH  /api/purchase-orders/:id       → po (owner only)
POST   /api/vendor-invoices           → invoice (owner only)
```

### Approvals
```
GET    /api/approvals                 → [requests]
POST   /api/approvals                 → request (store manager submits)
POST   /api/approvals/:id/approve     → { notes } (owner only)
POST   /api/approvals/:id/reject      → { notes } (owner only)
```

### Sync
```
POST   /api/sync/push                 → { sales, payments, stock_events, ... }
GET    /api/sync/pull?since=timestamp → { updates }
```

### Reports (Owner Only)
```
GET    /api/reports/sales?storeId=&from=&to=     → { total_sales, by_product, by_day }
GET    /api/reports/profit?storeId=&from=&to=    → { revenue, cost, margin }
GET    /api/reports/inventory-valuation?storeId= → { total_value, by_product }
GET    /api/reports/cash-variance?storeId=&date= → { expected, counted, variance }
```

---

## Offline Sync Strategy

### Sync Queue (Local SQLite)
```sql
CREATE TABLE sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation VARCHAR(20) NOT NULL,    -- INSERT, UPDATE, DELETE
  entity_type VARCHAR(50) NOT NULL,  -- SALE, PAYMENT, STOCK_EVENT
  entity_id TEXT NOT NULL,
  payload TEXT NOT NULL,             -- JSON
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Sync Flow

**1. Write Operation (Offline):**
```
User creates sale
  ↓
Write to local SQLite (sales, sale_line_items, stock_events)
  ↓
Add to sync_queue
  ↓
Show "Pending sync" indicator
```

**2. Sync Process (When Online):**
```
Check network connectivity
  ↓
Fetch sync_queue items (oldest first)
  ↓
For each item:
  - POST to server API
  - If success: mark synced_at, delete from queue
  - If failure: increment retry_count, log error
  ↓
Pull server updates (GET /sync/pull?since=last_sync_timestamp)
  ↓
Merge updates into local DB
```

### Conflict Resolution Rules

1. **Sales/Payments/Stock Events:** Append-only, never conflict (server accepts all with unique UUIDs)
2. **Product edits:** Owner wins, store manager changes rejected on sync
3. **Inventory qty:** Server recalculates from stock_events (client qty ignored)
4. **Customer/Vendor edits:** Last-write-wins (timestamp-based)

---

## Mobile App Structure (Flutter)

### Folder Structure
```
lib/
├── main.dart
├── core/
│   ├── database/
│   │   ├── database_helper.dart      # SQLite setup
│   │   └── sync_queue_service.dart   # Manages sync queue
│   ├── network/
│   │   ├── api_client.dart           # HTTP client
│   │   └── sync_service.dart         # Sync engine
│   ├── auth/
│   │   └── auth_service.dart         # Login, token management
│   └── utils/
│       ├── permissions.dart          # RBAC checks
│       └── number_formatter.dart     # French locale formatting
├── models/
│   ├── product.dart
│   ├── sale.dart
│   ├── customer.dart
│   ├── payment.dart
│   ├── stock_event.dart
│   └── ...
├── screens/
│   ├── auth/
│   │   └── login_screen.dart
│   ├── home/
│   │   └── home_screen.dart          # Dashboard
│   ├── sales/
│   │   ├── sales_list_screen.dart
│   │   ├── create_sale_screen.dart   # 3-tap flow
│   │   └── sale_detail_screen.dart
│   ├── inventory/
│   │   ├── inventory_list_screen.dart
│   │   └── stock_movement_screen.dart
│   ├── customers/
│   │   ├── customers_list_screen.dart
│   │   ├── customer_detail_screen.dart
│   │   └── customer_ledger_screen.dart
│   ├── products/
│   │   ├── products_list_screen.dart
│   │   └── product_form_screen.dart  # Owner only
│   └── approvals/
│       └── approvals_list_screen.dart
└── widgets/
    ├── sync_indicator.dart           # Shows sync status
    ├── product_search_bar.dart
    └── receipt_generator.dart        # Generate WhatsApp-shareable receipt
```

### Key Screens

**1. Login Screen**
- Phone number input (with country code +224 for Guinea)
- 6-digit PIN pad
- "Remember me" toggle

**2. Home Dashboard**
- Store selector (if owner)
- Today's sales summary
- Pending credit reminders
- Low stock alerts
- Sync status indicator

**3. Create Sale (3-Tap Flow)**
```
Tap 1: Select customer (or "Walk-in")
  ↓
Tap 2: Add products (search + recent items list)
  ↓
Tap 3: Choose payment type (CASH/PARTIAL/CREDIT) + Save
```

**4. Customer Ledger**
- Invoice list (unpaid highlighted)
- Payment history
- Aging buckets (color-coded)
- WhatsApp reminder button

**5. Inventory Screen**
- Product list with on-hand qty
- Low stock flag (configurable threshold)
- Last movement date
- Filter by category

---

## Admin Dashboard (Web)

### Pages
1. **Dashboard:** Sales, profit, inventory value across stores
2. **Stores:** Manage stores (add/edit)
3. **Users:** Manage users + permissions
4. **Products:** CRUD products (with cost visibility)
5. **Approvals:** Review adjustment requests
6. **Reports:**
   - Sales by store/product/period
   - Profit & margin analysis
   - Inventory valuation
   - Cash variance report
7. **Audit Log:** Searchable log of all sensitive actions
8. **Vendors:** Manage vendors + purchase orders + invoices

### Tech Stack (Admin)
- **Framework:** Next.js (React)
- **UI:** Tailwind CSS + shadcn/ui
- **Auth:** JWT (same as mobile)

---

## Implementation Milestones

### Phase 1: Core Backend (Week 1)
- [ ] Database schema + migrations
- [ ] User auth (phone + PIN)
- [ ] Products API (CRUD + search)
- [ ] Sales API (create, list, void)
- [ ] Stock events API (event sourcing)
- [ ] Deploy to Railway/Heroku

### Phase 2: Mobile App MVP (Week 2-3)
- [ ] Flutter project setup + SQLite
- [ ] Login screen + auth service
- [ ] Home dashboard
- [ ] Create sale flow (3-tap)
- [ ] Product search + recent items
- [ ] Inventory view
- [ ] Offline sync engine (basic)

### Phase 3: Credit & Customers (Week 3)
- [ ] Customers API + mobile screens
- [ ] Customer ledger + aging
- [ ] Partial/credit sale support
- [ ] Payment recording
- [ ] WhatsApp reminder integration

### Phase 4: Cash Control & Approvals (Week 4)
- [ ] Daily closeout flow
- [ ] Cash variance reporting
- [ ] Approval requests API + screens
- [ ] Audit log API
- [ ] Alerts for suspicious activity

### Phase 5: Vendors & Purchasing (Week 5)
- [ ] Vendors API (owner-only)
- [ ] Purchase orders + invoices
- [ ] Stock receives from PO
- [ ] Payment tracking to vendors

### Phase 6: Admin Dashboard (Week 6)
- [ ] Next.js project setup
- [ ] All reports (sales, profit, inventory)
- [ ] User management
- [ ] Approval workflow UI
- [ ] Audit log viewer

### Phase 7: Polish & Testing (Week 7)
- [ ] French translations
- [ ] Low-tech UX improvements
- [ ] Offline sync stress testing
- [ ] Receipt sharing via WhatsApp
- [ ] Performance optimization

### Phase 8: Deployment & Training (Week 8)
- [ ] Deploy backend + admin to production
- [ ] Build Android APK + iOS IPA
- [ ] Create user training videos (French)
- [ ] On-site training in Conakry

---

## Security Considerations

1. **PIN storage:** Bcrypt hash, never plain text
2. **API auth:** JWT with short expiry (24h), refresh tokens
3. **RBAC enforcement:** Server validates all permissions
4. **Audit logging:** All sensitive actions logged
5. **Offline data encryption:** SQLite encryption (SQLCipher)
6. **Network security:** HTTPS only, certificate pinning

---

## Performance Targets

- **App load time:** < 2 seconds (even offline)
- **Sale creation:** < 5 seconds (3 taps + save)
- **Search results:** < 500ms
- **Sync batch:** 100 transactions in < 10 seconds
- **Receipt generation:** < 1 second

---

## Next Steps

1. Review this architecture
2. Create database schema SQL file
3. Set up backend project structure
4. Initialize Flutter project
5. Build first API endpoint + mobile screen

Ready to proceed?
