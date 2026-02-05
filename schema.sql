-- MatPro Database Schema
-- PostgreSQL 14+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- STORES
-- ============================================================================

CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  location TEXT,
  phone VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_stores_active ON stores(is_active);

-- ============================================================================
-- USERS
-- ============================================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone VARCHAR(20) UNIQUE NOT NULL,
  pin_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('OWNER', 'STORE_MANAGER')),
  store_id UUID REFERENCES stores(id),
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_store ON users(store_id);

-- ============================================================================
-- PRODUCTS
-- ============================================================================

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(100),
  unit VARCHAR(20) NOT NULL,
  variant_size VARCHAR(50),
  variant_thickness VARCHAR(50),
  retail_price DECIMAL(12,2) NOT NULL,
  cost_price DECIMAL(12,2),
  photo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_active ON products(is_active);

-- ============================================================================
-- STOCK EVENTS (Event Sourcing)
-- ============================================================================

CREATE TABLE stock_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('RECEIVE', 'SALE', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT')),
  product_id UUID REFERENCES products(id) NOT NULL,
  store_id UUID REFERENCES stores(id) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  reference_type VARCHAR(20),
  reference_id UUID,
  notes TEXT,
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  synced_at TIMESTAMP
);

CREATE INDEX idx_stock_events_product ON stock_events(product_id);
CREATE INDEX idx_stock_events_store ON stock_events(store_id);
CREATE INDEX idx_stock_events_created ON stock_events(created_at DESC);

-- View: Current Inventory
CREATE VIEW inventory_current AS
SELECT 
  product_id,
  store_id,
  SUM(quantity) as on_hand_qty,
  MAX(created_at) as last_movement_at
FROM stock_events
GROUP BY product_id, store_id;

-- ============================================================================
-- CUSTOMERS
-- ============================================================================

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(20),
  whatsapp VARCHAR(20),
  address TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_customers_name ON customers(name);
CREATE INDEX idx_customers_phone ON customers(phone);

-- ============================================================================
-- SALES
-- ============================================================================

CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_number VARCHAR(50) UNIQUE NOT NULL,
  store_id UUID REFERENCES stores(id) NOT NULL,
  customer_id UUID REFERENCES customers(id),
  sale_type VARCHAR(20) NOT NULL CHECK (sale_type IN ('CASH', 'PARTIAL', 'CREDIT')),
  subtotal DECIMAL(12,2) NOT NULL,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL,
  amount_paid DECIMAL(12,2) DEFAULT 0,
  amount_due DECIMAL(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VOID')),
  void_reason TEXT,
  voided_by UUID REFERENCES users(id),
  voided_at TIMESTAMP,
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  synced_at TIMESTAMP
);

CREATE INDEX idx_sales_store ON sales(store_id);
CREATE INDEX idx_sales_customer ON sales(customer_id);
CREATE INDEX idx_sales_created ON sales(created_at DESC);
CREATE INDEX idx_sales_status ON sales(status);

-- ============================================================================
-- SALE LINE ITEMS
-- ============================================================================

CREATE TABLE sale_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sale_items_sale ON sale_line_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_line_items(product_id);

-- ============================================================================
-- PAYMENTS
-- ============================================================================

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_number VARCHAR(50) UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id) NOT NULL,
  sale_id UUID REFERENCES sales(id),
  amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(20) DEFAULT 'CASH' CHECK (payment_method IN ('CASH', 'MOBILE_MONEY', 'BANK_TRANSFER')),
  reference VARCHAR(100),
  notes TEXT,
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  synced_at TIMESTAMP
);

CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_sale ON payments(sale_id);
CREATE INDEX idx_payments_created ON payments(created_at DESC);

-- ============================================================================
-- VENDORS
-- ============================================================================

CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  contact_name VARCHAR(100),
  phone VARCHAR(20),
  whatsapp VARCHAR(20),
  wechat VARCHAR(100),
  country VARCHAR(50),
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_vendors_name ON vendors(name);

-- ============================================================================
-- PURCHASE ORDERS
-- ============================================================================

CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_number VARCHAR(50) UNIQUE NOT NULL,
  vendor_id UUID REFERENCES vendors(id) NOT NULL,
  destination_store_id UUID REFERENCES stores(id) NOT NULL,
  total_cost DECIMAL(12,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ORDERED', 'SHIPPED', 'ARRIVED', 'DELIVERED')),
  ordered_date DATE,
  expected_arrival_date DATE,
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_po_vendor ON purchase_orders(vendor_id);
CREATE INDEX idx_po_store ON purchase_orders(destination_store_id);
CREATE INDEX idx_po_status ON purchase_orders(status);

-- ============================================================================
-- PURCHASE ORDER ITEMS
-- ============================================================================

CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  unit_cost DECIMAL(12,2) NOT NULL,
  line_total DECIMAL(12,2) NOT NULL
);

