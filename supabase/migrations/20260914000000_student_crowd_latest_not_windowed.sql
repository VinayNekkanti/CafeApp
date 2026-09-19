-- Migration: v_student_crowd_status should surface the latest student report
-- per cafe (like v_cafes_with_ratings does for employee-reported crowd level),
-- not a rolling 2-hour average that silently disappears once reports age out.

drop view if exists public.v_student_crowd_status;

create view public.v_student_crowd_status as
select
  c.id as cafe_id,
  latest_report.crowd_level as student_crowd_level,
  latest_report.created_at as student_crowd_updated_at
from public.cafes c
left join lateral (
  select r.crowd_level, r.created_at
  from public.cafe_student_crowd_reports r
  where r.cafe_id = c.id
  order by r.created_at desc
  limit 1
) latest_report on true
where latest_report.crowd_level is not null;

grant select on public.v_student_crowd_status to public, anon, authenticated;
