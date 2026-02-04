# MatPro - Offline-First Inventory & Sales App

Construction materials inventory, sales, credit, and cash control app for Guinea.

## Features

- ✅ Offline-first architecture
- ✅ Multi-store management (Madina, Lambandji)
- ✅ Role-based access (Owner, Store Manager)
- ✅ Event-sourced inventory
- ✅ Sales (cash/partial/credit)
- ✅ Customer credit management
- ✅ Cash control & audit trails

## Tech Stack

- **Mobile:** Flutter (iOS + Android)
- **Backend:** Node.js + Express + PostgreSQL
- **Local Storage:** SQLite

## Quick Start

### 1. Database Setup

```bash
# Create database
createdb matpro

# Run schema
psql matpro < schema.sql
```

### 2. Backend Setup

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env and set DATABASE_URL
# DATABASE_URL=postgresql://localhost:5432/matpro

# Start server
npm start
```

API will run on http://localhost:3000

### 3. Test API

```bash
# Health check
curl http://localhost:3000/health

# Login (default PIN: 123456)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+224620000001","pin":"123456"}'

# Get products (use token from login)
curl http://localhost:3000/api/products \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Default Users

| Role | Phone | PIN | Store |
|------|-------|-----|-------|
| Owner | +224620000001 | 123456 | All stores |
| Manager (Madina) | +224620000002 | 123456 | Madina only |
| Manager (Lambandji) | +224620000003 | 123456 | Lambandji only |

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with phone + PIN
- `GET /api/auth/me` - Get current user

### Products
- `GET /api/products` - List all products
- `GET /api/products/:id` - Get single product
- `POST /api/products` - Create product (owner only)
- `PATCH /api/products/:id` - Update product (owner only)

## Project Structure

```
matpro/
├── schema.sql              # Database schema
├── src/
│   ├── index.js           # Express server
│   ├── config/
│   │   └── database.js    # PostgreSQL connection
│   ├── middleware/
│   │   └── auth.js        # JWT auth + RBAC
│   └── routes/
│       ├── auth.js        # Authentication routes
│       └── products.js    # Product routes
└── README.md
```

## Next Steps

1. ✅ Database schema created
2. ✅ Authentication working
3. ✅ Products API working
4. 🚧 Sales API (in progress)
5. 🚧 Inventory API (in progress)
6. 🚧 Flutter mobile app (in progress)

## License

MIT
