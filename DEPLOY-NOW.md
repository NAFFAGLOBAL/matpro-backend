# 🚀 DEPLOY NOW - Quick Start Guide

## Status: ✅ Backend 100% Complete - Ready for Production

**Location:** `/root/.openclaw/workspace/matpro/`  
**Git Status:** Committed and ready to push

---

## Option 1: Railway (Recommended - 5 minutes)

### Prerequisites
You need to:
1. Create/login to Railway account: https://railway.app
2. Add SSH key to GitHub OR use Railway's GitHub app

### Quick Deploy Steps

**A. Push Code to GitHub (if not already done):**

The code is in `/root/.openclaw/workspace/matpro/`

You can either:
1. Create a repo on GitHub: `mamadou-temp/matpro-backend`
2. Add your SSH key to GitHub
3. Push: `git push origin master`

OR

1. Download the folder as ZIP
2. Create repo on GitHub
3. Upload files via GitHub web interface

**B. Deploy on Railway:**

1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your `matpro-backend` repo
5. Railway auto-detects Node.js and deploys
6. Click "+ New" → "Database" → "PostgreSQL"
7. Add environment variables:
   ```
   DATABASE_URL = ${{Postgres.DATABASE_URL}}
   JWT_SECRET = <generate-random-string>
   NODE_ENV = production
   ```

**C. Initialize Database:**

```bash
# Install Railway CLI (if not logged in)
npm install -g @railway/cli
railway login
railway link  # Select your project

# Load schema
railway run psql < schema.sql
```

**D. Test:**
```bash
curl https://your-railway-url.up.railway.app/health
```

✅ **Done! API is live.**

---

## Option 2: Render (Alternative - 10 minutes)

### A. Create Account
https://render.com → Sign up with GitHub

### B. Create PostgreSQL Database

1. Dashboard → "New +" → "PostgreSQL"
2. Name: `matpro-db`
3. Plan: Free (or paid for production)
4. Copy **Internal Database URL**

### C. Initialize Database

```bash
# Use the connection string from Render
psql "<internal-database-url>" < schema.sql
```

### D. Create Web Service

1. Dashboard → "New +" → "Web Service"
2. Connect your GitHub repo
3. Settings:
   - Name: `matpro-api`
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Add Environment Variables:
   ```
   DATABASE_URL = <postgres-internal-url>
   JWT_SECRET = <random-32-char-string>
   NODE_ENV = production
   ```

5. Click "Create Web Service"

✅ **Done! API is live at:** `https://matpro-api.onrender.com`

---

## Option 3: Local Testing (Development)

### A. Install PostgreSQL

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**macOS:**
```bash
brew install postgresql
brew services start postgresql
```

### B. Create Database

```bash
sudo -u postgres createdb matpro
sudo -u postgres psql matpro < /root/.openclaw/workspace/matpro/schema.sql
```

### C. Configure Environment

```bash
cd /root/.openclaw/workspace/matpro
cp .env.example .env

# Edit .env
DATABASE_URL=postgresql://postgres:password@localhost:5432/matpro
JWT_SECRET=your-secret-key-here
NODE_ENV=development
PORT=3000
```

### D. Start Server

```bash
npm install
npm start
```

✅ **API running at:** `http://localhost:3000`

---

## 🔐 Post-Deployment Security

### 1. Change Default PINs

```sql
-- Connect to your database
psql <your-database-url>

-- List current users
SELECT id, phone, role, name FROM users;

-- Change owner PIN (current: 123456)
UPDATE users 
SET pin_hash = '<new-bcrypt-hash>'
WHERE phone = '+224620000001';

-- Generate new hash with Node.js:
-- node -e "console.log(require('bcryptjs').hashSync('YOUR_NEW_PIN', 10))"
```

### 2. Generate Secure JWT_SECRET

```bash
openssl rand -base64 32
# Or
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. Restrict CORS (Optional)

Edit `src/index.js`:
```javascript
app.use(cors({
  origin: ['https://your-mobile-app-domain.com']
}));
```

---

## ✅ Verification Checklist

After deployment, test these endpoints:

### Health Check
```bash
curl https://your-api-url.com/health
# Expected: {"status":"ok",...}
```

### Login
```bash
curl -X POST https://your-api-url.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+224620000001","pin":"123456"}'
# Expected: {"token":"...","user":{...}}
```

### Get Products (requires token from login)
```bash
curl https://your-api-url.com/api/products \
  -H "Authorization: Bearer YOUR_TOKEN"
# Expected: [{"id":"...","name":"Ciment",...},...]
```

### Create Sale
```bash
curl -X POST https://your-api-url.com/api/sales \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "store_id": "11111111-1111-1111-1111-111111111111",
    "sale_type": "CASH",
    "line_items": [{
      "product_id": "<product-id-from-products-list>",
      "quantity": 1,
      "unit_price": 85000
    }]
  }'
# Expected: {"id":"...","sale_number":"INV-...",...}
```

---

## 📱 Next Step: Mobile App

Once API is deployed:

1. Get your production API URL (e.g., `https://matpro-production.up.railway.app`)
2. Update Flutter app configuration
3. I'll build the Flutter app screens

---

## 🆘 Troubleshooting

### Problem: Schema initialization fails
```bash
# Check database connection
psql <database-url> -c "SELECT 1;"

# Try manual table creation
psql <database-url>
# Then paste schema.sql contents
```

### Problem: Login returns 401
```bash
# Verify users exist
psql <database-url> -c "SELECT * FROM users;"

# Check JWT_SECRET is set
# Check phone number format (+224...)
```

### Problem: Port conflict
```bash
# Railway/Render handle this automatically
# For local: change PORT in .env
```

---

## 📞 Need Help?

**API Documentation:** `/root/.openclaw/workspace/matpro/API.md`  
**Architecture:** `/root/.openclaw/workspace/matpro/ARCHITECTURE.md`  
**All Files Ready:** `/root/.openclaw/workspace/matpro/`

---

## 🎯 Deployment Decision

**I recommend Railway** because:
- Fastest deployment (GitHub integration)
- Auto-detects Node.js
- Free PostgreSQL included
- Automatic HTTPS
- Easy database management
- Built-in logging

**Time to production:** 5-10 minutes

---

**Current Status:** All code ready, waiting for deployment platform authentication

**Next:** Choose Railway or Render, follow steps above, then I'll build the Flutter app.
