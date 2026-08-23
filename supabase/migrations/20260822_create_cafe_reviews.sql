-- Migration to create cafe_reviews table with private RLS policies

create table if not exists public.cafe_reviews (
  id uuid primary key default gen_random_uuid(),

  cafe_id uuid not null
    references public.cafes(id)
    on delete cascade,

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  review_text text not null,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable Row Level Security (RLS)
alter table public.cafe_reviews enable row level security;

-- Ensure public SELECT policy is completely removed
drop policy if exists "Anyone can read cafe reviews" on public.cafe_reviews;

-- Policy 1: Users can read only their OWN reviews (Private to author)
drop policy if exists "Users can read their own reviews" on public.cafe_reviews;
create policy "Users can read their own reviews"
on public.cafe_reviews
for select
to authenticated
using (auth.uid() = user_id);

-- Policy 2: Authenticated users can insert their own reviews
drop policy if exists "Users can create their own reviews" on public.cafe_reviews;
create policy "Users can create their own reviews"
on public.cafe_reviews
for insert
to authenticated
with check (auth.uid() = user_id);

-- Policy 3: Users can update their own reviews
drop policy if exists "Users can update their own reviews" on public.cafe_reviews;
create policy "Users can update their own reviews"
on public.cafe_reviews
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Policy 4: Users can delete their own reviews
drop policy if exists "Users can delete their own reviews" on public.cafe_reviews;
create policy "Users can delete their own reviews"
on public.cafe_reviews
for delete
to authenticated
using (auth.uid() = user_id);
