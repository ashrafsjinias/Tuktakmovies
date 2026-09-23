# TuktakMovies – Production Deployment Guide

## Stack
- **Runtime**: Cloudflare Workers (V8 isolates)
- **Database**: Cloudflare D1 (SQLite)
- **Cache**: Cloudflare KV
- **Media**: Cloudflare R2
- **Movie Data**: TMDB API v3
- **Domain**: tuktakmovies.online

---

## Prerequisites

1. [Cloudflare account](https://dash.cloudflare.com/sign-up)
2. Domain `tuktakmovies.online` added to Cloudflare
3. Node.js 18+ installed locally
4. [TMDB API key](https://www.themoviedb.org/settings/api) (free)

---

## Step 1: Install Wrangler

```bash
npm install -g wrangler
wrangler login
```

---

## Step 2: Create Cloudflare Resources

```bash
# Create D1 database
wrangler d1 create tuktakmovies-db
# → Copy the database_id into wrangler.toml

# Create KV namespace
wrangler kv:namespace create CACHE
# → Copy the id into wrangler.toml

# Create R2 bucket
wrangler r2 bucket create tuktakmovies-media
```

Update `wrangler.toml` with the IDs from the commands above.

---

## Step 3: Set Secrets

```bash
# REQUIRED: TMDB API key
wrangler secret put TMDB_API_KEY
# → Enter your key from https://www.themoviedb.org/settings/api

# REQUIRED: JWT secret (any long random string)
wrangler secret put JWT_SECRET
# → Generate: openssl rand -hex 32

# REQUIRED: Set your admin credentials
wrangler secret put ADMIN_EMAIL
# → Enter the email you'll use for the admin account
```

---

## Step 4: Run Database Migration

```bash
# Local dev
wrangler d1 execute tuktakmovies-db --file=migrations/001_initial.sql

# Production
wrangler d1 execute tuktakmovies-db --env production --file=migrations/001_initial.sql
```

---

## Step 5: Create Admin Account

After deploying, register a normal account at `/register`, then promote it via D1 console:

```sql
-- Run in Cloudflare Dashboard → D1 → tuktakmovies-db → Console
UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
```

Or via Wrangler:
```bash
wrangler d1 execute tuktakmovies-db --env production \
  --command "UPDATE users SET role='admin' WHERE email='your@email.com';"
```

---

## Step 6: Deploy

```bash
# Install deps
npm install

# Deploy to production
npm run deploy:prod

# Or for preview/testing
npm run dev
```

---

## Step 7: Configure DNS

In Cloudflare Dashboard:
1. Go to your domain → DNS
2. Add a CNAME: `tuktakmovies.online` → `tuktakmovies-production.workers.dev`
3. Set Proxy status: Proxied (orange cloud)

Or set a Worker Route:
- Dashboard → Workers & Pages → tuktakmovies → Settings → Triggers
- Add route: `tuktakmovies.online/*` → Zone: tuktakmovies.online

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `TMDB_API_KEY` | ✅ | TMDB API v3 key (free) |
| `JWT_SECRET` | ✅ | Random 32+ char secret for sessions |
| `ADMIN_EMAIL` | ✅ | Email for first admin account |
| `SITE_URL` | Set in wrangler.toml | `https://tuktakmovies.online` |

---

## File Structure

```
tuktakmovies/
├── src/
│   ├── worker.js          # Main entry point / router
│   ├── api/
│   │   ├── auth.js        # Auth API routes
│   │   ├── reviews.js     # Reviews API
│   │   ├── lists.js       # Watchlist/Favorites API
│   │   └── admin.js       # Admin API
│   ├── pages/
│   │   ├── home.js        # Home page
│   │   ├── movie-detail.js # Movie/TV detail page
│   │   ├── browse.js      # Browse, search, genre pages
│   │   ├── user.js        # Auth, profile, list pages
│   │   └── admin.js       # Admin panel page
│   └── utils/
│       ├── auth.js        # JWT, sessions, password hashing
│       ├── tmdb.js        # TMDB API client + caching
│       ├── helpers.js     # Rate limiting, validation, SEO
│       └── layout.js      # HTML layout, components
├── public/
│   ├── css/main.css       # Complete stylesheet
│   ├── js/main.js         # Client-side JavaScript
│   └── images/            # SVG icons and placeholders
├── migrations/
│   └── 001_initial.sql    # D1 database schema
├── wrangler.toml          # Cloudflare config
└── package.json
```

---

## Features Included

### Movie Discovery
- ✅ Trending (daily/weekly) with hero banner
- ✅ Popular, Now Playing, Upcoming, Top Rated
- ✅ Movie & TV detail pages with full metadata
- ✅ Cast & crew with person detail pages
- ✅ Trailers via YouTube embed
- ✅ Browse by genre with sorting
- ✅ Search with live autocomplete

### User System
- ✅ Registration & login (secure password hashing)
- ✅ Session-based auth (HttpOnly cookies)
- ✅ Watchlist, Favorites, Watched lists
- ✅ Write & edit reviews (1-10 rating)
- ✅ Helpful votes on reviews
- ✅ Profile page with stats

### Admin Panel
- ✅ Dashboard with site stats
- ✅ User management (roles, deactivation)
- ✅ Review moderation (approve/reject/delete)
- ✅ Site settings (maintenance mode, registration, etc.)
- ✅ Audit log

### SEO
- ✅ Dynamic meta tags per page
- ✅ Open Graph + Twitter Cards
- ✅ Structured data (Schema.org Movie, TVSeries)
- ✅ Canonical URLs
- ✅ sitemap.xml (auto-generated with cached movies)
- ✅ robots.txt
- ✅ Clean URLs

### Performance & Security
- ✅ KV caching for TMDB API responses (1 hour)
- ✅ D1 movie metadata cache
- ✅ Cloudflare edge caching headers
- ✅ Rate limiting (login, register, reviews)
- ✅ Input validation & sanitization
- ✅ CSRF protection via SameSite cookies
- ✅ Security headers (X-Frame-Options, CSP, etc.)
- ✅ SQL injection prevention (parameterized queries)

---

## Local Development

```bash
npm install
npm run dev
# → http://localhost:8787

# With a local D1:
wrangler d1 execute tuktakmovies-db --local --file=migrations/001_initial.sql
```

---

## TMDB Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB.
- API docs: https://developer.themoviedb.org/docs
- Free tier: 40 requests/second, no commercial restriction
- Requirement: Display TMDB logo on pages using their data
