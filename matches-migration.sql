-- Migration for Matches and AI Therapy Prompts features
-- Run this in your Supabase SQL editor

-- 1. Add columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS available_for_matches BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS match_struggles TEXT[] DEFAULT '{}';

-- 2. Match Requests table (requests sent between users)
-- Drop table if it exists with wrong structure
DROP TABLE IF EXISTS match_requests CASCADE;

CREATE TABLE match_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (sender_id != receiver_id)
);

-- Add unique constraint separately to prevent duplicate pending requests
CREATE UNIQUE INDEX IF NOT EXISTS idx_match_requests_unique_pending 
ON match_requests(sender_id, receiver_id) 
WHERE status = 'pending';

-- 3. Anonymous Matches table (active matches between users)
-- Drop table if it exists with wrong structure
DROP TABLE IF EXISTS anonymous_matches CASCADE;

CREATE TABLE anonymous_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'expired')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (user1_id != user2_id)
);

-- 4. Match Messages table (messages in anonymous matches)
-- Drop table if it exists with wrong structure
DROP TABLE IF EXISTS match_messages CASCADE;

CREATE TABLE match_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES anonymous_matches(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE match_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE anonymous_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for match_requests
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own match requests" ON match_requests;
DROP POLICY IF EXISTS "Users can create match requests" ON match_requests;
DROP POLICY IF EXISTS "Users can update received match requests" ON match_requests;

-- Users can see requests they sent or received
CREATE POLICY "Users can view own match requests"
  ON match_requests FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Users can send requests
CREATE POLICY "Users can create match requests"
  ON match_requests FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- Users can update requests they received (accept/decline)
CREATE POLICY "Users can update received match requests"
  ON match_requests FOR UPDATE
  USING (auth.uid() = receiver_id);

-- RLS Policies for anonymous_matches
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own matches" ON anonymous_matches;
DROP POLICY IF EXISTS "Users can create matches" ON anonymous_matches;
DROP POLICY IF EXISTS "Users can update own matches" ON anonymous_matches;

-- Users can see matches they're part of
CREATE POLICY "Users can view own matches"
  ON anonymous_matches FOR SELECT
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Users can create matches (when accepting a request)
CREATE POLICY "Users can create matches"
  ON anonymous_matches FOR INSERT
  WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Users can update matches they're part of
CREATE POLICY "Users can update own matches"
  ON anonymous_matches FOR UPDATE
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- RLS Policies for match_messages
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view match messages" ON match_messages;
DROP POLICY IF EXISTS "Users can send match messages" ON match_messages;

-- Users can see messages in matches they're part of
CREATE POLICY "Users can view match messages"
  ON match_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM anonymous_matches
      WHERE anonymous_matches.id = match_messages.match_id
      AND (anonymous_matches.user1_id = auth.uid() OR anonymous_matches.user2_id = auth.uid())
    )
  );

-- Users can send messages in matches they're part of
CREATE POLICY "Users can send match messages"
  ON match_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM anonymous_matches
      WHERE anonymous_matches.id = match_messages.match_id
      AND (anonymous_matches.user1_id = auth.uid() OR anonymous_matches.user2_id = auth.uid())
      AND anonymous_matches.status = 'active'
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_match_requests_sender ON match_requests(sender_id);
CREATE INDEX IF NOT EXISTS idx_match_requests_receiver ON match_requests(receiver_id);
CREATE INDEX IF NOT EXISTS idx_match_requests_status ON match_requests(status);
CREATE INDEX IF NOT EXISTS idx_anonymous_matches_user1 ON anonymous_matches(user1_id);
CREATE INDEX IF NOT EXISTS idx_anonymous_matches_user2 ON anonymous_matches(user2_id);
CREATE INDEX IF NOT EXISTS idx_anonymous_matches_status ON anonymous_matches(status);
CREATE INDEX IF NOT EXISTS idx_match_messages_match_id ON match_messages(match_id);
CREATE INDEX IF NOT EXISTS idx_match_messages_created_at ON match_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_profiles_available_for_matches ON profiles(available_for_matches);
