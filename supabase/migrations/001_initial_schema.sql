-- Enable pgvector extension
create extension if not exists vector with schema extensions;

-- ============================================
-- PROFILES (extends auth.users)
-- ============================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'parent' check (role in ('admin', 'parent')),
  approved boolean default false,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- Users can read their own profile
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Admins can read all profiles
create policy "Admins can read all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Admins can update any profile (for approval)
create policy "Admins can update profiles"
  on public.profiles for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Allow insert during registration (via trigger or service role)
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role, approved)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'parent'),
    case when coalesce(new.raw_user_meta_data->>'role', 'parent') = 'admin' then true else false end
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- CATEGORIES
-- ============================================
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  color text default '#6366f1',
  created_at timestamptz default now()
);

alter table public.categories enable row level security;

create policy "Anyone authenticated can read categories"
  on public.categories for select
  using (auth.uid() is not null);

create policy "Admins can manage categories"
  on public.categories for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================
-- DOCUMENTS
-- ============================================
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  file_name text not null,
  file_type text not null,
  file_url text not null,
  file_size integer,
  category_id uuid references public.categories(id) on delete set null,
  tags text[] default '{}',
  status text default 'processing' check (status in ('processing', 'ready', 'error')),
  error_message text,
  page_count integer,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.documents enable row level security;

create policy "Admins can manage documents"
  on public.documents for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Approved parents can read ready documents"
  on public.documents for select
  using (
    status = 'ready'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and approved = true
    )
  );

-- ============================================
-- DOCUMENT CHUNKS (with vector embeddings)
-- ============================================
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade,
  content text not null,
  chunk_index integer not null,
  embedding vector(1536),
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

alter table public.document_chunks enable row level security;

create policy "Admins can manage chunks"
  on public.document_chunks for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Approved parents can read chunks"
  on public.document_chunks for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and approved = true
    )
  );

-- Vector similarity search index
create index on public.document_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ============================================
-- CHAT SESSIONS
-- ============================================
create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  title text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.chat_sessions enable row level security;

create policy "Users manage own chat sessions"
  on public.chat_sessions for all
  using (auth.uid() = user_id);

create policy "Admins can read all chat sessions"
  on public.chat_sessions for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================
-- CHAT MESSAGES
-- ============================================
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb default '[]',
  created_at timestamptz default now()
);

alter table public.chat_messages enable row level security;

create policy "Users manage own messages"
  on public.chat_messages for all
  using (
    exists (
      select 1 from public.chat_sessions
      where id = session_id and user_id = auth.uid()
    )
  );

create policy "Admins can read all messages"
  on public.chat_messages for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================
-- ANALYTICS EVENTS
-- ============================================
create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  user_id uuid references public.profiles(id),
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

alter table public.analytics_events enable row level security;

create policy "Users can insert own events"
  on public.analytics_events for insert
  with check (auth.uid() = user_id);

create policy "Admins can read all events"
  on public.analytics_events for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================
-- SEMANTIC SEARCH FUNCTION
-- ============================================
create or replace function match_document_chunks(
  query_embedding vector(1536),
  match_threshold float default 0.7,
  match_count int default 8
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  chunk_index int,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    dc.id,
    dc.document_id,
    dc.content,
    dc.chunk_index,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  join public.documents d on dc.document_id = d.id
  where d.status = 'ready'
    and 1 - (dc.embedding <=> query_embedding) > match_threshold
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================
-- STORAGE BUCKET
-- ============================================
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict do nothing;

-- Admins can upload to documents bucket
create policy "Admins can upload documents"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Admins can read all documents
create policy "Admins can read stored documents"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Admins can delete documents
create policy "Admins can delete stored documents"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );
