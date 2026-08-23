-- Migration to refine favorites table RLS policies for private explicit per-user access

alter table public.favorites enable row level security;

-- Drop legacy/conflicting policies if exist
drop policy if exists "Allow authenticated users to manage their own favorites" on public.favorites;
drop policy if exists "Users can view their own favorites" on public.favorites;
drop policy if exists "Users can create their own favorites" on public.favorites;
drop policy if exists "Users can delete their own favorites" on public.favorites;

-- Policy 1: Users can view only their own favorites
create policy "Users can view their own favorites"
on public.favorites
for select
to authenticated
using (auth.uid() = user_id);

-- Policy 2: Users can insert only their own favorites
create policy "Users can create their own favorites"
on public.favorites
for insert
to authenticated
with check (auth.uid() = user_id);

-- Policy 3: Users can delete only their own favorites
create policy "Users can delete their own favorites"
on public.favorites
for delete
to authenticated
using (auth.uid() = user_id);
