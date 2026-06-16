REVOKE UPDATE ON public.couples FROM authenticated;
GRANT UPDATE (couple_name, anniversary) ON public.couples TO authenticated;
GRANT ALL ON public.couples TO service_role;