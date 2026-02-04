const express = require('express');
const pool = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Push offline data to server
router.post('/push', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { sales = [], payments = [], stock_events = [], customers = [] } = req.body;
    
    const results = {
      sales: { success: 0, failed: 0, errors: [] },
      payments: { success: 0, failed: 0, errors: [] },
      stock_events: { success: 0, failed: 0, errors: [] },
      customers: { success: 0, failed: 0, errors: [] }
    };
    
    // Process customers first (dependencies)
    for (const customer of customers) {
      try {
        await client.query(
          `INSERT INTO customers (id, name, phone, whatsapp, address, notes, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             phone = EXCLUDED.phone,
             updated_at = NOW()`,
          [customer.id, customer.name, customer.phone, customer.whatsapp,
           customer.address, customer.notes, customer.created_at]
        );
        results.customers.success++;
      } catch (error) {
        results.customers.failed++;
        results.customers.errors.push({ 
          id: customer.id, 
          error: error.message 
        });
      }
    }
    
    // Process sales
    for (const sale of sales) {
      try {
        // Insert sale
        await client.query(
          `INSERT INTO sales 
            (id, sale_number, store_id, customer_id, sale_type, subtotal, 
             discount_amount, total_amount, amount_paid, amount_due, status,
             created_by, created_at, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
           ON CONFLICT (id) DO NOTHING`,
          [sale.id, sale.sale_number, sale.store_id, sale.customer_id, sale.sale_type,
           sale.subtotal, sale.discount_amount, sale.total_amount, sale.amount_paid,
           sale.amount_due, sale.status, sale.created_by, sale.created_at]
        );
        
        // Insert line items
        for (const item of sale.line_items || []) {
          await client.query(
            `INSERT INTO sale_line_items 
              (id, sale_id, product_id, quantity, unit_price, line_total, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO NOTHING`,
            [item.id, sale.id, item.product_id, item.quantity, 
             item.unit_price, item.line_total, item.created_at]
          );
        }
        
        results.sales.success++;
      } catch (error) {
        results.sales.failed++;
        results.sales.errors.push({ 
          id: sale.id, 
          sale_number: sale.sale_number,
          error: error.message 
        });
      }
    }
    
    // Process stock events
    for (const event of stock_events) {
      try {
        await client.query(
          `INSERT INTO stock_events 
            (id, event_type, product_id, store_id, quantity, reference_type,
             reference_id, notes, created_by, created_at, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
           ON CONFLICT (id) DO NOTHING`,
          [event.id, event.event_type, event.product_id, event.store_id,
           event.quantity, event.reference_type, event.reference_id, event.notes,
           event.created_by, event.created_at]
        );
        results.stock_events.success++;
      } catch (error) {
        results.stock_events.failed++;
        results.stock_events.errors.push({ 
          id: event.id, 
          error: error.message 
        });
      }
    }
    
    // Process payments
    for (const payment of payments) {
      try {
        await client.query(
          `INSERT INTO payments 
            (id, payment_number, customer_id, sale_id, amount, payment_method,
             reference, notes, created_by, created_at, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
           ON CONFLICT (id) DO NOTHING`,
          [payment.id, payment.payment_number, payment.customer_id, payment.sale_id,
           payment.amount, payment.payment_method, payment.reference, payment.notes,
           payment.created_by, payment.created_at]
        );
        
        // Update sale amounts if linked
        if (payment.sale_id) {
          await client.query(
            `UPDATE sales 
             SET amount_paid = amount_paid + $1,
                 amount_due = amount_due - $1
             WHERE id = $2`,
            [payment.amount, payment.sale_id]
          );
        }
        
        results.payments.success++;
      } catch (error) {
        results.payments.failed++;
        results.payments.errors.push({ 
          id: payment.id, 
          payment_number: payment.payment_number,
          error: error.message 
        });
      }
    }
    
    await client.query('COMMIT');
    
    res.json({
      message: 'Sync completed',
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sync push error:', error);
    res.status(500).json({ error: 'Sync failed', details: error.message });
  } finally {
    client.release();
  }
});

// Pull updates from server
router.get('/pull', authMiddleware, async (req, res) => {
  try {
    const { since } = req.query;
    const sinceDate = since || '1970-01-01';
    
    // Get products updates
    const products = await pool.query(
      'SELECT * FROM products WHERE updated_at > $1 ORDER BY updated_at',
      [sinceDate]
    );
    
    // Get sales for user's store(s)
    let salesQuery = `
      SELECT s.*, 
             st.name as store_name,
             c.name as customer_name
      FROM sales s
      LEFT JOIN stores st ON s.store_id = st.id
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.synced_at > $1
    `;
    
    const params = [sinceDate];
    
    if (req.user.role === 'STORE_MANAGER') {
      params.push(req.user.store_id);
      salesQuery += ` AND s.store_id = $${params.length}`;
    }
    
    salesQuery += ' ORDER BY s.synced_at LIMIT 100';
    
    const sales = await pool.query(salesQuery, params);
    
    // Get sale line items for those sales
    const saleIds = sales.rows.map(s => s.id);
    let lineItems = [];
    
    if (saleIds.length > 0) {
      const lineItemsResult = await pool.query(
        `SELECT sli.*, p.name as product_name, p.sku
         FROM sale_line_items sli
         LEFT JOIN products p ON sli.product_id = p.id
         WHERE sli.sale_id = ANY($1)`,
        [saleIds]
      );
      lineItems = lineItemsResult.rows;
    }
    
    // Get stock events
    let eventsQuery = `
      SELECT * FROM stock_events 
      WHERE synced_at > $1
    `;
    
    const eventParams = [sinceDate];
    
    if (req.user.role === 'STORE_MANAGER') {
      eventParams.push(req.user.store_id);
      eventsQuery += ` AND store_id = $${eventParams.length}`;
    }
    
    eventsQuery += ' ORDER BY synced_at LIMIT 100';
    
    const stock_events = await pool.query(eventsQuery, eventParams);
    
    // Get customers updates
    const customers = await pool.query(
      'SELECT * FROM customers WHERE updated_at > $1 ORDER BY updated_at',
      [sinceDate]
    );
    
    // Get payments
    const payments = await pool.query(
      `SELECT * FROM payments 
       WHERE synced_at > $1 
       ORDER BY synced_at LIMIT 100`,
      [sinceDate]
    );
    
    res.json({
      products: products.rows,
      sales: sales.rows,
      sale_line_items: lineItems,
      stock_events: stock_events.rows,
      customers: customers.rows,
      payments: payments.rows,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sync pull error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
