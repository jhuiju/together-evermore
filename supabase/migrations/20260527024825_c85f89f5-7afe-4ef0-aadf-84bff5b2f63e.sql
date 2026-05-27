
DROP POLICY IF EXISTS "Couple can delete ratings" ON public.ratings;
CREATE POLICY "Couple can delete ratings" ON public.ratings
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.records r WHERE r.id = ratings.record_id AND r.couple_id = current_couple_id()));

DROP POLICY IF EXISTS "records_select" ON public.records;
DROP POLICY IF EXISTS "records_insert" ON public.records;
DROP POLICY IF EXISTS "records_update" ON public.records;
DROP POLICY IF EXISTS "records_delete" ON public.records;

CREATE POLICY "records_select" ON public.records
  FOR SELECT TO authenticated
  USING (couple_id = (SELECT users.couple_id FROM public.users WHERE users.id = auth.uid()));

CREATE POLICY "records_insert" ON public.records
  FOR INSERT TO authenticated
  WITH CHECK (couple_id = (SELECT users.couple_id FROM public.users WHERE users.id = auth.uid()));

CREATE POLICY "records_update" ON public.records
  FOR UPDATE TO authenticated
  USING (couple_id = (SELECT users.couple_id FROM public.users WHERE users.id = auth.uid()))
  WITH CHECK (couple_id = (SELECT users.couple_id FROM public.users WHERE users.id = auth.uid()));

CREATE POLICY "records_delete" ON public.records
  FOR DELETE TO authenticated
  USING (couple_id = (SELECT users.couple_id FROM public.users WHERE users.id = auth.uid()));
