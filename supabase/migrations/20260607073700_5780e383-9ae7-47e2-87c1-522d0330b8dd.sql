CREATE INDEX IF NOT EXISTS idx_records_couple_date ON public.records (couple_id, date);
CREATE INDEX IF NOT EXISTS idx_ratings_record_user ON public.ratings (record_id, user_id);
CREATE INDEX IF NOT EXISTS idx_photos_record ON public.photos (record_id);