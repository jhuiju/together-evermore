-- records: replace author-only UPDATE with couple-wide UPDATE
DROP POLICY IF EXISTS "Author can update records" ON public.records;

CREATE POLICY "Couple can update records"
ON public.records
FOR UPDATE
TO authenticated
USING (couple_id = public.current_couple_id())
WITH CHECK (couple_id = public.current_couple_id());

-- photos: add missing UPDATE policy (needed for re-ordering)
CREATE POLICY "Couple can update photos"
ON public.photos
FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.records r
  WHERE r.id = photos.record_id
    AND r.couple_id = public.current_couple_id()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.records r
  WHERE r.id = photos.record_id
    AND r.couple_id = public.current_couple_id()
));