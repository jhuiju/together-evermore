
CREATE TABLE public.archive_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('record','wish')),
  category text NOT NULL DEFAULT 'movie',
  title text NOT NULL,
  poster_url text,
  release_year text,
  genre text,
  tmdb_id text,
  watch_type text CHECK (watch_type IN ('theater','ott','other')),
  watched_date date,
  priority text CHECK (priority IN ('must','maybe')),
  added_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_archive_items_couple ON public.archive_items(couple_id);
CREATE INDEX idx_archive_items_type ON public.archive_items(couple_id, type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.archive_items TO authenticated;
GRANT ALL ON public.archive_items TO service_role;

ALTER TABLE public.archive_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "archive_items_select_own_couple" ON public.archive_items
  FOR SELECT TO authenticated
  USING (couple_id = public.current_couple_id());

CREATE POLICY "archive_items_insert_own_couple" ON public.archive_items
  FOR INSERT TO authenticated
  WITH CHECK (couple_id = public.current_couple_id() AND added_by = auth.uid());

CREATE POLICY "archive_items_update_own_couple" ON public.archive_items
  FOR UPDATE TO authenticated
  USING (couple_id = public.current_couple_id())
  WITH CHECK (couple_id = public.current_couple_id());

CREATE POLICY "archive_items_delete_own_couple" ON public.archive_items
  FOR DELETE TO authenticated
  USING (couple_id = public.current_couple_id());


CREATE TABLE public.archive_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_item_id uuid NOT NULL REFERENCES public.archive_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  score real NOT NULL CHECK (score >= 0.5 AND score <= 10),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (archive_item_id, user_id)
);

CREATE INDEX idx_archive_ratings_item ON public.archive_ratings(archive_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.archive_ratings TO authenticated;
GRANT ALL ON public.archive_ratings TO service_role;

ALTER TABLE public.archive_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "archive_ratings_select_own_couple" ON public.archive_ratings
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.archive_items ai
    WHERE ai.id = archive_ratings.archive_item_id
      AND ai.couple_id = public.current_couple_id()
  ));

CREATE POLICY "archive_ratings_insert_self" ON public.archive_ratings
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.archive_items ai
    WHERE ai.id = archive_ratings.archive_item_id
      AND ai.couple_id = public.current_couple_id()
  ));

CREATE POLICY "archive_ratings_update_self" ON public.archive_ratings
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "archive_ratings_delete_self" ON public.archive_ratings
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
