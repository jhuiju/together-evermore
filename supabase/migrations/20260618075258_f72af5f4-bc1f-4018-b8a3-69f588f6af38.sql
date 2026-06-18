DROP POLICY IF EXISTS "Update own couple" ON public.couples;
CREATE POLICY "Update own couple" ON public.couples
FOR UPDATE TO authenticated
USING ((user1_id = auth.uid()) OR (user2_id = auth.uid()))
WITH CHECK (
  ((user1_id = auth.uid()) OR (user2_id = auth.uid()))
  AND user1_id = (SELECT user1_id FROM public.couples c WHERE c.id = couples.id)
  AND invite_code = (SELECT invite_code FROM public.couples c WHERE c.id = couples.id)
  AND (
    (SELECT user2_id FROM public.couples c WHERE c.id = couples.id) IS NULL
    OR user2_id = (SELECT user2_id FROM public.couples c WHERE c.id = couples.id)
  )
);