# SynScript

**SynScript** is a real-time collaborative cloud IDE and code editor featuring multi-file workspaces, live Monaco editor synchronization, room-based isolation, team chat, snapshot version control, and multi-language code execution.

---

## Architecture Overview

```
                          ┌──────────────────────────┐
                          │   Browser (Client UI)    │
                          │ React + TanStack + Monaco│
                          └─────────────┬────────────┘
                                        │
                         HTTP REST      │  Socket.io (WebSockets)
                        (Port 5000)     │  (Port 5000)
                                        ▼
                          ┌──────────────────────────┐
                          │     SynScript Backend    │
                          │   Express + Socket.io    │
                          └─────────────┬────────────┘
                                        │
                ┌───────────────────────┴───────────────────────┐
                ▼                                               ▼
     ┌───────────────────────┐                     ┌────────────────────────┐
     │     MongoDB Atlas     │                     │ Docker Execution Engine│
     │  (Rooms, Files, Users,│                     │  (Multi-language Run,  │
     │     Chat, History)    │                     │   Future Terminal PTY) │
     └───────────────────────┘                     └────────────────────────┘
```

---

## Quick Start (Docker Compose)

### 1. Prerequisites
- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/)
- External MongoDB connection URI (e.g. MongoDB Atlas)

### 2. Configure Environment
Copy `.env.example` to `backend/.env`:
```bash
cp backend/.env.example backend/.env
```
Fill in your `MONGO_URI`, `JWT_SECRET`, and optional OAuth/SMTP keys.

### 3. Launch with Docker Compose
```bash
docker compose up --build
```
- **Frontend App**: `http://localhost:5173`
- **Backend API & WebSockets**: `http://localhost:5000`
- **Health Endpoint**: `http://localhost:5000/api/health`

To stop the containers:
```bash
docker compose down
```

---

## Local Development Setup

### 1. Backend Setup
```bash
cd backend
npm install
cp .env.example .env
npm run dev
```
Backend runs on `http://localhost:5000`.

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Frontend development server starts on `http://localhost:5173`.

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Description | Default / Example |
|---|---|---|
| `PORT` | Backend HTTP & Socket.io port | `5000` |
| `NODE_ENV` | Application environment (`development` / `production`) | `production` |
| `MONGO_URI` | MongoDB Atlas / database connection string | `mongodb+srv://...` |
| `JWT_SECRET` | Secret key for signing authentication tokens | `your_jwt_secret` |
| `FRONTEND_URL` | Allowed CORS origin for frontend client | `http://localhost:5173` |
| `BACKEND_URL` | Self reference URL | `http://localhost:5000` |
| `LOG_LEVEL` | Logging verbosity (`debug`, `info`, `warn`, `error`) | `info` |
| `SMTP_HOST` | SMTP server host for invitation emails | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username / email address | `user@gmail.com` |
| `SMTP_PASS` | SMTP app password | `app_password` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | `client_id.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | `secret` |
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID | `github_id` |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret | `github_secret` |

### Frontend (`frontend/.env`)

| Variable | Description | Default |
|---|---|---|
| `VITE_API_URL` | Backend REST API endpoint | `http://localhost:5000` |
| `VITE_SOCKET_URL` | Backend WebSocket / Socket.io server | `http://localhost:5000` |

---

## Health Monitoring

The backend exposes a health endpoint:

```http
GET /api/health
```

**Response Format**:
```json
{
  "status": "ok",
  "database": "connected",
  "uptime": "142.50s",
  "environment": "production"
}
```

---

## Build Commands

### Frontend
- `npm run build`: Compiles production assets with Vite / Nitro SSR
- `npm run preview`: Serves the production build locally
- `npm run dev`: Starts Vite development server

### Backend
- `npm start`: Starts production server (`node src/server.js`)
- `npm run dev`: Starts server with `nodemon` for auto-reloading

---

## Future Terminal Architecture

SynScript is built with an architectural foundation prepared for containerized terminal sessions:

```
Browser (xterm.js)
    ↓ Socket.io ('terminal-input' / 'terminal-resize')
Backend Terminal Workspace Service (backend/src/services/terminalWorkspaceService.js)
    ↓ PTY Stream
Docker Workspace Container (/bin/sh)
```
