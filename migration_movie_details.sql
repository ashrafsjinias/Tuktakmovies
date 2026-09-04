-- Run this once in the D1 Console (Dashboard → D1 → tuktakmovies-db → Console)
-- to add richer Movie Details support to an already-existing posts table.
-- (Skip this if you're setting up the database fresh — schema.sql already
-- includes these columns.)

ALTER TABLE posts ADD COLUMN genres TEXT;
ALTER TABLE posts ADD COLUMN runtime INTEGER;
ALTER TABLE posts ADD COLUMN tagline TEXT;
ALTER TABLE posts ADD COLUMN backdrop TEXT;
ALTER TABLE posts ADD COLUMN trailer_key TEXT;
ALTER TABLE posts ADD COLUMN cast_names TEXT;
