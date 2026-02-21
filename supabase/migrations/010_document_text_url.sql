-- Add text_url column to store the path to the extracted .txt version
ALTER TABLE documents ADD COLUMN IF NOT EXISTS text_url text;
