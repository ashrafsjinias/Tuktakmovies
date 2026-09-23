-- TuktakMovies Database Schema
-- D1 SQLite-compatible schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  role TEXT DEFAULT 'user' CHECK(role IN ('user', 'moderator', 'admin')),
  is_active INTEGER DEFAULT 1,
  is_verified INTEGER DEFAULT 0,
  verification_token TEXT,
  reset_token TEXT,
  reset_token_expires INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  last_login INTEGER
);

-- User sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  ip_address TEXT,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Favorites / Watchlist
CREATE TABLE IF NOT EXISTS user_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  tmdb_id INTEGER NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'movie' CHECK(media_type IN ('movie', 'tv')),
  list_type TEXT NOT NULL CHECK(list_type IN ('favorite', 'watchlist', 'watched')),
  added_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, tmdb_id, media_type, list_type),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Movie reviews
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  tmdb_id INTEGER NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'movie' CHECK(media_type IN ('movie', 'tv')),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 10),
  title TEXT,
  body TEXT NOT NULL,
  contains_spoilers INTEGER DEFAULT 0,
  helpful_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'published' CHECK(status IN ('published', 'pending', 'rejected', 'deleted')),
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Review helpful votes
CREATE TABLE IF NOT EXISTS review_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  is_helpful INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(review_id, user_id),
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Comments on reviews
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'published' CHECK(status IN ('published', 'pending', 'deleted')),
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Movie cache metadata (to avoid repeated API calls)
CREATE TABLE IF NOT EXISTS movie_cache (
  tmdb_id INTEGER NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'movie',
  title TEXT,
  poster_path TEXT,
  backdrop_path TEXT,
  overview TEXT,
  release_date TEXT,
  vote_average REAL,
  genres TEXT, -- JSON array
  cached_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (tmdb_id, media_type)
);

-- Rate limiting table
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER DEFAULT 0,
  window_start INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Admin audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER,
  details TEXT, -- JSON
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (admin_id) REFERENCES users(id)
);

-- Site settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_lists_user ON user_lists(user_id, list_type);
CREATE INDEX IF NOT EXISTS idx_user_lists_movie ON user_lists(tmdb_id, media_type);
CREATE INDEX IF NOT EXISTS idx_reviews_movie ON reviews(tmdb_id, media_type, status);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id, status);
CREATE INDEX IF NOT EXISTS idx_comments_review ON comments(review_id, status);
CREATE INDEX IF NOT EXISTS idx_movie_cache_updated ON movie_cache(cached_at);

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('site_name', 'TuktakMovies'),
  ('site_tagline', 'Discover. Watch. Review.'),
  ('maintenance_mode', '0'),
  ('registration_enabled', '1'),
  ('reviews_require_approval', '0'),
  ('max_reviews_per_day', '10');
