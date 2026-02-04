const express = require('express');
const pool = require('../config/database');
const { authMiddleware, ownerOnly } = require('../middleware/auth');

const router = express.Router();

// Get inventory for a store
router.get('/:storeId', authMiddleware, async (req, res) => {
  try {
    const { storeId } = req.params;
    
    // Check access
    if (req.user.role === 'STORE_MANAGER' && storeId !== req.user.store_id) {
      return res.status(403).json({ error: 'Access denied to this store' });
    }
    
    const result = await pool.query(
      `SELECT 
         p.id as product_id,
         p.sku,
         p.name as product_name,
         p.category,
         p.unit,
         p.variant_size,
         p.retail_price,
         COALESCE(i.on_hand_qty, 0) as on_hand_qty,
         i.last_movement_at
       FROM products p
       LEFT JOIN inventory_current i ON p.id = i.product_id AND i.store_id = $1
       WHERE p.is_active = true
       ORDER BY p.name`,
      [storeId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get inventory for specific product in store
router.get('/:storeId/:productId', authMiddleware, async (req, res) => {
  try {
    const { storeId, productId } = req.params;
    
    // Check access
    if (req.user.role === 'STORE_MANAGER' && storeId !== req.user.store_id) {
      return res.status(403).json({ error: 'Access denied to this store' });
    }
    
    // Get current inventory
    const invResult = await pool.query(
      `SELECT 
         p.id as product_id,
         p.sku,
         p.name as product_name,
         p.category,
         p.unit,
         p.retail_price,
         COALESCE(i.on_hand_qty, 0) as on_hand_qty,
         i.last_movement_at
       FROM products p
       LEFT JOIN inventory_current i ON p.id = i.product_id AND i.store_id = $1
       WHERE p.id = $2`,
      [storeId, productId]
    );
    
    if (invResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Get movement history
    const movementsResult = await pool.query(
      `SELECT 
         se.id,
         se.event_type,
         se.quantity,
         se.reference_type,
         se.reference_id,
         se.notes,
         se.created_at,
         u.full_name as created_by_name
       FROM stock_events se
       LEFT JOIN users u ON se.created_by = u.id
       WHERE se.product_id = $1 AND se.store_id = $2
       ORDER BY se.created_at DESC
       LIMIT 50`,
      [productId, storeId]
    );
    
    const result = invResult.rows[0];
    result.movements = movementsResult.rows;
    
    res.json(result);
  } catch (error) {
    console.error('Get product inventory error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get stock events (with filtering)
router.get('/events/list', authMiddleware, async (req, res) => {
  try {
    const { storeId, productId, eventType, from, to } = req.query;
    
    let query = `
      SELECT 
        se.*,
        p.name as product_name,
        p.sku,
        st.name as store_name,
        u.full_name as created_by_name
      FROM stock_events se
      LEFT JOIN products p ON se.product_id = p.id
      LEFT JOIN stores st ON se.store_id = st.id
      LEFT JOIN users u ON se.created_by = u.id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Store managers can only see their store
    if (req.user.role === 'STORE_MANAGER') {
      params.push(req.user.store_id);
      query += ` AND se.store_id = $${params.length}`;
    } else if (storeId) {
      params.push(storeId);
      query += ` AND se.store_id = $${params.length}`;
    }
    
    if (productId) {
      params.push(productId);
      query += ` AND se.product_id = $${params.length}`;
    }
    
    if (eventType) {
      params.push(eventType);
      query += ` AND se.event_type = $${params.length}`;
    }
    
    if (from) {
      params.push(from);
      query += ` AND se.created_at >= $${params.length}`;
    }
    
    if (to) {
      params.push(to);
      query += ` AND se.created_at <= $${params.length}`;
    }
    
    query += ' ORDER BY se.created_at DESC LIMIT 100';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get stock events error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create stock event (RECEIVE, TRANSFER, owner only for ADJUSTMENT)
router.post('/events', authMiddleware, async (req, res) => {
  try {
    const {
      event_type,
      product_id,
      store_id,
      quantity,
      reference_type,
      reference_id,
      notes
    } = req.body;
    
    // Validation
    if (!event_type || !product_id || !store_id || quantity === undefined) {
      return res.status(400).json({ 
        error: 'Event type, product, store, and quantity required' 
      });
    }
    
    // Check access
    if (req.user.role === 'STORE_MANAGER' && store_id !== req.user.store_id) {
      return res.status(403).json({ error: 'Access denied to this store' });
    }
    
    // ADJUSTMENT requires owner permission or approval
    if (event_type === 'ADJUSTMENT' && req.user.role !== 'OWNER') {
      return res.status(403).json({ 
        error: 'Adjustments require owner approval. Submit approval request instead.' 
      });
    }
    
    const result = await pool.query(
      `INSERT INTO stock_events 
        (event_type, product_id, store_id, quantity, reference_type, 
         reference_id, notes, created_by, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [event_type, product_id, store_id, quantity, reference_type,
       reference_id, notes, req.user.id]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create stock event error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
