-- Remove any duplicate records for same (couple_id, date), keeping earliest
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY couple_id, date ORDER BY created_at ASC) AS rn
  FROM public.records
)
DELETE FROM public.records r USING ranked
WHERE r.id = ranked.id AND ranked.rn > 1;

-- Remove duplicate ratings per (record_id, user_id), keep most recent
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY record_id, user_id ORDER BY created_at DESC) AS rn
  FROM public.ratings
)
DELETE FROM public.ratings r USING ranked
WHERE r.id = ranked.id AND ranked.rn > 1;

ALTER TABLE public.records
  ADD CONSTRAINT records_couple_date_unique UNIQUE (couple_id, date);

ALTER TABLE public.ratings
  ADD CONSTRAINT ratings_record_user_unique UNIQUE (record_id, user_id);