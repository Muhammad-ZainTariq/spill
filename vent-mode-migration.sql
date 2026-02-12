-- Vent Mode / Disappearing Posts Feature Migration
-- Run this SQL in your Supabase SQL editor
-- This enables time-limited posts that disappear after 24 hours

-- 1. Add vent mode columns to posts table
ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS is_vent BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;

-- 2. Create index for faster queries on vent posts
CREATE INDEX IF NOT EXISTS idx_posts_is_vent ON posts(is_vent);
CREATE INDEX IF NOT EXISTS idx_posts_expires_at ON posts(expires_at);

-- 3. Add helpful comments
COMMENT ON COLUMN posts.is_vent IS 'Whether this is a vent mode post that will disappear after 24h';
COMMENT ON COLUMN posts.expires_at IS 'Timestamp when vent post expires (null for permanent posts)';

-- 4. Optional: Create a function to auto-delete expired vent posts
CREATE OR REPLACE FUNCTION delete_expired_vent_posts()
RETURNS void AS $$
BEGIN
  DELETE FROM posts 
  WHERE is_vent = true 
    AND expires_at IS NOT NULL 
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- 5. Optional: Schedule this function to run periodically (requires pg_cron extension)
-- SELECT cron.schedule('delete-expired-vents', '0 * * * *', 'SELECT delete_expired_vent_posts()');
-- Uncomment above line if you have pg_cron enabled (runs hourly)

-- Done! Your vent mode / disappearing posts feature is now ready.

