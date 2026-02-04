const express = require('express');
const pool = require('../config/database');
const { authMiddleware, ownerOnly } = require('../middleware/auth');

const router = express.Router();

// Get all approval requests
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, storeId } = req.query;
    
    let query = `
      SELECT 
        ar.*,
        p.name as product_name,
        p.sku,
        st.name as store_name,
        u1.full_name as requested_by_name,
        u2.full_name as reviewed_by_name
      FROM approval_requests ar
      LEFT JOIN products p ON ar.product_id = p.id
      LEFT JOIN stores st ON ar.store_id = st.id
      LEFT JOIN users u1 ON ar.requested_by = u1.id
      LEFT JOIN users u2 ON ar.reviewed_by = u2.id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Store managers can only see their store's requests
    if (req.user.role === 'STORE_MANAGER') {
      params.push(req.user.store_id);
      query += ` AND ar.store_id = $${params.length}`;
    } else if (storeId) {
      params.push(storeId);
      query += ` AND ar.store_id = $${params.length}`;
    }
    
    if (status) {
      params.push(status);
      query += ` AND ar.status = $${params.length}`;
    }
    
    query += ' ORDER BY ar.requested_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get approvals error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create approval request (store manager)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      request_type = 'INVENTORY_ADJUSTMENT',
      store_id,
      product_id,
      requested_quantity,
      reason
    } = req.body;
    
    // Validation
    if (!store_id || !product_id || requested_quantity === undefined || !reason) {
      return res.status(400).json({ 
        error: 'Store, product, quantity, and reason required' 
      });
    }
    
    // Check store access
    if (req.user.role === 'STORE_MANAGER' && store_id !== req.user.store_id) {
      return res.status(403).json({ error: 'Access denied to this store' });
    }
    
    const result = await pool.query(
      `INSERT INTO approval_requests 
        (request_type, store_id, product_id, requested_quantity, reason, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [request_type, store_id, product_id, requested_quantity, reason, req.user.id]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create approval request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Approve request (owner only)
router.post('/:id/approve', authMiddleware, ownerOnly, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { notes } = req.body;
    
    // Get request
    const requestResult = await client.query(
      'SELECT * FROM approval_requests WHERE id = $1',
      [req.params.id]
    );
    
    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Request not found' });
    }
    
    const request = requestResult.rows[0];
    
    if (request.status !== 'PENDING') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Request already reviewed' });
    }
    
    // Update request
    await client.query(
      `UPDATE approval_requests 
       SET status = 'APPROVED', reviewed_by = $1, reviewed_at = NOW(), review_notes = $2
       WHERE id = $3`,
      [req.user.id, notes, req.params.id]
    );
    
    // Create stock event for adjustment
    await client.query(
      `INSERT INTO stock_events 
        (event_type, product_id, store_id, quantity, reference_type, 
         reference_id, notes, created_by, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      ['ADJUSTMENT', request.product_id, request.store_id, request.requested_quantity,
       'APPROVAL_REQUEST', request.id, request.reason, req.user.id]
    );
    
    // Log audit trail
    await client.query(
      `INSERT INTO audit_logs 
        (user_id, action, entity_type, entity_id, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, 'APPROVAL_APPROVED', 'APPROVAL_REQUEST', req.params.id, notes]
    );
    
    await client.query('COMMIT');
    
    res.json({ message: 'Request approved successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Approve request error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Reject request (owner only)
router.post('/:id/reject', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const { notes } = req.body;
    
    if (!notes) {
      return res.status(400).json({ error: 'Rejection notes required' });
    }
    
    // Get request
    const requestResult = await pool.query(
      'SELECT * FROM approval_requests WHERE id = $1',
      [req.params.id]
    );
    
    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    const request = requestResult.rows[0];
    
    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: 'Request already reviewed' });
    }
    
    // Update request
    await pool.query(
      `UPDATE approval_requests 
       SET status = 'REJECTED', reviewed_by = $1, reviewed_at = NOW(), review_notes = $2
       WHERE id = $3`,
      [req.user.id, notes, req.params.id]
    );
    
    // Log audit trail
    await pool.query(
      `INSERT INTO audit_logs 
        (user_id, action, entity_type, entity_id, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, 'APPROVAL_REJECTED', 'APPROVAL_REQUEST', req.params.id, notes]
    );
    
    res.json({ message: 'Request rejected successfully' });
  } catch (error) {
    console.error('Reject request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
