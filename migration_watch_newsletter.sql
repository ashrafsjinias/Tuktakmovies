-- Run this once in the D1 Console (Dashboard → D1 → tuktakmovies-db → Console)
-- to add "Where to Watch" and Newsletter support to an already-existing database.
-- (Skip this if you're setting up the database fresh — schema.sql already
-- includes these.)

ALTER TABLE posts ADD COLUMN watch_providers TEXT;
ALTER TABLE posts ADD COLUMN watch_link TEXT;

CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);
