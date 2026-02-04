const express = require('express');
const pool = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Get all customers
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { search } = req.query;
    
    let query = 'SELECT * FROM customers WHERE is_active = true';
    const params = [];
    
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (name ILIKE $1 OR phone ILIKE $1)`;
    }
    
    query += ' ORDER BY name ASC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single customer
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM customers WHERE id = $1',
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create customer
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, phone, whatsapp, address, notes } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name required' });
    }
    
    const result = await pool.query(
      `INSERT INTO customers (name, phone, whatsapp, address, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, phone, whatsapp, address, notes]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update customer
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, phone, whatsapp, address, notes, is_active } = req.body;
    
    const updates = [];
    const params = [req.params.id];
    let paramCount = 2;
    
    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      params.push(name);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramCount++}`);
      params.push(phone);
    }
    if (whatsapp !== undefined) {
      updates.push(`whatsapp = $${paramCount++}`);
      params.push(whatsapp);
    }
    if (address !== undefined) {
      updates.push(`address = $${paramCount++}`);
      params.push(address);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramCount++}`);
      params.push(notes);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      params.push(is_active);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_at = NOW()`);
    
    const result = await pool.query(
      `UPDATE customers SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get customer ledger (sales + payments)
router.get('/:id/ledger', authMiddleware, async (req, res) => {
  try {
    // Get all sales for customer
    const salesResult = await pool.query(
      `SELECT 
         s.id,
         s.sale_number,
         s.sale_type,
         s.total_amount,
         s.amount_paid,
         s.amount_due,
         s.status,
         s.created_at,
         st.name as store_name
       FROM sales s
       LEFT JOIN stores st ON s.store_id = st.id
       WHERE s.customer_id = $1
       ORDER BY s.created_at DESC`,
      [req.params.id]
    );
    
    // Get all payments for customer
    const paymentsResult = await pool.query(
      `SELECT 
         p.id,
         p.payment_number,
         p.amount,
         p.payment_method,
         p.reference,
         p.created_at,
         s.sale_number
       FROM payments p
       LEFT JOIN sales s ON p.sale_id = s.id
       WHERE p.customer_id = $1
       ORDER BY p.created_at DESC`,
      [req.params.id]
    );
    
    // Calculate totals
    const totals = await pool.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN status = 'ACTIVE' THEN total_amount ELSE 0 END), 0) as total_invoiced,
         COALESCE(SUM(CASE WHEN status = 'ACTIVE' THEN amount_paid ELSE 0 END), 0) as total_paid,
         COALESCE(SUM(CASE WHEN status = 'ACTIVE' THEN amount_due ELSE 0 END), 0) as total_due
       FROM sales
       WHERE customer_id = $1`,
      [req.params.id]
    );
    
    res.json({
      sales: salesResult.rows,
      payments: paymentsResult.rows,
      totals: totals.rows[0]
    });
  } catch (error) {
    console.error('Get customer ledger error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get customer aging (debt buckets)
router.get('/:id/aging', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         SUM(CASE 
           WHEN created_at >= NOW() - INTERVAL '7 days' THEN amount_due 
           ELSE 0 
         END) as days_0_7,
         SUM(CASE 
           WHEN created_at < NOW() - INTERVAL '7 days' 
           AND created_at >= NOW() - INTERVAL '30 days' THEN amount_due 
           ELSE 0 
         END) as days_8_30,
         SUM(CASE 
           WHEN created_at < NOW() - INTERVAL '30 days' 
           AND created_at >= NOW() - INTERVAL '60 days' THEN amount_due 
           ELSE 0 
         END) as days_31_60,
         SUM(CASE 
           WHEN created_at < NOW() - INTERVAL '60 days' THEN amount_due 
           ELSE 0 
         END) as days_60_plus
       FROM sales
       WHERE customer_id = $1 AND status = 'ACTIVE' AND amount_due > 0`,
      [req.params.id]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get customer aging error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
