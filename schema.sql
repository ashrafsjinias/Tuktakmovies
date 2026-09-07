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
  media_type TEXT DEFAULT 'movie',
  industry TEXT,
  original_language TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_type ON posts(type);
-- Movie IDs and TV show IDs are separate number spaces on TMDB, so the
-- same numeric id could legitimately belong to a movie AND a show —
-- the unique index covers (tmdb_id, media_type) together, not tmdb_id alone.
CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_tmdb_media
  ON posts(tmdb_id, media_type)
  WHERE tmdb_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);
