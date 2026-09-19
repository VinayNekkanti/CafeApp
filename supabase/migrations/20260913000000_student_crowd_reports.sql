-- Migration: Student-reported crowd levels (separate track from employee-reported
-- cafe_crowd_status). Location-gated on the client (200m of the cafe) and
-- re-verified server-side here so a tampered client can't fake proximity.

-- 1. Table: one row per student crowd report (kept as a log, not a single mutable
-- value, so "student reported" can be an average of recent reports rather than
-- any single student's number).
create table if not exists public.cafe_student_crowd_reports (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  crowd_level smallint not null check (crowd_level between 1 and 10),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_cafe_student_crowd_reports_cafe_id on public.cafe_student_crowd_reports(cafe_id);
create index if not exists idx_cafe_student_crowd_reports_user_cafe on public.cafe_student_crowd_reports(user_id, cafe_id);

alter table public.cafe_student_crowd_reports enable row level security;

-- Public read (the RPC is the only insert path, so this is safe to expose —
-- mirrors the public read policy on cafe_crowd_status).
drop policy if exists "Anyone can read student crowd reports" on public.cafe_student_crowd_reports;
create policy "Anyone can read student crowd reports"
  on public.cafe_student_crowd_reports
  for select
  to public
  using (true);

-- No insert/update/delete policies for regular clients — all writes go through
-- the security definer RPC below, which enforces location + daily limit.

-- 2. Public aggregate view: average of the last 2 hours of student reports per
-- cafe (a single student's number shouldn't read as "the" crowd level), plus
-- when the most recent one came in.
create or replace view public.v_student_crowd_status as
select
  cafe_id,
  round(avg(crowd_level))::smallint as student_crowd_level,
  max(created_at) as student_crowd_updated_at,
  count(*) as recent_report_count
from public.cafe_student_crowd_reports
where created_at >= now() - interval '2 hours'
group by cafe_id;

grant select on public.v_student_crowd_status to public, anon, authenticated;

-- 3. Secure RPC: authenticated, non-employee users only, must be within 200m of
-- the cafe (haversine, same formula used elsewhere in this app), max one
-- report per user per cafe per America/Los_Angeles calendar day.
create or replace function public.submit_student_crowd_report(
  p_cafe_id uuid,
  p_level integer,
  p_lat double precision,
  p_lon double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_cafe_name text;
  v_cafe_lat double precision;
  v_cafe_lon double precision;
  v_distance_meters double precision;
  v_la_date date;
  v_today_start timestamptz;
  v_lock_key integer;
  v_already_reported boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_level < 1 or p_level > 10 then
    raise exception 'Invalid crowd level: Must be an integer between 1 and 10';
  end if;

  if p_lat is null or p_lon is null then
    raise exception 'Location is required to report a crowd level';
  end if;

  -- Employees report through their own dedicated flow, not this one.
  if exists (
    select 1 from public.cafe_employees
    where user_id = v_user_id and is_active = true
  ) then
    raise exception 'Unauthorized: Employee accounts cannot submit student crowd reports';
  end if;

  select name, latitude, longitude into v_cafe_name, v_cafe_lat, v_cafe_lon
  from public.cafes
  where id = p_cafe_id;

  if v_cafe_name is null then
    raise exception 'Cafe not found';
  end if;

  -- Haversine distance in meters.
  v_distance_meters := 6371000 * 2 * asin(sqrt(
    power(sin(radians(v_cafe_lat - p_lat) / 2), 2) +
    cos(radians(p_lat)) * cos(radians(v_cafe_lat)) *
    power(sin(radians(v_cafe_lon - p_lon) / 2), 2)
  ));

  if v_distance_meters > 200 then
    raise exception 'You need to be at the cafe to report its crowd level';
  end if;

  -- One report per user per cafe per America/Los_Angeles calendar day —
  -- same day-boundary + advisory-lock pattern as the review daily limit.
  v_la_date := (now() at time zone 'America/Los_Angeles')::date;
  v_today_start := v_la_date at time zone 'America/Los_Angeles';
  v_lock_key := hashtext(v_user_id::text || '_' || p_cafe_id::text || '_' || v_la_date::text);
  perform pg_advisory_xact_lock(v_lock_key);

  select exists (
    select 1 from public.cafe_student_crowd_reports
    where user_id = v_user_id
      and cafe_id = p_cafe_id
      and created_at >= v_today_start
  ) into v_already_reported;

  if v_already_reported then
    raise exception 'You can only report this cafe''s crowd level once per day';
  end if;

  insert into public.cafe_student_crowd_reports (cafe_id, user_id, crowd_level)
  values (p_cafe_id, v_user_id, p_level);

  return jsonb_build_object(
    'success', true,
    'cafe_id', p_cafe_id,
    'cafe_name', v_cafe_name,
    'crowd_level', p_level,
    'created_at', now()
  );
end;
$$;

revoke execute on function public.submit_student_crowd_report(uuid, integer, double precision, double precision) from public, anon;
grant execute on function public.submit_student_crowd_report(uuid, integer, double precision, double precision) to authenticated;
