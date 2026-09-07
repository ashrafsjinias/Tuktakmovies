-- Run this once in the D1 Console (Dashboard → D1 → tuktakmovies-db → Console)
-- to add TMDB-import support to an already-existing posts table.
-- (If you're setting up the database for the very first time, schema.sql
-- already includes this column — you don't need this file.)

ALTER TABLE posts ADD COLUMN tmdb_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_tmdb_id
  ON posts(tmdb_id)
  WHERE tmdb_id IS NOT NULL;
