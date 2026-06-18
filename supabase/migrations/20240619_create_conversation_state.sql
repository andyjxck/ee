-- Create table for Discord command conversation state
CREATE TABLE IF NOT EXISTS ms_discord_conversation_state (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  discord_user_id TEXT NOT NULL UNIQUE,
  command TEXT NOT NULL,
  step TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversation_state_user_id ON ms_discord_conversation_state(discord_user_id);

-- Create index for cleanup of old states
CREATE INDEX IF NOT EXISTS idx_conversation_state_updated_at ON ms_discord_conversation_state(updated_at);
