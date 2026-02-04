const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const salesRoutes = require('./routes/sales');
const inventoryRoutes = require('./routes/inventory');
const customerRoutes = require('./routes/customers');
const paymentRoutes = require('./routes/payments');
const approvalRoutes = require('./routes/approvals');
const syncRoutes = require('./routes/sync');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Larger limit for sync payloads

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'MatPro API'
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/sync', syncRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ MatPro API running on port ${PORT}`);
  console.log(`   http://localhost:${PORT}/health`);
});
