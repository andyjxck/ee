-- Create table for Discord conversation history
CREATE TABLE IF NOT EXISTS ms_discord_conversation_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  discord_user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversation_history_user_id ON ms_discord_conversation_history(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_history_created_at ON ms_discord_conversation_history(created_at);