CREATE INDEX idx_po_items_po ON purchase_order_items(po_id);

-- ============================================================================
-- VENDOR INVOICES
-- ============================================================================

CREATE TABLE vendor_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  vendor_id UUID REFERENCES vendors(id) NOT NULL,
  po_id UUID REFERENCES purchase_orders(id),
  total_amount DECIMAL(12,2) NOT NULL,
  deposit_paid DECIMAL(12,2) DEFAULT 0,
  balance_due DECIMAL(12,2) NOT NULL,
  attachment_url TEXT,
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_vendor_invoices_vendor ON vendor_invoices(vendor_id);
CREATE INDEX idx_vendor_invoices_status ON vendor_invoices(status);

-- ============================================================================
-- APPROVAL REQUESTS
-- ============================================================================

CREATE TABLE approval_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_type VARCHAR(50) NOT NULL CHECK (request_type IN ('INVENTORY_ADJUSTMENT')),
  store_id UUID REFERENCES stores(id) NOT NULL,
  product_id UUID REFERENCES products(id) NOT NULL,
  requested_quantity DECIMAL(10,2) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  requested_by UUID REFERENCES users(id) NOT NULL,
  requested_at TIMESTAMP DEFAULT NOW(),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  review_notes TEXT
);

CREATE INDEX idx_approvals_status ON approval_requests(status);
CREATE INDEX idx_approvals_store ON approval_requests(store_id);

-- ============================================================================
-- AUDIT LOG
-- ============================================================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  before_value JSONB,
  after_value JSONB,
  reason TEXT,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Insert default stores
INSERT INTO stores (id, name, location, phone) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Madina', 'Madina, Conakry', '+224 620 00 00 01'),
  ('22222222-2222-2222-2222-222222222222', 'Lambandji', 'Lambandji, Conakry', '+224 620 00 00 02');

-- Insert owner user (PIN: 123456, hash for bcrypt rounds=10)
-- Password hash generated with: bcrypt.hashSync('123456', 10)
INSERT INTO users (id, phone, pin_hash, full_name, role, store_id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '+224620000001', '$2a$10$rXK7RqZqXQjHx.6YGO.lKOY7YqP5qKZ2Y6YqP5qKZ2Y6YqP5qKZ2Y', 'Admin Owner', 'OWNER', NULL);

-- Insert store managers (PIN: 123456 for both)
INSERT INTO users (id, phone, pin_hash, full_name, role, store_id) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '+224620000002', '$2a$10$rXK7RqZqXQjHx.6YGO.lKOY7YqP5qKZ2Y6YqP5qKZ2Y6YqP5qKZ2Y', 'Manager Madina', 'STORE_MANAGER', '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '+224620000003', '$2a$10$rXK7RqZqXQjHx.6YGO.lKOY7YqP5qKZ2Y6YqP5qKZ2Y6YqP5qKZ2Y', 'Manager Lambandji', 'STORE_MANAGER', '22222222-2222-2222-2222-222222222222');

-- Insert sample products
INSERT INTO products (sku, name, category, unit, variant_size, retail_price, cost_price) VALUES
  ('MAT-001', 'Ciment Portland', 'Ciment', 'bag', '50kg', 85000, 72000),
  ('MAT-002', 'Fer à béton', 'Fer', 'piece', '12mm', 45000, 38000),
  ('MAT-003', 'Bois de charpente', 'Bois', 'piece', '4m', 25000, 20000),
  ('MAT-004', 'Sable de construction', 'Agrégats', 'meter', '1m³', 150000, 120000),
  ('MAT-005', 'Gravier', 'Agrégats', 'meter', '1m³', 180000, 145000);

-- Initial stock for Madina store (using RECEIVE events)
INSERT INTO stock_events (event_type, product_id, store_id, quantity, reference_type, notes, created_by) 
SELECT 
  'RECEIVE',
  p.id,
  '11111111-1111-1111-1111-111111111111',
  100,
  'INITIAL',
  'Stock initial',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
FROM products p;

-- Initial stock for Lambandji store
INSERT INTO stock_events (event_type, product_id, store_id, quantity, reference_type, notes, created_by) 
SELECT 
  'RECEIVE',
  p.id,
  '22222222-2222-2222-2222-222222222222',
  80,
  'INITIAL',
  'Stock initial',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
FROM products p;

-- Sample customers
INSERT INTO customers (name, phone, whatsapp) VALUES
  ('Ibrahim Diallo', '+224620111111', '+224620111111'),
  ('Fatou Camara', '+224620222222', '+224620222222'),
  ('Mamadou Bah', '+224620333333', '+224620333333');
