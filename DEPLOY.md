# MatPro - Deployment Guide

## Quick Deploy to Railway

**1. Create Railway Account**
- Go to https://railway.app
- Sign up with GitHub

**2. Create New Project**
- Click "New Project"
- Select "Deploy from GitHub repo"
- Connect GitHub account
- Select matpro repository

**3. Add PostgreSQL Database**
- In project, click "+ New"
- Select "Database" → "PostgreSQL"
- Railway will provision database automatically

**4. Configure Environment Variables**
- Click on your web service
- Go to "Variables" tab
- Add:
  ```
  DATABASE_URL=${{Postgres.DATABASE_URL}}
  JWT_SECRET=your-secret-key-here-change-this
  PORT=3000
  NODE_ENV=production
  ```

**5. Initialize Database**
- Railway provides a direct database connection
- Use Railway CLI or database client:
  ```bash
  # Install Railway CLI
  npm install -g @railway/cli
  
  # Login
  railway login
  
  # Connect to your project
  railway link
  
  # Run schema
  railway run psql < schema.sql
  ```

**6. Deploy**
- Railway auto-deploys on every push to main branch
- Or click "Deploy Now" in Railway dashboard

**7. Get API URL**
- Railway will provide a public URL like:
  `https://matpro-production.up.railway.app`

---

## Alternative: Deploy to Render

**1. Create Render Account**
- Go to https://render.com
- Sign up with GitHub

**2. Create PostgreSQL Database**
- Dashboard → "New +" → "PostgreSQL"
- Name: matpro-db
- Plan: Free (or paid for production)
- Copy the "Internal Database URL"

**3. Initialize Database**
```bash
# Connect to database
psql <INTERNAL_DATABASE_URL>

# Run schema
\i schema.sql

# Exit
\q
```

**4. Create Web Service**
- Dashboard → "New +" → "Web Service"
- Connect GitHub repository
- Name: matpro-api
- Environment: Node
- Build Command: `npm install`
- Start Command: `npm start`

**5. Set Environment Variables**
- In web service settings → "Environment"
- Add:
  ```
  DATABASE_URL=<your-postgres-internal-url>
  JWT_SECRET=your-secret-key-here
  NODE_ENV=production
  ```

**6. Deploy**
- Click "Create Web Service"
- Render will build and deploy automatically
- Get your API URL (e.g., https://matpro-api.onrender.com)

---

## Local Development Setup

**1. Install PostgreSQL**
```bash
# macOS
brew install postgresql
brew services start postgresql

# Linux
sudo apt-get install postgresql
sudo systemctl start postgresql

# Windows
# Download from https://www.postgresql.org/download/
```

**2. Create Database**
```bash
createdb matpro
psql matpro < schema.sql
```

**3. Configure Environment**
```bash
cp .env.example .env
# Edit .env and set DATABASE_URL
```

**4. Install Dependencies**
```bash
npm install
```

**5. Start Server**
```bash
npm start
```

API will run on http://localhost:3000

---

## Testing the API

**1. Health Check**
```bash
curl https://your-api-url.com/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-04T04:00:00.000Z",
  "version": "1.0.0",
  "service": "MatPro API"
}
```

**2. Login**
```bash
curl -X POST https://your-api-url.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+224620000001","pin":"123456"}'
```

**3. Get Products**
```bash
curl https://your-api-url.com/api/products \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**4. Create Sale**
```bash
curl -X POST https://your-api-url.com/api/sales \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "store_id": "11111111-1111-1111-1111-111111111111",
    "sale_type": "CASH",
    "line_items": [
      {
        "product_id": "<product-id>",
        "quantity": 2,
        "unit_price": 85000
      }
    ]
  }'
```

---

## API Endpoints Summary

### Authentication
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Products
- `GET /api/products` - List products
- `GET /api/products/:id` - Get product
- `POST /api/products` - Create (owner only)
- `PATCH /api/products/:id` - Update (owner only)

### Sales
- `GET /api/sales` - List sales
- `GET /api/sales/:id` - Get sale details
- `POST /api/sales` - Create sale
- `POST /api/sales/:id/void` - Void sale (owner only)

### Inventory
- `GET /api/inventory/:storeId` - Store inventory
- `GET /api/inventory/:storeId/:productId` - Product inventory + movements
- `GET /api/inventory/events/list` - Stock events
- `POST /api/inventory/events` - Create stock event

### Customers
- `GET /api/customers` - List customers
- `GET /api/customers/:id` - Get customer
- `POST /api/customers` - Create customer
- `PATCH /api/customers/:id` - Update customer
- `GET /api/customers/:id/ledger` - Customer ledger
- `GET /api/customers/:id/aging` - Aging analysis

### Payments
- `GET /api/payments` - List payments
- `POST /api/payments` - Record payment

### Approvals
- `GET /api/approvals` - List approval requests
- `POST /api/approvals` - Submit request
- `POST /api/approvals/:id/approve` - Approve (owner only)
- `POST /api/approvals/:id/reject` - Reject (owner only)

### Sync
- `POST /api/sync/push` - Push offline data
- `GET /api/sync/pull?since=timestamp` - Pull updates

---

## Production Checklist

- [ ] Database deployed and schema initialized
- [ ] Environment variables set (DATABASE_URL, JWT_SECRET)
- [ ] API deployed and accessible
- [ ] Health check returns 200 OK
- [ ] Login works with default users
- [ ] HTTPS enabled (Railway/Render do this automatically)
- [ ] Change default PINs for production users
- [ ] Set up database backups (Railway/Render have automatic backups)
- [ ] Monitor API logs for errors

---

## Database Backup

**Railway:**
```bash
# Backup
railway run pg_dump > backup.sql

# Restore
railway run psql < backup.sql
```

**Render:**
- Render provides automatic daily backups
- Manual backup via dashboard or CLI

---

## Monitoring

**Check API Health:**
```bash
# Every 5 minutes
*/5 * * * * curl https://your-api-url.com/health
```

**Check Database Connection:**
```bash
railway run psql -c "SELECT COUNT(*) FROM products;"
```

---

## Troubleshooting

**Problem: API not starting**
- Check logs: `railway logs` or Render dashboard
- Verify DATABASE_URL is set correctly
- Ensure schema.sql was run

**Problem: Database connection error**
- Verify DATABASE_URL includes correct credentials
- Check if database service is running
- Try connecting with psql directly

**Problem: Authentication failing**
- Verify JWT_SECRET is set
- Check user exists: `SELECT * FROM users WHERE phone = '+224620000001';`
- Verify PIN hash is correct

---

## Next Steps After Deployment

1. ✅ Test all API endpoints
2. ✅ Change default user PINs
3. 🚧 Build Flutter mobile app
4. 🚧 Implement offline sync in mobile app
5. 🚧 Build admin dashboard (Next.js)
6. 🚧 Set up monitoring/alerting
7. 🚧 Create user documentation
8. 🚧 Conduct user training

---

**API Status:** ✅ Complete and ready to deploy  
**Deployment Time:** ~10 minutes on Railway/Render  
**Cost:** Free tier available on both platforms
