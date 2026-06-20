-- Fix genre column in ms_songs table
-- Change from genre_id (UUID) to genre (text)

-- Drop the old genre_id column if it exists
ALTER TABLE ms_songs DROP COLUMN IF EXISTS genre_id;

-- Add the new genre column as text
ALTER TABLE ms_songs ADD COLUMN IF NOT EXISTS genre text;
