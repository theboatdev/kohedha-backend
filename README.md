# Kohedha Backend

REST API for the Kohedha platform — a venue management system for restaurants and hospitality businesses. Vendors manage menus, tables, booking slots, events, and deals through a web dashboard. A separate mobile API serves the consumer app, and public endpoints handle customer bookings and waitlist sign-ups.

Built with **Node.js**, **Express 5**, and **MongoDB** (Mongoose).

## Features

- **Vendor authentication** — email/password registration and login, Google OAuth, JWT cookies
- **Venue management** — profile, venue details, floor plan (sections and tables)
- **Menus** — CRUD, image uploads (Cloudinary), CSV import, PDF upload with AI extraction (Google Gemini)
- **Booking Slots** — recurring slots, reservations, public booking links via token
- **Events & Deals** — vendor-managed content with image uploads
- **Dashboard** — reservation and venue analytics
- **Mobile API** — Firebase-authenticated endpoints for events, deals, menus, venues, and booking
- **Waitlist** — public sign-up endpoint

## Prerequisites

- Node.js 18+
- MongoDB instance (local or Atlas)
- Accounts/credentials for optional integrations:
  - [Cloudinary](https://cloudinary.com/) — image uploads
  - [Google Cloud Console](https://console.cloud.google.com/) — OAuth and Gemini API
  - [Firebase](https://firebase.google.com/) — mobile app authentication

## Getting started

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Configure environment variables

Create a `.env` file in the `backend` directory:

```env
# Server
PORT=5002
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Database
MONGO_URI=mongodb://localhost:27017/kohedha

# JWT
JWT_SECRET=your_jwt_secret
JWT_EXPIRE=7d
COOKIE_EXPIRE=7

# Google OAuth (vendor login)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:5002/api/vendor/auth/google/callback

# Cloudinary (menu, event, and deal images)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Google Gemini (PDF menu extraction)
GEMINI_API_KEY=

# Firebase Admin (mobile API auth)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

> **Note:** `FIREBASE_PRIVATE_KEY` must keep literal `\n` characters for line breaks when stored in `.env`.

### 3. Run the server

```bash
# Production
npm start

# Development (auto-reload)
npm run dev
```

The server starts on `PORT` (default **5002**). Static uploads are served at `/uploads`.

## Project structure

```
backend/
├── app.js                 # Express app entry point
├── config/                # Database, Passport, Cloudinary
├── controller/            # Route handlers
├── middleware/            # Auth, Firebase, file uploads
├── models/                # Mongoose schemas
├── routes/                # API route definitions
├── utils/                 # JWT, validation, CSV/PDF helpers
```

## API overview

All routes are prefixed as shown below. Vendor routes use JWT auth via cookie (`token`) or `Authorization: Bearer <token>`. Mobile routes require a Firebase ID token in the `Authorization` header.

| Prefix | Description | Auth |
|--------|-------------|------|
| `/api/vendor` | Registration, login, profile, venue details | JWT |
| `/api/vendor/auth` | Google OAuth flow | — |
| `/api/vendor/tables` | Table CRUD and floor plan positions | JWT |
| `/api/vendor/sections` | Venue section management | JWT |
| `/api/vendor/menu` | Menu items, CSV/PDF import | JWT |
| `/api/vendor/booking-slot` | Booking slots and reservations | JWT |
| `/api/vendor/events` | Event management | JWT |
| `/api/vendor/deals` | Deal management | JWT |
| `/api/vendor/dashboard` | Analytics | JWT |
| `/api/public/booking` | Customer booking via public token | — |
| `/api/public/wait-list` | Waitlist sign-up | — |
| `/api/mobile` | Mobile app (events, deals, menus, venues, booking) | Firebase |

## Authentication

| Client | Method | Details |
|--------|--------|---------|
| Vendor dashboard | JWT | Set via httpOnly cookie on login, or send as Bearer token |
| Vendor dashboard | Google OAuth | `GET /api/vendor/auth/google` |
| Mobile app | Firebase | `Authorization: Bearer <idToken>` on all `/api/mobile/*` routes |

Vendor middleware:

- `authenticate` — valid JWT, registration may be incomplete
- `protect` — valid JWT and completed vendor profile

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the server |
| `npm run dev` | Start with nodemon (hot reload) |
| `npm test` | Not configured yet |

## CORS

Cross-origin requests are allowed from `FRONTEND_URL` (default `http://localhost:3000`) with credentials enabled for cookie-based auth.
