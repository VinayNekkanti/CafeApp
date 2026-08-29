-- Migration: Employee Crowd Level System & Security RPC (Numeric Smallint Crowd Level)

-- 1. Create public.cafe_employees table
create table if not exists public.cafe_employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now())
);

-- Index for fast user assignment lookups
create index if not exists idx_cafe_employees_user_id on public.cafe_employees(user_id);
create index if not exists idx_cafe_employees_cafe_id on public.cafe_employees(cafe_id);

-- Enable RLS
alter table public.cafe_employees enable row level security;

-- Policy: Employees can view their own assignment
drop policy if exists "Employees can view their own assignment" on public.cafe_employees;
create policy "Employees can view their own assignment"
  on public.cafe_employees
  for select
  to authenticated
  using (auth.uid() = user_id and is_active = true);

-- 2. Migrate cafe_crowd_status.crowd_level column from text to smallint (1-10)
alter table public.cafe_crowd_status drop constraint if exists cafe_crowd_status_crowd_level_check;

alter table public.cafe_crowd_status 
  alter column crowd_level type smallint 
  using (
    case 
      when crowd_level ~ '^[0-9]+$' then crowd_level::smallint
      when crowd_level = 'Low' then 2
      when crowd_level = 'Moderate' then 5
      when crowd_level = 'Busy' then 8
      when crowd_level = 'Full' then 10
      else 5
    end
  );

alter table public.cafe_crowd_status 
  add constraint cafe_crowd_status_crowd_level_check 
  check (crowd_level between 1 and 10);

-- 3. Secure RPC function for authorized employees to update their assigned cafe crowd level
create or replace function public.update_employee_crowd_level(new_level integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_cafe_id uuid;
  v_cafe_name text;
begin
  -- Retrieve current authenticated user ID
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Verify user is an active employee and find assigned cafe
  select cafe_id into v_cafe_id
  from public.cafe_employees
  where user_id = v_user_id and is_active = true;

  if v_cafe_id is null then
    raise exception 'Unauthorized: Account is not an active café employee';
  end if;

  -- Validate crowd level integer range (1 through 10)
  if new_level < 1 or new_level > 10 then
    raise exception 'Invalid crowd level: Must be an integer between 1 and 10';
  end if;

  -- Get assigned cafe name
  select name into v_cafe_name
  from public.cafes
  where id = v_cafe_id;

  -- Insert new crowd status record directly as numeric smallint
  insert into public.cafe_crowd_status (cafe_id, crowd_level, updated_at, updated_by)
  values (v_cafe_id, new_level, now(), v_user_id);

  return jsonb_build_object(
    'success', true,
    'cafe_id', v_cafe_id,
    'cafe_name', v_cafe_name,
    'crowd_level', new_level,
    'updated_at', now()
  );
end;
$$;

-- Explicitly revoke execution from public and anon roles
revoke execute on function public.update_employee_crowd_level(integer) from public, anon;

-- Grant execution strictly to authenticated users
grant execute on function public.update_employee_crowd_level(integer) to authenticated;
