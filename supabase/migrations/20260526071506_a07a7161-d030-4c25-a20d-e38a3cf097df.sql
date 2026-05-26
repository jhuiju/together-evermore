
-- 1) Remove couples from realtime publication (prevents broadcasting all couple changes)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'couples'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.couples';
  END IF;
END $$;

-- 2) Tighten invite-code lookup: drop broad SELECT policy, replace with a SECURITY DEFINER RPC
DROP POLICY IF EXISTS "Lookup couple by invite code" ON public.couples;

CREATE OR REPLACE FUNCTION public.join_couple_by_invite(p_invite_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_couple_id uuid;
  v_user1 uuid;
  v_user2 uuid;
  v_existing_couple uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_invite_code IS NULL OR length(p_invite_code) <> 6 THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  -- Don't allow joining if already in a couple
  SELECT couple_id INTO v_existing_couple FROM public.users WHERE id = v_user;
  IF v_existing_couple IS NOT NULL THEN
    RAISE EXCEPTION 'Already linked to a couple';
  END IF;

  SELECT id, user1_id, user2_id
    INTO v_couple_id, v_user1, v_user2
  FROM public.couples
  WHERE invite_code = p_invite_code
  LIMIT 1;

  IF v_couple_id IS NULL THEN
    RAISE EXCEPTION 'Code not found';
  END IF;
  IF v_user2 IS NOT NULL THEN
    RAISE EXCEPTION 'Code already used';
  END IF;
  IF v_user1 = v_user THEN
    RAISE EXCEPTION 'Cannot use your own code';
  END IF;

  UPDATE public.couples SET user2_id = v_user WHERE id = v_couple_id;
  UPDATE public.users SET couple_id = v_couple_id WHERE id IN (v_user, v_user1);

  RETURN v_couple_id;
END;
$$;

REVOKE ALL ON FUNCTION public.join_couple_by_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_couple_by_invite(text) TO authenticated;

-- 3) Lock down SECURITY DEFINER helpers (triggers don't need EXECUTE grants)
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_couple_users() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_couple_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_couple_id() TO authenticated;

-- 4) Make record-photos bucket private and drop the public-read policy
UPDATE storage.buckets SET public = false WHERE id = 'record-photos';
DROP POLICY IF EXISTS "Public read record photos" ON storage.objects;
