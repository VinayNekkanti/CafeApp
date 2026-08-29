-- Migration: Explicit column selection in public.v_cafes_with_ratings using LEFT JOIN LATERAL

-- Drop existing view to prevent column shape conflict errors if legacy columns exist on cafes
drop view if exists public.v_cafes_with_ratings cascade;

-- Recreate view with explicit cafes columns (no SELECT c.*)
create view public.v_cafes_with_ratings as
select
  c.id,
  c.name,
  c.address,
  c.latitude,
  c.longitude,
  c.wifi_available,
  c.wifi_quality,
  c.image_url,
  c.created_at,
  c.updated_at,
  coalesce((select avg(r.quietness_rating) from public.study_environment_ratings r where r.cafe_id = c.id), 0.0)::numeric(3,2) as avg_quietness,
  coalesce((select avg(r.aesthetics_rating) from public.study_environment_ratings r where r.cafe_id = c.id), 0.0)::numeric(3,2) as avg_aesthetics,
  (select count(r.id) from public.study_environment_ratings r where r.cafe_id = c.id) as total_ratings,
  latest_crowd.crowd_level as current_crowd_level,
  latest_crowd.updated_at as crowd_updated_at
from public.cafes c
left join lateral (
  select cs.crowd_level, cs.updated_at
  from public.cafe_crowd_status cs
  where cs.cafe_id = c.id
  order by cs.updated_at desc
  limit 1
) latest_crowd on true;

-- Restore SELECT grants to public, anon, and authenticated roles
grant select on public.v_cafes_with_ratings to public, anon, authenticated;
