const express = require('express');
const pool = require('../config/database');
const { authMiddleware, ownerOnly } = require('../middleware/auth');

const router = express.Router();

// Get all sales (with store filtering for managers)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { storeId, status, customerId, from, to } = req.query;
    
    let query = `
      SELECT s.*, 
             st.name as store_name,
             c.name as customer_name,
             u.full_name as created_by_name
      FROM sales s
      LEFT JOIN stores st ON s.store_id = st.id
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.created_by = u.id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Store managers can only see their store's sales
    if (req.user.role === 'STORE_MANAGER') {
      params.push(req.user.store_id);
      query += ` AND s.store_id = $${params.length}`;
    } else if (storeId) {
      params.push(storeId);
      query += ` AND s.store_id = $${params.length}`;
    }
    
    if (status) {
      params.push(status);
      query += ` AND s.status = $${params.length}`;
    }
    
    if (customerId) {
      params.push(customerId);
      query += ` AND s.customer_id = $${params.length}`;
    }
    
    if (from) {
      params.push(from);
      query += ` AND s.created_at >= $${params.length}`;
    }
    
    if (to) {
      params.push(to);
      query += ` AND s.created_at <= $${params.length}`;
    }
    
    query += ' ORDER BY s.created_at DESC LIMIT 100';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get sales error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single sale with line items
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const saleResult = await pool.query(
      `SELECT s.*, 
              st.name as store_name,
              c.name as customer_name,
              c.phone as customer_phone,
              u.full_name as created_by_name
       FROM sales s
       LEFT JOIN stores st ON s.store_id = st.id
       LEFT JOIN customers c ON s.customer_id = c.id
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.id = $1`,
      [req.params.id]
    );
    
    if (saleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    
    const sale = saleResult.rows[0];
    
    // Check access
    if (req.user.role === 'STORE_MANAGER' && sale.store_id !== req.user.store_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get line items
    const itemsResult = await pool.query(
      `SELECT sli.*, p.name as product_name, p.sku
       FROM sale_line_items sli
       LEFT JOIN products p ON sli.product_id = p.id
       WHERE sli.sale_id = $1
       ORDER BY sli.created_at`,
      [req.params.id]
    );
    
    sale.line_items = itemsResult.rows;
    
    res.json(sale);
  } catch (error) {
    console.error('Get sale error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create sale (with stock events)
router.post('/', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      store_id,
      customer_id,
      sale_type,
      line_items,
      discount_amount = 0,
      amount_paid = 0
    } = req.body;
    
    // Validation
    if (!store_id || !sale_type || !line_items || line_items.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Store, sale type, and line items required' });
    }
    
    // Check store access
    if (req.user.role === 'STORE_MANAGER' && store_id !== req.user.store_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied to this store' });
    }
    
    // Validate sale type + customer requirement
    if ((sale_type === 'PARTIAL' || sale_type === 'CREDIT') && !customer_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Customer required for partial/credit sales' });
    }
    
    // Calculate totals
    let subtotal = 0;
    for (const item of line_items) {
      subtotal += item.quantity * item.unit_price;
    }
    
    const total_amount = subtotal - discount_amount;
    const amount_due = total_amount - amount_paid;
    
    // Generate sale number
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const saleNumResult = await client.query(
      `SELECT COUNT(*) + 1 as num FROM sales WHERE sale_number LIKE 'INV-${today}%'`
    );
    const sale_number = `INV-${today}-${String(saleNumResult.rows[0].num).padStart(3, '0')}`;
    
    // Create sale
    const saleResult = await client.query(
      `INSERT INTO sales 
        (sale_number, store_id, customer_id, sale_type, subtotal, discount_amount, 
         total_amount, amount_paid, amount_due, created_by, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       RETURNING *`,
      [sale_number, store_id, customer_id, sale_type, subtotal, discount_amount,
       total_amount, amount_paid, amount_due, req.user.id]
    );
    
    const sale = saleResult.rows[0];
    
    // Create line items + stock events
    for (const item of line_items) {
      // Insert line item
      await client.query(
        `INSERT INTO sale_line_items 
          (sale_id, product_id, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5)`,
        [sale.id, item.product_id, item.quantity, item.unit_price, 
         item.quantity * item.unit_price]
      );
      
      // Create stock event (SALE reduces inventory)
      await client.query(
        `INSERT INTO stock_events 
          (event_type, product_id, store_id, quantity, reference_type, 
           reference_id, created_by, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        ['SALE', item.product_id, store_id, -item.quantity, 'SALE', 
         sale.id, req.user.id]
      );
    }
    
    // If payment made, create payment record
    if (amount_paid > 0 && customer_id) {
      const payNumResult = await client.query(
        `SELECT COUNT(*) + 1 as num FROM payments WHERE payment_number LIKE 'PAY-${today}%'`
      );
      const payment_number = `PAY-${today}-${String(payNumResult.rows[0].num).padStart(3, '0')}`;
      
      await client.query(
        `INSERT INTO payments 
          (payment_number, customer_id, sale_id, amount, payment_method, created_by, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [payment_number, customer_id, sale.id, amount_paid, 'CASH', req.user.id]
      );
    }
    
    await client.query('COMMIT');
    
    // Return full sale with items
    const fullSale = await pool.query(
      `SELECT s.*, 
              st.name as store_name,
              c.name as customer_name
       FROM sales s
       LEFT JOIN stores st ON s.store_id = st.id
       LEFT JOIN customers c ON s.customer_id = c.id
       WHERE s.id = $1`,
      [sale.id]
    );
    
    const itemsResult = await pool.query(
      `SELECT sli.*, p.name as product_name, p.sku
       FROM sale_line_items sli
       LEFT JOIN products p ON sli.product_id = p.id
       WHERE sli.sale_id = $1`,
      [sale.id]
    );
    
    const result = fullSale.rows[0];
    result.line_items = itemsResult.rows;
    
    res.status(201).json(result);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create sale error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Void sale (owner only)
router.post('/:id/void', authMiddleware, ownerOnly, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { reason } = req.body;
    
    if (!reason) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Reason required for voiding sale' });
    }
    
    // Check sale exists and is active
    const saleResult = await client.query(
      'SELECT * FROM sales WHERE id = $1',
      [req.params.id]
    );
    
    if (saleResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sale not found' });
    }
    
    const sale = saleResult.rows[0];
    
    if (sale.status === 'VOID') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Sale already voided' });
    }
    
    // Void the sale
    await client.query(
      `UPDATE sales 
       SET status = 'VOID', void_reason = $1, voided_by = $2, voided_at = NOW()
       WHERE id = $3`,
      [reason, req.user.id, req.params.id]
    );
    
    // Reverse stock events (add back inventory)
    const itemsResult = await client.query(
      'SELECT * FROM sale_line_items WHERE sale_id = $1',
      [req.params.id]
    );
    
    for (const item of itemsResult.rows) {
      await client.query(
        `INSERT INTO stock_events 
          (event_type, product_id, store_id, quantity, reference_type, 
           reference_id, notes, created_by, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        ['ADJUSTMENT', item.product_id, sale.store_id, item.quantity, 
         'SALE_VOID', sale.id, `Reversal for voided sale ${sale.sale_number}`, 
         req.user.id]
      );
    }
    
    // Log audit trail
    await client.query(
      `INSERT INTO audit_logs 
        (user_id, action, entity_type, entity_id, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, 'SALE_VOID', 'SALE', req.params.id, reason]
    );
    
    await client.query('COMMIT');
    
    res.json({ message: 'Sale voided successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Void sale error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
