
-- Prevent users from arbitrarily changing their own couple_id via direct UPDATE.
-- The join_couple_by_invite() SECURITY DEFINER function remains the only path.
DROP POLICY IF EXISTS "Users can update self" ON public.users;
CREATE POLICY "Users can update self"
  ON public.users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND couple_id IS NOT DISTINCT FROM (SELECT couple_id FROM public.users WHERE id = auth.uid()));

-- Restrict rating deletion to the rating's owner instead of either partner.
DROP POLICY IF EXISTS "Couple can delete ratings" ON public.ratings;
CREATE POLICY "Self can delete own rating"
  ON public.ratings
  FOR DELETE
  USING (user_id = auth.uid());
