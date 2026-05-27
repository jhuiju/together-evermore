
-- Fix 1: Prevent couple members from changing invite_code, user1_id, user2_id after creation
CREATE OR REPLACE FUNCTION public.prevent_couple_immutable_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invite_code IS DISTINCT FROM OLD.invite_code THEN
    RAISE EXCEPTION 'invite_code cannot be modified';
  END IF;
  IF NEW.user1_id IS DISTINCT FROM OLD.user1_id THEN
    RAISE EXCEPTION 'user1_id cannot be modified';
  END IF;
  -- Allow user2_id to be set once (NULL -> value) via join_couple_by_invite (SECURITY DEFINER bypasses this trigger context? No, triggers run regardless).
  -- But join_couple_by_invite needs to set user2_id. Permit only NULL -> value transition.
  IF OLD.user2_id IS NOT NULL AND NEW.user2_id IS DISTINCT FROM OLD.user2_id THEN
    RAISE EXCEPTION 'user2_id cannot be modified once set';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS couples_prevent_immutable_changes ON public.couples;
CREATE TRIGGER couples_prevent_immutable_changes
BEFORE UPDATE ON public.couples
FOR EACH ROW
EXECUTE FUNCTION public.prevent_couple_immutable_changes();

-- Re-link trigger (link_couple_users) still runs on couples updates; ensure it runs after this validation.
-- (link_couple_users only fires when user2_id transitions from NULL to a value, which is allowed.)

-- Fix 2: Remove the uid-based storage policies that bypass couple scoping.
-- The canonical path scheme is <couple_id>/<record_id>/<file>, enforced by the
-- couple-scoped policies. Remove the redundant uid-based INSERT and DELETE policies.
DROP POLICY IF EXISTS "Auth upload record photos" ON storage.objects;
DROP POLICY IF EXISTS "Owner delete record photos" ON storage.objects;
