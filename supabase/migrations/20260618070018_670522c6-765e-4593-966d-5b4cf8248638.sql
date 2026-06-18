
CREATE TABLE public.favorite_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
  location_name text NOT NULL,
  lat double precision,
  lng double precision,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX favorite_places_couple_idx ON public.favorite_places(couple_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorite_places TO authenticated;
GRANT ALL ON public.favorite_places TO service_role;

ALTER TABLE public.favorite_places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "couple can read favorite places"
  ON public.favorite_places FOR SELECT TO authenticated
  USING (couple_id = public.current_couple_id());

CREATE POLICY "couple can insert favorite places"
  ON public.favorite_places FOR INSERT TO authenticated
  WITH CHECK (
    couple_id = public.current_couple_id()
    AND created_by = auth.uid()
  );

CREATE POLICY "couple can delete favorite places"
  ON public.favorite_places FOR DELETE TO authenticated
  USING (couple_id = public.current_couple_id());
