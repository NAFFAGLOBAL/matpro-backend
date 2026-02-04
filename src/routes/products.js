const express = require('express');
const pool = require('../config/database');
const { authMiddleware, ownerOnly } = require('../middleware/auth');

const router = express.Router();

// Get all products (store managers see retail price only)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { category, search } = req.query;
    
    let query = `
      SELECT 
        id, sku, name, category, unit, variant_size, variant_thickness,
        retail_price, photo_url, is_active
        ${req.user.role === 'OWNER' ? ', cost_price' : ''}
      FROM products 
      WHERE is_active = true
    `;
    
    const params = [];
    
    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }
    
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (name ILIKE $${params.length} OR sku ILIKE $${params.length})`;
    }
    
    query += ' ORDER BY name ASC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single product
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const query = `
      SELECT 
        id, sku, name, category, unit, variant_size, variant_thickness,
        retail_price, photo_url, is_active, created_at, updated_at
        ${req.user.role === 'OWNER' ? ', cost_price' : ''}
      FROM products 
      WHERE id = $1
    `;
    
    const result = await pool.query(query, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create product (owner only)
router.post('/', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const {
      name, category, unit, variant_size, variant_thickness,
      retail_price, cost_price, photo_url
    } = req.body;

    if (!name || !unit || !retail_price) {
      return res.status(400).json({ error: 'Name, unit, and retail price required' });
    }

    // Generate SKU
    const skuResult = await pool.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(sku FROM 5) AS INTEGER)), 0) + 1 as next_num
       FROM products WHERE sku LIKE 'MAT-%'`
    );
    const sku = `MAT-${String(skuResult.rows[0].next_num).padStart(3, '0')}`;

    const result = await pool.query(
      `INSERT INTO products 
        (sku, name, category, unit, variant_size, variant_thickness, retail_price, cost_price, photo_url, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [sku, name, category, unit, variant_size, variant_thickness, retail_price, cost_price, photo_url, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update product (owner only)
router.patch('/:id', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const {
      name, category, unit, variant_size, variant_thickness,
      retail_price, cost_price, photo_url, is_active
    } = req.body;

    const updates = [];
    const params = [req.params.id];
    let paramCount = 2;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      params.push(name);
    }
    if (category !== undefined) {
      updates.push(`category = $${paramCount++}`);
      params.push(category);
    }
    if (unit !== undefined) {
      updates.push(`unit = $${paramCount++}`);
      params.push(unit);
    }
    if (variant_size !== undefined) {
      updates.push(`variant_size = $${paramCount++}`);
      params.push(variant_size);
    }
    if (variant_thickness !== undefined) {
      updates.push(`variant_thickness = $${paramCount++}`);
      params.push(variant_thickness);
    }
    if (retail_price !== undefined) {
      updates.push(`retail_price = $${paramCount++}`);
      params.push(retail_price);
    }
    if (cost_price !== undefined) {
      updates.push(`cost_price = $${paramCount++}`);
      params.push(cost_price);
    }
    if (photo_url !== undefined) {
      updates.push(`photo_url = $${paramCount++}`);
      params.push(photo_url);
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
      `UPDATE products SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
