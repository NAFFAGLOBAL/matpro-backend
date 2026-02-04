const express = require('express');
const pool = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Get all payments
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { customerId, saleId, from, to } = req.query;
    
    let query = `
      SELECT 
        p.*,
        c.name as customer_name,
        s.sale_number,
        u.full_name as created_by_name
      FROM payments p
      LEFT JOIN customers c ON p.customer_id = c.id
      LEFT JOIN sales s ON p.sale_id = s.id
      LEFT JOIN users u ON p.created_by = u.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (customerId) {
      params.push(customerId);
      query += ` AND p.customer_id = $${params.length}`;
    }
    
    if (saleId) {
      params.push(saleId);
      query += ` AND p.sale_id = $${params.length}`;
    }
    
    if (from) {
      params.push(from);
      query += ` AND p.created_at >= $${params.length}`;
    }
    
    if (to) {
      params.push(to);
      query += ` AND p.created_at <= $${params.length}`;
    }
    
    query += ' ORDER BY p.created_at DESC LIMIT 100';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create payment
router.post('/', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      customer_id,
      sale_id,
      amount,
      payment_method = 'CASH',
      reference,
      notes
    } = req.body;
    
    // Validation
    if (!customer_id || !amount || amount <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Customer and positive amount required' });
    }
    
    // Generate payment number
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const payNumResult = await client.query(
      `SELECT COUNT(*) + 1 as num FROM payments WHERE payment_number LIKE 'PAY-${today}%'`
    );
    const payment_number = `PAY-${today}-${String(payNumResult.rows[0].num).padStart(3, '0')}`;
    
    // Create payment
    const paymentResult = await client.query(
      `INSERT INTO payments 
        (payment_number, customer_id, sale_id, amount, payment_method, 
         reference, notes, created_by, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [payment_number, customer_id, sale_id, amount, payment_method,
       reference, notes, req.user.id]
    );
    
    const payment = paymentResult.rows[0];
    
    // If payment is for a specific sale, update sale amounts
    if (sale_id) {
      await client.query(
        `UPDATE sales 
         SET amount_paid = amount_paid + $1,
             amount_due = amount_due - $1
         WHERE id = $2`,
        [amount, sale_id]
      );
    }
    
    await client.query('COMMIT');
    
    // Return full payment with details
    const fullPayment = await pool.query(
      `SELECT 
         p.*,
         c.name as customer_name,
         s.sale_number
       FROM payments p
       LEFT JOIN customers c ON p.customer_id = c.id
       LEFT JOIN sales s ON p.sale_id = s.id
       WHERE p.id = $1`,
      [payment.id]
    );
    
    res.status(201).json(fullPayment.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create payment error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
