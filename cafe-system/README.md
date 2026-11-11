# Cafe & Restaurant Order + Inventory Management System

A production-quality, tablet-first web application designed for cafes and restaurants in Ethiopia. It integrates live ordering from waiters' tablets to kitchen screens with real-time Socket.IO synchronization, atomic recipe-based stock deductions, and an **Automatic Preparation Wastage Management** engine (Section 13).

---

## 1. Key Capabilities & Architecture

- **Tablet-First UI**: High-contrast, large touch targets designed for mobile tablets and kitchen display touchscreens using React, Tailwind CSS, and Lucide icons.
- **Role-Based Access Control (RBAC)**:
  - `admin`: Full access to recipes, pricing, ingredients, staff accounts, dining tables, inventory adjustments, corrections, and business reports.
  - `waiter`: Table layout overview, order entry, cart management, item cancellation, order closing, and late-entry ordering.
  - `waiter (canManageInventory: true)`: Permission-gated access to inventory delivery receipts, waste logs, and physical stock counts.
  - `kitchen`: Full-screen live tickets with color-coded preparation timers (<10m green, 10–20m amber, >20m pulsing rose), one-tap status updates, and batch preparation trim logging.
- **Append-Only Stock Ledger**: Stock movements are recorded in an immutable `StockMovement` collection (`sale`, `sale_reversal`, `delivery`, `waste`, `count_adjustment`, `initial`, `correction`). Ledgers are never updated or deleted.
- **Section 13: Automatic Preparation Wastage Management**:
  - Configurable expected wastage per ingredient (e.g. Red Onion: 500g trim on 10kg reference = 5% wastage rate).
  - Orders automatically calculate gross raw stock deduction using:
    $$\text{Gross Quantity Required} = \frac{\text{Usable Quantity Required}}{1 - \text{Wastage Rate}}$$
  - Kitchen staff logs actual preparation wastage at the prep station.
  - Discrepancy reporting compares expected model wastage vs actual recorded wastage with variance alerts.
- **Section 14: Comprehensive Financial Reports & Analytics (Admin Only)**:
  - **10 Core KPI Cards**: Total Orders, Completed, Cancelled, Total Items Sold, Gross Revenue, Estimated Ingredient Costs, Prep Wastage Cost, Recorded Waste Cost, Gross Profit, and Net Profit/Loss.
  - **Weighted Average Costing (WAC)**: Automatically recalculates ingredient `costPerBaseUnit` on deliveries and snapshots cost on consumption.
  - **Operating Expenses**: Recording and tracking of utilities, rent, employee salaries, and overhead.
  - **Visual Charts**: Interactive SVG line charts, bar charts, doughnut category charts, and top-selling horizontal progress bars.
  - **CSV & PDF Export**: Instant export of sales, revenue, costings, P&L, and wastage tables to CSV, plus formatted print views.
  - **Dedicated Waiter Order Tracker**: Real-time "My Orders" screen with live elapsed timers, kitchen status progression, ready alerts, and one-tap order actions.
- **High Concurrency & Atomic Deductions**:
  - MongoDB transaction execution with automatic exponential retry backoff (`executeTransactionWithRetry`) to cleanly resolve transient write conflicts (`TransientTransactionError: WriteConflict`).
- **Ethiopian Context**:
  - Default currency: **Ethiopian Birr (ETB)**.
  - Daily order sequences and reporting grouped in **`Africa/Addis_Ababa`** timezone.
  - Centralized string dictionary in `client/src/locales/strings.js` ready for Amharic translation.

---

## 2. Tech Stack

- **Frontend**: React 18, Vite, React Router v7, Axios, Socket.IO Client, Tailwind CSS, Lucide React.
- **Backend**: Node.js (ESM), Express, Mongoose, Socket.IO, JSON Web Tokens (`jsonwebtoken`), `bcrypt`, `zod`, `helmet`, `cors`, `express-rate-limit`, `dotenv`.
- **Database**: MongoDB Atlas or Local Replica Set (supports multi-document ACID transactions).
- **Test Harness**: Node.js Native Test Runner (`node:test`, `node:assert/strict`), Supertest, `mongodb-memory-server` (with single-node replica set for ACID transaction testing).

---

## 3. Project Structure

```text
cafe-system/
├── client/
│   ├── public/
│   ├── src/
│   │   ├── api/            # Axios API clients with auth interceptors
│   │   ├── components/     # UI layouts, headers, modals, cart, table cards
│   │   ├── context/        # AuthContext and SocketContext (reconnect & toasts)
│   │   ├── locales/        # strings.js (centralized English strings)
│   │   ├── pages/
│   │   │   ├── admin/      # Dashboard, Menu, Ingredients, Tables, Users, Reports
│   │   │   ├── waiter/     # Tables grid, Touch menu browser, Order manager
│   │   │   ├── kitchen/    # Live Kitchen Board, Prep Wastage batch recorder
│   │   │   └── inventory/  # Deliveries, Waste log, Stock counts, Audit ledger
│   │   └── routes/         # ProtectedRoute and role-based route mapping
│   └── vite.config.js
├── server/
│   ├── src/
│   │   ├── config/         # MongoDB connection & env configuration
│   │   ├── controllers/    # Request validation with Zod schemas
│   │   ├── middleware/     # Auth, Roles, Inventory Permission, Error handling
│   │   ├── models/         # User, Table, Ingredient, MenuItem, Order, StockMovement
│   │   ├── routes/         # Express REST routes (/api/*)
│   │   ├── services/       # stockService, orderService, inventoryService, reportService
│   │   ├── sockets/        # Socket.IO rooms and real-time event broadcaster
│   │   ├── seed.js         # Initial database seed script
│   │   ├── app.js          # Express app configuration
│   │   └── server.js       # HTTP & Socket.IO server startup
│   └── test/               # Comprehensive automated test suites (Phase 1 to 6)
└── package.json            # Root workspace scripts
```

