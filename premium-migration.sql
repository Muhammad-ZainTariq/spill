-- Premium Membership Migration
-- Run this SQL in your Supabase SQL editor
-- This enables premium membership features

-- 1. Add premium columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS premium_activated_at TIMESTAMP;

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMP;

-- 2. Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_is_premium ON profiles(is_premium);

-- 3. Add helpful comments
COMMENT ON COLUMN profiles.is_premium IS 'Whether user has active premium membership';
COMMENT ON COLUMN profiles.premium_activated_at IS 'When user first activated premium';
COMMENT ON COLUMN profiles.premium_expires_at IS 'Premium expiration date (nullable for lifetime premium)';

-- Done! Your premium membership feature is now ready to use.

