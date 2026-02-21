-- ============================================
-- FOLDERS (for organizing documents)
-- ============================================
create table public.folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.folders(id) on delete cascade,
  created_at timestamptz default now(),
  unique(name, parent_id)
);

alter table public.folders enable row level security;

create policy "Anyone authenticated can read folders"
  on public.folders for select
  using (auth.uid() is not null);

create policy "Admins can manage folders"
  on public.folders for all
  using (public.is_admin());

-- Prevent duplicate folder names at root level
create unique index idx_folders_root_unique
  on public.folders(name) where parent_id is null;

-- Add folder_id to documents
alter table public.documents
  add column folder_id uuid references public.folders(id) on delete set null;

create index idx_documents_folder_id on public.documents(folder_id);

-- ============================================
-- CHILD GRADE on profiles
-- ============================================
alter table public.profiles
  add column child_grade text;

-- Update trigger to store child_grade from signup metadata
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role, approved, child_grade)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'parent'),
    true,
    new.raw_user_meta_data->>'child_grade'
  );
  return new;
end;
$$ language plpgsql security definer;

-- ============================================
-- EVENTS (school events for parents)
-- ============================================
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  date date not null,
  start_time time,
  end_time time,
  location text,
  event_type text not null default 'general'
    check (event_type in ('general', 'academic', 'sports', 'arts', 'meeting', 'holiday', 'other')),
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.events enable row level security;

create policy "Admins can manage events"
  on public.events for all
  using (public.is_admin());

create policy "Authenticated users can read events"
  on public.events for select
  using (auth.uid() is not null);

create index idx_events_date on public.events(date);
