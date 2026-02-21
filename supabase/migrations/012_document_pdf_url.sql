-- Add pdf_url column to store the path to the converted PDF version of non-PDF documents
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS pdf_url text;
