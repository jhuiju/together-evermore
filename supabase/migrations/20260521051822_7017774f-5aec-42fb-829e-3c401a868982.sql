
DROP POLICY IF EXISTS "records_delete" ON public.records;
CREATE POLICY "records_delete" ON public.records
FOR DELETE USING (
  couple_id = (SELECT couple_id FROM public.users WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Self can delete own rating" ON public.ratings;
CREATE POLICY "Couple can delete ratings" ON public.ratings
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.records r
    WHERE r.id = ratings.record_id
      AND r.couple_id = public.current_couple_id()
  )
);
