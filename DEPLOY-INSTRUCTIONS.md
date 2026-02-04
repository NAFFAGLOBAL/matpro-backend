# MatPro - Deployment Instructions

## ✅ Status: Ready to Deploy

The backend is **100% complete** and ready for production deployment.

**Repository:** https://github.com/mamadou-temp/matpro-backend.git  
**Branch:** master  
**Latest commit:** Deployment configurations added

---

## 🚀 Recommended: Deploy via Railway (5 minutes)

### Step 1: Push Latest Code to GitHub

```bash
cd /root/.openclaw/workspace/matpro
git push origin master
```

### Step 2: Deploy on Railway

1. Go to https://railway.app
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose: `mamadou-temp/matpro-backend`
5. Railway will automatically:
   - Detect Node.js app
   - Build using `npm install`
   - Start with `npm start`

### Step 3: Add PostgreSQL Database

1. In your Railway project, click **"+ New"**
2. Select **"Database" → "PostgreSQL"**
3. Railway creates database automatically
4. Copy the **DATABASE_URL** from Variables tab

### Step 4: Set Environment Variables

In Railway project → **Variables** tab:

```
DATABASE_URL = ${{Postgres.DATABASE_URL}}
JWT_SECRET = <generate-random-32-char-string>
NODE_ENV = production
PORT = 3000
```

**Generate secure JWT_SECRET:**
```bash
openssl rand -base64 32
```

### Step 5: Initialize Database Schema

**Option A: Railway CLI**
```bash
railway login
railway link  # Select your project
railway run psql < schema.sql
```

**Option B: Direct psql connection**
```bash
# Get connection string from Railway dashboard
psql "postgresql://user:pass@host:port/railway" < schema.sql
```

### Step 6: Test Deployment

```bash
# Replace with your Railway URL
curl https://matpro-production.up.railway.app/health

# Expected response:
# {"status":"ok","timestamp":"...","service":"MatPro API"}
```

### Step 7: Test Login

```bash
curl -X POST https://matpro-production.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+224620000001","pin":"123456"}'

# Should return: {"token":"...","user":{...}}
```

---

## 🔐 Security Checklist

### Before Going Live:

1. ✅ Change default user PINs
   ```sql
   -- Connect to database
   railway run psql
   
   -- Update owner PIN (example: new PIN = 789012)
   UPDATE users 
   SET pin_hash = '$2a$10$...'  -- Generate with bcrypt
   WHERE phone = '+224620000001';
   ```

2. ✅ Use strong JWT_SECRET (32+ random characters)

3. ✅ Enable HTTPS (Railway does this automatically)

4. ✅ Set up database backups (Railway auto-backup included)

5. ✅ Review CORS settings if needed
   ```javascript
   // In src/index.js, currently allows all origins
   // For production, restrict to mobile app origins only
   ```

---

## 📊 Monitoring

### Health Check
```bash
# Automated health check every 5 minutes
*/5 * * * * curl https://your-app.railway.app/health
```

### Database Size
```bash
railway run psql -c "\dt+"
```

### Recent Errors
```bash
railway logs --tail 100
```

---

## 🔄 Database Migrations (Future Updates)

When you add new features that require database changes:

```bash
# 1. Create migration SQL file
cat > migrations/001_add_vendors_table.sql << EOF
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  ...
);
EOF

# 2. Apply migration
railway run psql < migrations/001_add_vendors_table.sql

# 3. Commit and push
git add migrations/
git commit -m "Add vendors table migration"
git push origin master
```

---

## 🌍 Production URL

After deployment, your API will be available at:

```
https://matpro-production.up.railway.app
```

Or custom domain (Railway supports this):
```
https://api.matpro.gn
```

---

## 📱 Next: Update Mobile App

Once deployed, update the Flutter app's API URL:

**File:** `matpro-mobile/lib/core/network/api_client.dart`

```dart
static const String baseUrl = 'https://matpro-production.up.railway.app/api';
```

---

## 🆘 Troubleshooting

### API not responding
```bash
# Check Railway logs
railway logs

# Common issues:
# - DATABASE_URL not set
# - Schema not initialized
# - Port conflict
```

### Database connection failed
```bash
# Verify DATABASE_URL is correct
railway variables

# Test direct connection
railway run psql -c "SELECT 1;"
```

### Authentication errors
```bash
# Verify JWT_SECRET is set
railway variables

# Check users table
railway run psql -c "SELECT id, phone, role FROM users;"
```

---

## 📞 Support

- **Railway Docs:** https://docs.railway.app
- **PostgreSQL Docs:** https://www.postgresql.org/docs/
- **API Reference:** See `API.md` in this repository

---

## ✅ Deployment Checklist

- [ ] Code pushed to GitHub
- [ ] Railway project created
- [ ] PostgreSQL database added
- [ ] Environment variables set
- [ ] Database schema initialized
- [ ] Seed data loaded
- [ ] Health check returns 200
- [ ] Login endpoint works
- [ ] Default PINs changed
- [ ] Production URL documented

---

**Estimated Time:** 5-10 minutes  
**Cost:** Free tier available (upgrade for production scale)  
**Status:** ✅ Ready to deploy
