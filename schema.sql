-- Run once after creating the D1 database:
--   npx wrangler d1 execute tuktakmovies-db --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('featured','review','movie','article','trending')),
  title TEXT NOT NULL,
  excerpt TEXT,
  image TEXT,
  score REAL,
  rating REAL,
  year INTEGER,
  post_date TEXT,
  comments INTEGER DEFAULT 0,
  link TEXT,
  tmdb_id INTEGER,
  genres TEXT,
  runtime INTEGER,
  tagline TEXT,
  backdrop TEXT,
  trailer_key TEXT,
  cast_names TEXT,
  watch_providers TEXT,
  watch_link TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_type ON posts(type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_tmdb_id
  ON posts(tmdb_id)
  WHERE tmdb_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);
