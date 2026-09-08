-- Run this once in the D1 Console (Dashboard → D1 → tuktakmovies-db → Console)
-- to add TV Shows + Industry (Bollywood/Hollywood/South) support to an
-- already-existing database. Run each line separately if the console only
-- accepts one statement at a time.

ALTER TABLE posts ADD COLUMN media_type TEXT DEFAULT 'movie';
ALTER TABLE posts ADD COLUMN industry TEXT;
ALTER TABLE posts ADD COLUMN original_language TEXT;

-- The old tmdb_id-only unique index would incorrectly block a TV show from
-- having the same numeric id as an unrelated movie, so we replace it with
-- a composite (tmdb_id, media_type) index instead.
DROP INDEX IF EXISTS idx_posts_tmdb_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_tmdb_media
  ON posts(tmdb_id, media_type)
  WHERE tmdb_id IS NOT NULL;
