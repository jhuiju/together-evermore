CREATE POLICY "Lookup couple by invite code"
ON public.couples
FOR SELECT
TO authenticated
USING (user2_id IS NULL);