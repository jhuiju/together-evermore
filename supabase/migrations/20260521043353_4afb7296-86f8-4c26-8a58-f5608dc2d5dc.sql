CREATE TABLE IF NOT EXISTS public._rls_debug_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_name text NOT NULL,
  ok boolean NOT NULL,
  detail text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.records DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_couple_id uuid;
  v_user_id uuid;
  v_record_id uuid;
  v_test_date date := '2099-12-31';
BEGIN
  SELECT c.id, c.user1_id
    INTO v_couple_id, v_user_id
    FROM public.couples c
   WHERE c.user1_id IS NOT NULL
   LIMIT 1;

  IF v_couple_id IS NULL OR v_user_id IS NULL THEN
    INSERT INTO public._rls_debug_results (test_name, ok, detail)
    VALUES ('records_upsert_with_rls_disabled', false, 'No couple/user row was available for a test upsert.');
  ELSE
    INSERT INTO public.records (couple_id, date, memo, tag, location_name, lat, lng, author_id)
    VALUES (v_couple_id, v_test_date, 'temporary RLS disabled test', 'rls-test', 'temporary test', NULL, NULL, v_user_id)
    ON CONFLICT (couple_id, date)
    DO UPDATE SET
      memo = EXCLUDED.memo,
      tag = EXCLUDED.tag,
      location_name = EXCLUDED.location_name,
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng
    RETURNING id INTO v_record_id;

    DELETE FROM public.records WHERE id = v_record_id;

    INSERT INTO public._rls_debug_results (test_name, ok, detail)
    VALUES ('records_upsert_with_rls_disabled', true, 'Temporary upsert succeeded while RLS was disabled, then the test row was removed.');
  END IF;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public._rls_debug_results (test_name, ok, detail)
  VALUES ('records_upsert_with_rls_disabled', false, SQLERRM);
END $$;

ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Author can delete records" ON public.records;
DROP POLICY IF EXISTS "Couple can insert records" ON public.records;
DROP POLICY IF EXISTS "Couple can update records" ON public.records;
DROP POLICY IF EXISTS "Couple can view records" ON public.records;
DROP POLICY IF EXISTS "records_select" ON public.records;
DROP POLICY IF EXISTS "records_insert" ON public.records;
DROP POLICY IF EXISTS "records_update" ON public.records;
DROP POLICY IF EXISTS "records_delete" ON public.records;
DROP POLICY IF EXISTS "Author can update records" ON public.records;

CREATE POLICY "records_select" ON public.records
FOR SELECT
TO authenticated
USING (
  couple_id = (
    SELECT couple_id FROM public.users WHERE id = auth.uid()
  )
);

CREATE POLICY "records_insert" ON public.records
FOR INSERT
TO authenticated
WITH CHECK (
  couple_id = (
    SELECT couple_id FROM public.users WHERE id = auth.uid()
  )
  AND author_id = auth.uid()
);

CREATE POLICY "records_update" ON public.records
FOR UPDATE
TO authenticated
USING (
  couple_id = (
    SELECT couple_id FROM public.users WHERE id = auth.uid()
  )
)
WITH CHECK (
  couple_id = (
    SELECT couple_id FROM public.users WHERE id = auth.uid()
  )
);

CREATE POLICY "records_delete" ON public.records
FOR DELETE
TO authenticated
USING (
  author_id = auth.uid()
);

ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;