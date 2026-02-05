# Railway Deployment - Manual Steps

## ✅ Project Created: MatPro Backend
**Project ID:** 43b91eac-82fe-42fa-aa93-ad2df3f4fbd3

Your new Railway project has been created in your workspace!

---

## 🚀 Complete Deployment (5 minutes)

### Step 1: Access Your Project
1. Go to https://railway.app
2. You should see **"MatPro Backend"** in your projects list
3. Click on it to open

### Step 2: Add PostgreSQL Database
1. Inside the MatPro Backend project, click **"+ New"**
2. Select **"Database"**
3. Choose **"Add PostgreSQL"**
4. Railway will provision the database automatically (takes ~30 seconds)

### Step 3: Deploy the Backend Service

**Option A: From GitHub (Recommended)**
1. Click **"+ New"** → **"GitHub Repo"**
2. Connect your GitHub account if not already connected
3. Select the repository: `mamadou-temp/matpro-backend`
4. Railway will auto-detect Node.js and deploy

**Option B: From Local Files (If GitHub not set up)**
1. Click **"+ New"** → **"Empty Service"**
2. In the service settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
3. Connect via Railway CLI:
   ```bash
   cd /root/.openclaw/workspace/matpro
   railway link 43b91eac-82fe-42fa-aa93-ad2df3f4fbd3
   railway up
   ```

### Step 4: Set Environment Variables
1. Click on your **backend service** (not the database)
2. Go to **"Variables"** tab
3. Add these variables:
   ```
   DATABASE_URL = ${{Postgres.DATABASE_URL}}
   JWT_SECRET = $(openssl rand -base64 32)
   NODE_ENV = production
   PORT = 3000
   ```

**To generate JWT_SECRET:**
```bash
openssl rand -base64 32
```
Copy the output and paste as JWT_SECRET value

**For DATABASE_URL:**
- Type `${{` and Railway will show available variables
- Select `Postgres.DATABASE_URL`

### Step 5: Initialize Database Schema
1. Once the service is deployed, click on it
2. Go to **"Settings"** → **"Deploy"**
3. Add a **"Deploy Hook"** or run manually:

**Option A: Via Railway CLI**
```bash
railway link 43b91eac-82fe-42fa-aa93-ad2df3f4fbd3
railway run psql $DATABASE_URL < schema.sql
```

**Option B: Via Database Console**
1. Click on **PostgreSQL** database
2. Click **"Data"** tab
3. Copy and paste contents of `schema.sql`
4. Execute

### Step 6: Verify Deployment
1. In your backend service, go to **"Settings"**
2. Copy the **"Public Domain"** URL (e.g., `matpro-backend-production.up.railway.app`)
3. Test health check:
   ```bash
   curl https://YOUR-DOMAIN.up.railway.app/health
   ```

Expected response:
```json
{"status":"ok","timestamp":"...","service":"MatPro API"}
```

4. Test login:
   ```bash
   curl -X POST https://YOUR-DOMAIN.up.railway.app/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"phone":"+224620000001","pin":"123456"}'
   ```

Should return a token!

---

## 🔐 Security Checklist

After deployment:

1. ✅ Generate strong JWT_SECRET (not the example one)
2. ✅ Change default user PINs:
   ```sql
   -- Connect to database
   UPDATE users 
   SET pin_hash = '$2a$10$NEW_HASH_HERE'
   WHERE phone = '+224620000001';
   ```
3. ✅ Enable automatic backups (Railway does this by default)
4. ✅ Monitor deployment logs for errors

---

## 📊 Expected Costs

- **Free Tier:** $0 (500 hours/month - enough for testing)
- **Hobby Plan:** $5/month (recommended for production)
- **Pro Plan:** $20/month (for scaling)

---

## ✅ Once Deployed

Send me the production URL and I'll:
1. Update the Flutter app configuration
2. Complete remaining mobile screens
3. Build APK for testing

---

## 🆘 Troubleshooting

**Service won't start:**
- Check logs in Railway dashboard
- Verify DATABASE_URL is set
- Ensure schema.sql was executed

**Database connection errors:**
- Verify Postgres plugin is running
- Check DATABASE_URL format
- Make sure service and database are in same project

**Need help?**
Share screenshots of Railway dashboard or error logs.

