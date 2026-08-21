-- Supabase database schema for Café Study Spot MVP

-- Enable pg_trgm for basic text search if needed later
create extension if not exists pg_trgm;

-- Profiles table linked to Supabase Auth
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  first_name text,
  last_name text,
  phone_number text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists phone_number text;
alter table public.profiles add column if not exists updated_at timestamp with time zone;

-- Cafes table
create table if not exists public.cafes (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  wifi_available boolean not null default false,
  wifi_quality text check (wifi_quality in ('Poor', 'Good', 'Excellent')),
  image_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Café Hours table (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
create table if not exists public.cafe_hours (
  id uuid default gen_random_uuid() primary key,
  cafe_id uuid references public.cafes(id) on delete cascade not null,
  day_of_week integer not null check (day_of_week between 0 and 6),
  opening_time time not null,
  closing_time time not null,
  constraint unique_cafe_day unique(cafe_id, day_of_week)
);

-- Crowd status history
create table if not exists public.cafe_crowd_status (
  id uuid default gen_random_uuid() primary key,
  cafe_id uuid references public.cafes(id) on delete cascade not null,
  crowd_level text not null check (crowd_level in ('Low', 'Moderate', 'Busy', 'Full')),
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_by uuid references public.profiles(id)
);

-- Ratings table: one rating per café per user
create table if not exists public.study_environment_ratings (
  id uuid default gen_random_uuid() primary key,
  cafe_id uuid references public.cafes(id) on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  quietness_rating integer not null check (quietness_rating between 1 and 3), -- 1=Loud, 2=Moderate, 3=Quiet
  aesthetics_rating integer not null check (aesthetics_rating between 1 and 5), -- 1-5 Stars
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_user_cafe_rating unique(user_id, cafe_id)
);

-- Favorites table
create table if not exists public.favorites (
  user_id uuid references auth.users on delete cascade not null,
  cafe_id uuid references public.cafes(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (user_id, cafe_id)
);

-- Create or replace database view to serve aggregated ratings and latest crowd status
create or replace view public.v_cafes_with_ratings as
select
  c.*,
  coalesce((select avg(r.quietness_rating) from public.study_environment_ratings r where r.cafe_id = c.id), 0.0)::numeric(3,2) as avg_quietness,
  coalesce((select avg(r.aesthetics_rating) from public.study_environment_ratings r where r.cafe_id = c.id), 0.0)::numeric(3,2) as avg_aesthetics,
  (select count(r.id) from public.study_environment_ratings r where r.cafe_id = c.id) as total_ratings,
  (
    select crowd_level 
    from public.cafe_crowd_status cs 
    where cs.cafe_id = c.id 
    order by cs.updated_at desc 
    limit 1
  ) as current_crowd_level,
  (
    select updated_at 
    from public.cafe_crowd_status cs 
    where cs.cafe_id = c.id 
    order by cs.updated_at desc 
    limit 1
  ) as crowd_updated_at
from public.cafes c;

-- Enable Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.cafes enable row level security;
alter table public.cafe_hours enable row level security;
alter table public.cafe_crowd_status enable row level security;
alter table public.study_environment_ratings enable row level security;
alter table public.favorites enable row level security;

-- Policy definitions
-- Profiles RLS Policies (Private: users can only access their own profile)
drop policy if exists "Allow public read access to profiles" on public.profiles;
drop policy if exists "Allow authenticated users to insert/update their own profile" on public.profiles;
drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

-- Users can only read their own profile
create policy "Users can view their own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- Users can only insert their own profile
create policy "Users can insert their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

-- Users can only update their own profile
create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Public read access policies for cafes, hours, crowd status, and environment ratings
create policy "Allow public read access to cafes" on public.cafes for select using (true);
create policy "Allow public read access to cafe_hours" on public.cafe_hours for select using (true);
create policy "Allow public read access to cafe_crowd_status" on public.cafe_crowd_status for select using (true);
create policy "Allow public read access to study_environment_ratings" on public.study_environment_ratings for select using (true);

-- Authenticated write permissions
create policy "Allow authenticated users to insert/update/delete their own ratings" on public.study_environment_ratings
  for all using (auth.uid() = user_id);

create policy "Allow authenticated users to manage their own favorites" on public.favorites
  for all using (auth.uid() = user_id);

-- Setup trigger to automatically sync auth.users with public.profiles on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
