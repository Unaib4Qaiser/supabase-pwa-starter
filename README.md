# Supabase PWA Starter (Vite + React + TypeScript)

A minimal **PWA** boilerplate with **Supabase Auth** (email/password) and a realtime **Notes** example.

## Features

- Vite + React + TypeScript
- Tailwind CSS
- PWA via `vite-plugin-pwa` (service worker + manifest)
- Supabase Auth (sign up / sign in / sign out)
- Realtime sync with Supabase `notes` table
- Protected routes with React Router

## Quick Start

```bash
pnpm i   # or npm i / yarn
cp .env.example .env
# fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
pnpm dev
```

Build:

```bash
pnpm build && pnpm preview
```

## Supabase SQL (run in SQL editor)

```sql
-- Enable pgcrypto if not enabled (for gen_random_uuid)
create extension if not exists pgcrypto;

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  inserted_at timestamptz not null default now()
);

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
```

## Folder Structure

```
public/
  icons/
src/
  components/
  hooks/
  lib/
  pages/
```

## Notes

- The service worker is auto-generated; it precaches build assets and enables offline shell.
- For custom caching strategies, tweak `VitePWA()` options in `vite.config.ts`.
- Replace placeholder icons in `public/icons/` with your own.
