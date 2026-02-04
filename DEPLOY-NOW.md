# Deploy MatPro Backend NOW - Step by Step

## Option 1: Railway (Fastest - 5 minutes)

### Step 1: Create Railway Account
1. Go to https://railway.app
2. Click "Login with GitHub"
3. Authorize Railway

### Step 2: Create New Project from GitHub
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Click "Configure GitHub App"
4. Select the repository containing this code
5. Click "Deploy Now"

### Step 3: Add PostgreSQL Database
1. In your project, click "+ New"
2. Select "Database" → "PostgreSQL"
3. Railway automatically provisions the database

### Step 4: Connect Database to API
1. Click on your web service (not the database)
2. Go to "Variables" tab
3. Add these variables:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   JWT_SECRET=matpro-secret-change-in-production-2026
   NODE_ENV=production
   ```
4. Click "Save"

### Step 5: Initialize Database Schema
Railway provides a way to run SQL directly:

**Option A: Using Railway CLI**
```bash
# In your terminal where this code is
railway login
railway link
railway run psql < schema.sql
```

**Option B: Using Railway Dashboard**
1. Click on PostgreSQL database service
2. Click "Data" tab
3. Click "Query" button
4. Copy entire contents of `schema.sql`
5. Paste and execute

### Step 6: Get Your API URL
1. Click on your web service
2. Go to "Settings" tab
3. Copy the public URL (e.g., `https://matpro-production.up.railway.app`)

### Step 7: Test It
```bash
# Replace with your Railway URL
export API_URL="https://your-app.up.railway.app"

# Health check
curl $API_URL/health

# Login
curl -X POST $API_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+224620000001","pin":"123456"}'

# If you get a token, it's working! 🎉
```

---

## Option 2: Render (Alternative - 10 minutes)

### Step 1: Create Render Account
1. Go to https://render.com
2. Sign up with GitHub

### Step 2: Create PostgreSQL Database
1. Dashboard → "+ New" → "PostgreSQL"
2. Name: `matpro-db`
3. Plan: Free
4. Click "Create Database"
5. **Copy the "Internal Database URL"**

### Step 3: Initialize Database
```bash
# Connect to database (replace with your URL)
psql <INTERNAL_DATABASE_URL_FROM_RENDER>

# Inside psql, run:
\i schema.sql

# Exit
\q
```

### Step 4: Create Web Service
1. Dashboard → "+ New" → "Web Service"
2. Connect your GitHub repository
3. Settings:
   - Name: `matpro-api`
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`

### Step 5: Add Environment Variables
In web service "Environment" tab:
```
DATABASE_URL=<paste-internal-database-url-here>
JWT_SECRET=matpro-secret-change-in-production-2026
NODE_ENV=production
```

### Step 6: Deploy
Click "Create Web Service" - Render will build and deploy automatically.

Get your URL from the dashboard (e.g., `https://matpro-api.onrender.com`)

---

## Option 3: Deploy Locally for Testing

If you want to test locally first before cloud deployment:

```bash
# 1. Install PostgreSQL (if not already)
# macOS: brew install postgresql && brew services start postgresql
# Linux: sudo apt-get install postgresql && sudo systemctl start postgresql

# 2. Create database
createdb matpro
psql matpro < schema.sql

# 3. Set environment
cat > .env << EOF
DATABASE_URL=postgresql://localhost:5432/matpro
JWT_SECRET=local-secret-key
PORT=3000
NODE_ENV=development
EOF

# 4. Install and run
npm install
npm start

# 5. Test
curl http://localhost:3000/health
```

---

## Troubleshooting

**Problem: Railway/Render can't find my repo**
- Solution: Push code to GitHub first:
  ```bash
  # Create new repo on GitHub, then:
  git remote add origin https://github.com/YOUR_USERNAME/matpro.git
  git push -u origin master
  ```

**Problem: Database connection error**
- Solution: Verify `DATABASE_URL` environment variable is set correctly
- Check format: `postgresql://user:password@host:port/database`

**Problem: Schema not initialized**
- Solution: Run `schema.sql` manually using Railway CLI or Render dashboard

**Problem: Login fails with 401**
- Solution: Check `JWT_SECRET` is set in environment variables

---

## Quick Verification Checklist

After deployment:

- [ ] Health check returns `{"status":"ok",...}`
- [ ] Login with `+224620000001` / `123456` returns token
- [ ] GET `/api/products` with token returns 5 products
- [ ] Can create sale via POST `/api/sales`
- [ ] Inventory decreases after sale

---

## What's Next

Once deployed:

1. ✅ Backend is live and accessible
2. 🚧 Build Flutter mobile app
3. 🚧 Configure mobile app to use production URL
4. 🚧 Test offline sync
5. 🚧 Build admin dashboard

---

## Need Help?

Check these files:
- `API.md` - Complete API reference
- `DEPLOY.md` - Detailed deployment guide
- `README.md` - Quick start guide

---

**Estimated deployment time:** 5-10 minutes  
**Cost:** Free tier available on both Railway and Render  
**Recommended:** Railway (easier, faster)