---

## 4. Default Credentials (Seeded)

| Role | Username | Password | Inventory Access | Description |
| :--- | :--- | :--- | :---: | :--- |
| **Administrator** | `admin` | `admin123` | Yes | Full system management, reports & corrections |
| **Waiter + Inventory** | `waiter_inv` | `waiter123` | Yes | Takes orders, logs deliveries, waste & stock counts |
| **Standard Waiter** | `waiter` | `waiter123` | No | Tables, ordering, status tracking, item cancellation |
| **Kitchen Staff** | `kitchen` | `kitchen123` | No | Kitchen display board & batch preparation trim logging |

---

## 5. Local Setup & Installation

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **MongoDB**: MongoDB Atlas connection URI or local MongoDB replica set (for local dev without Atlas, the embedded memory replica set auto-activates during testing).

### Step 1: Clone and Install Dependencies
From the repository root:
```bash
# Install root, server, and client dependencies
npm install
cd cafe-system/server && npm install
cd ../client && npm install
cd ../..
```

### Step 2: Environment Configuration
Create `cafe-system/server/.env` (or copy from `cafe-system/server/.env.example`):
```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/cafe_management?retryWrites=true&w=majority
JWT_SECRET=super-secret-jwt-key-change-in-production-min-32-chars
JWT_EXPIRES_IN=12h
TIMEZONE=Africa/Addis_Ababa
```

Create `cafe-system/client/.env`:
```env
VITE_API_URL=http://localhost:5000
```

### Step 3: Seed Database
Seed default users, dining tables, ingredients with Section 13 wastage configuration, opening stock ledger movements, and Ethiopian dishes with recipes:
```bash
npm run seed
```

### Step 4: Run Development Servers
Start both backend API (`http://localhost:5000`) and Vite frontend (`http://localhost:5173`) concurrently:
```bash
npm run dev
```

Visit **`http://localhost:5173`** in your browser or tablet. Use the **Quick Sign-In** buttons on the login page for rapid role switching.

---

## 6. Automated Testing

The suite uses the Node.js native test runner and `mongodb-memory-server` replica sets to test ACID transactions, write conflict retries, Socket.IO notifications, and Section 13 wastage calculations:

```bash
# Run all automated tests (37 tests across 6 phases)
npm test
```

### Test Coverage Highlights:
- **Phase 1**: Server health, bcrypt hashing, JWT issuance & 12h expiry, role/permission middleware.
- **Phase 2**: Menu & recipe management, ingredient CRUD, table states, user management.
- **Phase 3**: Atomic order stock deductions with gross wastage formulas, sale reversal on pending cancellations, waste tracking on prepared item cancellations, simultaneous orders on the same ingredient without race conditions.
- **Phase 4**: Socket.IO authentication, role rooms (`kitchen`, `waiter`, `admin`), `order:new`, `item:status-changed`, suppression of kitchen notifications on late-entry orders.
- **Phase 5**: Permission-gated deliveries, waste logging, physical inventory counts with variance tracking, admin-only ledger corrections, and paginated ledger history.
- **Phase 6**: Sales aggregations by day/week/month, top-selling dishes, ingredient usage, Section 13 expected vs actual wastage audit, and low-stock alerts.

---

## 7. Production Deployment Guide

### A. Database: MongoDB Atlas (Free Tier M0)
1. Create a free cluster on [MongoDB Atlas](https://www.mongodb.com/atlas).
2. Create a database user with read/write permissions.
3. Under **Network Access**, add `0.0.0.0/0` (allow access from anywhere) or restrict to your server's outbound IPs.
4. Copy your SRV connection string:
   ```text
   mongodb+srv://<user>:<password>@cluster0.xxxx.mongodb.net/cafe_management?retryWrites=true&w=majority
   ```
5. Run the seed script once against Atlas:
   ```bash
   cd cafe-system/server
   MONGODB_URI="<your-atlas-uri>" npm run seed
   ```

### B. Backend API: Render / Railway / Fly.io
Deploy `cafe-system/server` on a host supporting persistent WebSocket connections:

1. **Root Directory**: `cafe-system/server`
2. **Build Command**: `npm install`
3. **Start Command**: `npm start`
4. **Environment Variables**:
   - `NODE_ENV`: `production`
   - `PORT`: `5000` (or host provided `$PORT`)
   - `CLIENT_URL`: `https://your-cafe-frontend.vercel.app` (your frontend production domain)
   - `MONGODB_URI`: `<your-atlas-connection-string>`
   - `JWT_SECRET`: `<secure-random-32-char-string>`
   - `JWT_EXPIRES_IN`: `12h`
   - `TIMEZONE`: `Africa/Addis_Ababa`

### C. Frontend Client: Vercel / Netlify
Deploy `cafe-system/client` on Vercel or Netlify:

1. **Root Directory**: `cafe-system/client`
2. **Build Command**: `npm run build`
3. **Output Directory**: `dist`
4. **Environment Variables**:
   - `VITE_API_URL`: `https://your-cafe-api.onrender.com`
5. **SPA Rewrites**:
   - For **Vercel**, create `vercel.json` in `cafe-system/client`:
     ```json
     {
       "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
     }
     ```
   - For **Netlify**, create `public/_redirects`:
     ```text
     /*    /index.html   200
     ```

---

## 8. License & Acknowledgements
Built according to the Cafe & Restaurant Order + Inventory Management System specification and Section 13 Automatic Preparation Wastage guidelines.

