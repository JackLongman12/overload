-- Chunked sync: one row per user per chunk (core settings/routines, and workouts per quarter)
CREATE TABLE IF NOT EXISTS chunks (user_id TEXT NOT NULL, name TEXT NOT NULL, rev INTEGER NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (user_id, name));
INSERT OR IGNORE INTO chunks (user_id, name, rev, data, updated) SELECT user_id, 'core', rev, data, updated FROM blobs;
ALTER TABLE snapshots ADD COLUMN name TEXT NOT NULL DEFAULT 'core';
-- Key wrapping: a random master key encrypts data; it's stored wrapped by the password key and by the recovery key
ALTER TABLE users ADD COLUMN wrapped_pw TEXT;
ALTER TABLE users ADD COLUMN wrapped_rec TEXT;
ALTER TABLE users ADD COLUMN rec_hash TEXT;
ALTER TABLE users ADD COLUMN rec_salt TEXT;
