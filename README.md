# HemoSync

Blood bank inventory and allocation system.

## About

Blood expires in about 35-42 days, and banks often run short of one type while throwing away expired units of another. HemoSync tracks blood stock across banks and gives units to hospital requests oldest-expiry-first.

It uses PostgreSQL row locking, so the same unit is never given to two hospitals at once. If a bank runs out, it finds a nearby bank with stock.

HemoSync is designed around one practical goal: move usable blood to the hospitals that need it before it expires.

## Users

- **Bank staff:** add and manage blood units
- **Hospitals:** submit blood requests
- **Admin:** monitor stock across the network

## Features

- Blood unit inventory across multiple banks
- Hospital requests with routine, urgent and emergency levels
- Oldest-expiry-first allocation using `FOR UPDATE SKIP LOCKED`
- Database-level protection against double allocation
- Nearest-bank stock lookup when a bank runs short
- Expiry alerts for units close to expiring
- Audit trail for every allocation
- Auto-refreshing dashboard
- Simple demand forecast (sample data, for illustration only)

## Tech Stack

- **Web:** React, Vite, JavaScript
- **API:** Express, JavaScript
- **Data:** PostgreSQL with transactional row locking
- **Other:** Docker Compose

## Getting Started

Requires Node.js 18+ and Docker.

```bash
# 1. Configure and start the database
cp backend/.env.example backend/.env
docker compose up -d

# 2. Start the API (http://localhost:4000)
cd backend
npm install
npm run dev

# 3. Start the web app in a second terminal (http://localhost:5173)
cd frontend
npm install
npm run dev
```

PostgreSQL loads `db/schema.sql` automatically when the database is initialized with an empty data volume. To reset the database, run `docker compose down -v`, then start it again with `docker compose up -d`.

## How It Works

1. Banks record available blood units and their expiry dates.
2. Hospitals submit requests with a blood type and urgency level.
3. The API allocates the oldest viable units first inside a PostgreSQL transaction.
4. When local stock is unavailable, HemoSync looks for stock at a nearby bank.
5. The dashboard refreshes inventory and expiry alerts automatically.

## Project Layout

```text
backend/     Express API, services, PostgreSQL access
frontend/    React dashboard and Vite configuration
db/          PostgreSQL schema and seed script
loadtest/    Concurrency test scripts and results
docs/        Project documentation
```
