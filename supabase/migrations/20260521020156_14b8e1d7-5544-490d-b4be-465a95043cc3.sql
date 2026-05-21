
-- Trigger function: when user2_id is filled in, set couple_id on both users
CREATE OR REPLACE FUNCTION public.link_couple_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user2_id IS NOT NULL AND (OLD.user2_id IS NULL OR OLD.user2_id IS DISTINCT FROM NEW.user2_id) THEN
    UPDATE public.users
       SET couple_id = NEW.id
     WHERE id IN (NEW.user1_id, NEW.user2_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_couple_users ON public.couples;
CREATE TRIGGER trg_link_couple_users
AFTER UPDATE ON public.couples
FOR EACH ROW
EXECUTE FUNCTION public.link_couple_users();

-- Also handle case where couples row is inserted already with both users
DROP TRIGGER IF EXISTS trg_link_couple_users_ins ON public.couples;
CREATE TRIGGER trg_link_couple_users_ins
AFTER INSERT ON public.couples
FOR EACH ROW
WHEN (NEW.user2_id IS NOT NULL)
EXECUTE FUNCTION public.link_couple_users();

-- Enable realtime for couples table
ALTER TABLE public.couples REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.couples;
