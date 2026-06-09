CREATE TABLE public.memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (record_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.memos TO authenticated;
GRANT ALL ON public.memos TO service_role;

ALTER TABLE public.memos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Couple members can view memos"
  ON public.memos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.records r
      WHERE r.id = memos.record_id
        AND r.couple_id = public.current_couple_id()
    )
  );

CREATE POLICY "Users can insert own memo"
  ON public.memos FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.records r
      WHERE r.id = memos.record_id
        AND r.couple_id = public.current_couple_id()
    )
  );

CREATE POLICY "Users can update own memo"
  ON public.memos FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own memo"
  ON public.memos FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_memos_record_id ON public.memos(record_id);
CREATE INDEX idx_memos_user_id ON public.memos(user_id);

-- Migrate existing memo data: one row per record with non-null/non-empty memo,
-- attributed to the author of that record.
INSERT INTO public.memos (record_id, user_id, content, created_at)
SELECT r.id, r.author_id, r.memo, r.created_at
FROM public.records r
WHERE r.memo IS NOT NULL AND length(trim(r.memo)) > 0
ON CONFLICT (record_id, user_id) DO NOTHING;
