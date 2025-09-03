-- Enable pgcrypto if not enabled (for gen_random_uuid)
create extension if not exists pgcrypto;

-- Drop existing table if it exists
drop table if exists public.notes;

-- Create notes table with title and content fields
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  inserted_at timestamptz not null default now()
);

-- Enable row level security
alter table public.notes enable row level security;

-- Only owners can CRUD their notes
create policy "Owners can read own notes" on public.notes
  for select using (auth.uid() = user_id);

create policy "Owners can insert notes" on public.notes
  for insert with check (auth.uid() = user_id);

create policy "Owners can update own notes" on public.notes
  for update using (auth.uid() = user_id);

create policy "Owners can delete own notes" on public.notes
  for delete using (auth.uid() = user_id);

-- Create indexes for better performance
create index if not exists notes_user_id_idx on public.notes(user_id);
create index if not exists notes_title_idx on public.notes(title);
create index if not exists notes_inserted_at_idx on public.notes(inserted_at);
