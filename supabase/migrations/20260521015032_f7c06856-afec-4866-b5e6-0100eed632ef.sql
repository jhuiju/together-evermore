
-- Ensure RLS enabled
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

-- ============ RECORDS ============
DROP POLICY IF EXISTS "Couple can insert records" ON public.records;
DROP POLICY IF EXISTS "Couple can view records" ON public.records;
DROP POLICY IF EXISTS "Couple can update records" ON public.records;
DROP POLICY IF EXISTS "Couple can delete records" ON public.records;

CREATE POLICY "Couple can insert records"
ON public.records FOR INSERT TO authenticated
WITH CHECK (couple_id = public.current_couple_id() AND author_id = auth.uid());

CREATE POLICY "Couple can view records"
ON public.records FOR SELECT TO authenticated
USING (couple_id = public.current_couple_id());

CREATE POLICY "Author can update records"
ON public.records FOR UPDATE TO authenticated
USING (author_id = auth.uid())
WITH CHECK (author_id = auth.uid());

CREATE POLICY "Author can delete records"
ON public.records FOR DELETE TO authenticated
USING (author_id = auth.uid());

-- ============ PHOTOS ============
DROP POLICY IF EXISTS "Couple can insert photos" ON public.photos;
DROP POLICY IF EXISTS "Couple can view photos" ON public.photos;
DROP POLICY IF EXISTS "Couple can delete photos" ON public.photos;

CREATE POLICY "Couple can insert photos"
ON public.photos FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.records r
  WHERE r.id = photos.record_id AND r.couple_id = public.current_couple_id()
));

CREATE POLICY "Couple can view photos"
ON public.photos FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.records r
  WHERE r.id = photos.record_id AND r.couple_id = public.current_couple_id()
));

CREATE POLICY "Couple can delete photos"
ON public.photos FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.records r
  WHERE r.id = photos.record_id AND r.couple_id = public.current_couple_id()
));

-- ============ RATINGS ============
DROP POLICY IF EXISTS "Self can upsert ratings" ON public.ratings;
DROP POLICY IF EXISTS "Couple can view ratings" ON public.ratings;
DROP POLICY IF EXISTS "Self can update own rating" ON public.ratings;
DROP POLICY IF EXISTS "Self can delete own rating" ON public.ratings;

CREATE POLICY "Self can insert own rating"
ON public.ratings FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.records r
    WHERE r.id = ratings.record_id AND r.couple_id = public.current_couple_id()
  )
);

CREATE POLICY "Couple can view ratings"
ON public.ratings FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.records r
  WHERE r.id = ratings.record_id AND r.couple_id = public.current_couple_id()
));

CREATE POLICY "Self can update own rating"
ON public.ratings FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Self can delete own rating"
ON public.ratings FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ============ STORAGE: record-photos bucket ============
DROP POLICY IF EXISTS "Couple can view record photos" ON storage.objects;
DROP POLICY IF EXISTS "Couple can upload record photos" ON storage.objects;
DROP POLICY IF EXISTS "Couple can update record photos" ON storage.objects;
DROP POLICY IF EXISTS "Couple can delete record photos" ON storage.objects;

-- Files stored at: {couple_id}/{record_id}/{file}
CREATE POLICY "Couple can view record photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'record-photos'
  AND (storage.foldername(name))[1] = public.current_couple_id()::text
);

CREATE POLICY "Couple can upload record photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'record-photos'
  AND (storage.foldername(name))[1] = public.current_couple_id()::text
);

CREATE POLICY "Couple can update record photos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'record-photos'
  AND (storage.foldername(name))[1] = public.current_couple_id()::text
);

CREATE POLICY "Couple can delete record photos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'record-photos'
  AND (storage.foldername(name))[1] = public.current_couple_id()::text
);
