# Backend & Development Tooling

This directory contains the development servers, build scripts, and local automation utilities for the ICPC Preparation program.

## Files & Utilities

### 1. `server.js` (Node.js Static Dev Server)
Zero-dependency HTTP server built with Node's native `http` module. Supports instant reloading, correct MIME types, and seamless fallback routing to `frontend/index.html`.
```bash
# Start server on default port 8085
node backend/server.js

# Or specify a custom port
PORT=3000 node backend/server.js
```

### 2. `server.py` (Python 3 Dev Server)
Python 3 standard library development server fallback:
```bash
python3 backend/server.py
# Or with custom port
python3 backend/server.py 8080
```

### 3. `stamp.js` (Asset Cache Buster)
Computes a SHA-1 content hash for every script and stylesheet referenced in `frontend/index.html` and appends `?v=<hash>` query parameters. This ensures browsers always load fresh assets upon deployment without aggressive caching issues.
```bash
# Update asset stamps in frontend/index.html
node backend/stamp.js

# Check if any asset stamps are stale (CI validation)
node backend/stamp.js --check
```

## Backend Services Architecture

The application adopts a **Serverless / BaaS (Backend-as-a-Service)** architecture powered by **Supabase**:
- **Authentication**: Managed via Supabase Auth (Email OTP / Passwordless sign-in).
- **Cloud Database**: Managed PostgreSQL with Row-Level Security (RLS) policies.
- **Data Sync**: Client modules in `frontend/account.js` synchronize user solve progress, weekly targets, custom tasks, and routines in real-time.
- **Schema & Migrations**: Defined in `database/supabase-schema.sql`.
