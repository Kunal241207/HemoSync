# HemoSync — Blood Inventory & Coordination Platform

> Full-stack blood inventory, hospital-to-blood-bank coordination, and demand forecasting platform.

The local app uses a real registration flow: create an account first, then sign in with those credentials. No sample login profiles are required.

---

## 1. System Architecture

HemoSync is designed as a modular monolith adhering to healthcare compliance and operational requirements:

- **Frontend**: Single-Page Application (SPA) using React 18, Vite, React Router, plain CSS design system, and Recharts. Connects to backend REST APIs using the native Fetch API with secure cookie handling.
- **Backend**: Node.js + Express.js modular monolith using ES modules (`"type": "module"`), layered architecture (`routes` → `controllers` → `services` → `database`), centralized error handling, and Zod input validation.
- **Data Persistence**: PostgreSQL via Prisma ORM as the authoritative source of truth. All allocations, reservations, and inventory transitions enforce transactional integrity to prevent double-allocation or race conditions.
- **Deterministic Clinical Rules**: ABO/Rh and blood component compatibility rules are hardcoded and versioned deterministically. Generative AI is strictly separated from clinical decisions.
- **AI Intelligence**: Statistical time-series forecasting (moving average, exponentially weighted moving average, seasonal naive), shortage projection, and constrained redistribution recommendations implemented as JavaScript services without Python or external ML dependencies.

---

## 2. Monorepo Folder Structure

```text
homosync/
├── package.json               # Root monorepo workspace scripts
├── .gitignore                 # Monorepo git ignore rules
├── README.md                  # System architecture and macOS setup guide
├── server/                    # Express backend service
│   ├── package.json           # Backend dependencies and scripts
│   ├── .env.example           # Environment template
│   ├── .env                   # Local backend configuration
│   ├── prisma/
│   │   ├── schema.prisma      # PostgreSQL Prisma schema
│   │   └── seed.js            # Database seeding script
│   ├── src/
│   │   ├── app.js             # Express application & middleware setup
│   │   ├── server.js          # HTTP server bootstrap & graceful shutdown
│   │   ├── config/            # Env configuration & Prisma client instance
│   │   ├── routes/            # REST API route declarations
│   │   ├── controllers/       # HTTP request handlers
│   │   ├── services/          # Core business logic & database interactions
│   │   ├── middleware/        # CORS, error handling, logging, auth, RBAC
│   │   ├── validators/        # Zod input validation schemas
│   │   └── utils/             # Helpers, logger, standardized response utils
│   └── tests/
│       ├── auth.test.js       # Authentication and RBAC tests
├── matching.test.js   # Compatibility and allocation tests
└── e2e.test.js        # End-to-end clinical logistics scenarios
└── client/                    # React + Vite frontend application
    ├── package.json           # Frontend dependencies and scripts
    ├── vite.config.js         # Vite configuration with API proxy
    ├── index.html             # Application HTML entry point
    ├── .env.example           # Frontend environment template
    ├── .env                   # Local frontend configuration
    └── src/
        ├── main.jsx           # React DOM root render
        ├── App.jsx            # Application shell & React Router routes
        ├── index.css          # Healthcare operational design system (plain CSS)
        ├── context/           # AuthContext & global state
        ├── services/          # Shared Fetch API client
        ├── components/        # Reusable UI components (Header, Sidebar, Badges)
        └── pages/             # Dashboard and views (Overview, HealthCheck, Login)
```

---

## 3. macOS Setup Instructions

Follow these instructions to set up and run HemoSync locally on macOS.

### Prerequisites
- macOS (Apple Silicon or Intel)
- Node.js (v20+ recommended) and `npm`
- Homebrew (`brew`)

### Step 1: Install and Start PostgreSQL

If PostgreSQL is not yet installed on your macOS machine, install it via Homebrew:

```bash
# 1. Install PostgreSQL 16
brew install postgresql@16

# 2. Add PostgreSQL binary to your PATH (if keg-only)
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# 3. Start the PostgreSQL background service
brew services start postgresql@16

# 4. Create the HemoSync database
createdb hemosync_db
```

Verify that PostgreSQL is running:
```bash
pg_isready
```

### Step 2: Configure Environment Variables

The project comes with pre-configured `.env` files. Verify them or customize if needed:

- **Server configuration** (`server/.env`):
  ```env
  PORT=5001
  NODE_ENV=development
  DATABASE_URL="postgresql://postgres:postgres@localhost:5432/hemosync_db?schema=public"
  FRONTEND_URL="http://localhost:5173"
  JWT_SECRET="hemosync_jwt_dev_secret_replace_in_production_min_32_chars"
  JWT_EXPIRES_IN="15m"
  REFRESH_TOKEN_SECRET="hemosync_refresh_token_dev_secret_replace_in_production"
  REFRESH_TOKEN_EXPIRES_IN="7d"
  ```

- **Client configuration** (`client/.env`):
  ```env
  VITE_API_BASE_URL=http://localhost:5001/api
  ```

### Step 3: Install Dependencies

From the repository root, install dependencies for both `server` and `client`:

```bash
# Install backend dependencies
cd server
npm install

# Generate Prisma client
npm run prisma:generate

# Install frontend dependencies
cd ../client
npm install
cd ..
```

### Step 4: Run Database Migrations and Seeding

```bash
cd server
npm run prisma:migrate
npm run prisma:seed
cd ..
```

To rebuild the local database from scratch and reseed it:

```bash
cd server
npx prisma migrate reset --force
npm run prisma:seed
```

### Step 5: Start Development Servers

Run backend and frontend servers in separate terminals:

**Terminal 1 — Backend API:**
```bash
cd server
npm run dev
# Starts backend at http://localhost:5001
```

**Terminal 2 — Frontend App:**
```bash
cd client
npm run dev
# Starts Vite dev server at http://localhost:5173
```

---

## 4. Verification and Health Checks

### Backend Health API
Test the health endpoint directly via `curl`:
```bash
curl -s http://localhost:5001/api/health | jq
```
Expected response:
```json
{
  "success": true,
  "message": "HemoSync API is healthy",
  "data": {
    "status": "healthy",
    "service": "HemoSync Backend API",
    "version": "1.0.0",
    "environment": "development",
    "timestamp": "2026-10-27T...",
    "uptimeSeconds": 12,
    "database": {
      "provider": "postgresql",
      "connected": true,
      "latencyMs": 2,
      "error": null
    },
    "system": {
      "nodeVersion": "v26.8.1",
      "memoryUsageMb": 38
    }
  }
}
```

### Automated Backend Tests
Run the Vitest test suite:
```bash
npm --prefix server run test
```

### Frontend Verification
Open your browser to [http://localhost:5173](http://localhost:5173), register a local account, and sign in. Developer diagnostics remain restricted to authorized developer accounts.
