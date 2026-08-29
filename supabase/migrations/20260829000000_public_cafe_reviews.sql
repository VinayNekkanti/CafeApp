-- Migration: Public Cafe Reviews, Safe Display Name View & Concurrency-Safe Daily Limit Trigger

-- 1. Enable RLS on cafe_reviews and configure policies
alter table public.cafe_reviews enable row level security;

-- Drop old restrictive select policies
drop policy if exists "Users can read their own reviews" on public.cafe_reviews;
drop policy if exists "Anyone can read cafe reviews" on public.cafe_reviews;

-- Policy 1: Public read access for cafe_reviews (anon + authenticated)
create policy "Anyone can read cafe reviews"
  on public.cafe_reviews
  for select
  to public
  using (true);

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

-- 2. Create public.v_public_cafe_reviews view for privacy-safe author names (First name + Last initial)
-- EXPOSES EXCLUSIVELY: id, cafe_id, review_text, created_at, updated_at, safe_author_name
create or replace view public.v_public_cafe_reviews as
select
  r.id,
  r.cafe_id,
  r.review_text,
  r.created_at,
  r.updated_at,
  coalesce(
    case
      when p.first_name is not null and length(trim(p.first_name)) > 0 then
        trim(p.first_name) || coalesce(' ' || upper(left(trim(p.last_name), 1)) || '.', '')
      when p.display_name is not null and length(trim(p.display_name)) > 0 then
        case
          when position(' ' in trim(p.display_name)) > 0 then
            split_part(trim(p.display_name), ' ', 1) || ' ' || upper(left(split_part(trim(p.display_name), ' ', 2), 1)) || '.'
          else
            trim(p.display_name)
        end
      else null
    end,
    'Anonymous Student'
  ) as safe_author_name
from public.cafe_reviews r
left join public.profiles p on p.id = r.user_id;

-- Grant select permission on the public view to all roles
grant select on public.v_public_cafe_reviews to public, anon, authenticated;

-- 3. Authoritative Concurrency-Safe PostgreSQL Trigger: 2 reviews/user/day limit (America/Los_Angeles timezone)
create or replace function public.check_daily_review_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_daily_count integer;
  v_today_start timestamptz;
  v_la_date date;
  v_lock_key integer;
begin
  -- Force server-side timestamp to prevent client backdating bypass
  new.created_at := now();

  -- Compute current date and midnight in America/Los_Angeles timezone
  v_la_date := (now() at time zone 'America/Los_Angeles')::date;
  v_today_start := v_la_date at time zone 'America/Los_Angeles';

  -- Derive deterministic 32-bit advisory transaction lock key for (user_id + LA date)
  v_lock_key := hashtext(new.user_id::text || '_' || v_la_date::text);

  -- Acquire exclusive transaction-level advisory lock (serializes concurrent submissions for same user/day)
  perform pg_advisory_xact_lock(v_lock_key);

  -- Count reviews submitted by this user since start of today in LA timezone
  select count(*) into v_daily_count
  from public.cafe_reviews
  where user_id = new.user_id
    and created_at >= v_today_start;

  -- Enforce 2 reviews per user per day limit
  if v_daily_count >= 2 then
    raise exception 'Daily review limit reached. You can submit up to 2 reviews per day.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_daily_review_limit on public.cafe_reviews;
create trigger enforce_daily_review_limit
  before insert on public.cafe_reviews
  for each row
  execute function public.check_daily_review_limit();
