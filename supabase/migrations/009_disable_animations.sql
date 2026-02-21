-- Add option to disable animations per school
ALTER TABLE public.settings ADD COLUMN disable_animations boolean NOT NULL DEFAULT false;
