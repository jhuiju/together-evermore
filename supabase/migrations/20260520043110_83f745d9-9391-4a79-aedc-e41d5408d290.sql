
-- Couples table (created first, users references it)
CREATE TABLE public.couples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID NOT NULL,
  user2_id UUID,
  couple_name TEXT,
  anniversary DATE,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User profiles
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname TEXT,
  avatar_url TEXT,
  couple_id UUID REFERENCES public.couples(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Records (one per date per couple)
CREATE TABLE public.records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  memo TEXT,
  tag TEXT,
  location_name TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_records_couple_date ON public.records(couple_id, date);

CREATE TABLE public.photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  storage_url TEXT NOT NULL,
  "order" INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  score NUMERIC(3,1) NOT NULL CHECK (score >= 0.5 AND score <= 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(record_id, user_id)
);

-- Helper function: get current user's couple_id (security definer to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.current_couple_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT couple_id FROM public.users WHERE id = auth.uid();
$$;

-- Trigger: auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, nickname)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nickname', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

-- users policies
CREATE POLICY "Users can view self and partner" ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id()));
CREATE POLICY "Users can update self" ON public.users
  FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can insert self" ON public.users
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- couples policies
CREATE POLICY "View own couple" ON public.couples
  FOR SELECT TO authenticated
  USING (user1_id = auth.uid() OR user2_id = auth.uid());
CREATE POLICY "Create couple" ON public.couples
  FOR INSERT TO authenticated WITH CHECK (user1_id = auth.uid());
CREATE POLICY "Update own couple" ON public.couples
  FOR UPDATE TO authenticated
  USING (user1_id = auth.uid() OR user2_id = auth.uid());

-- records policies (couple-scoped)
CREATE POLICY "Couple can view records" ON public.records
  FOR SELECT TO authenticated USING (couple_id = public.current_couple_id());
CREATE POLICY "Couple can insert records" ON public.records
  FOR INSERT TO authenticated
  WITH CHECK (couple_id = public.current_couple_id() AND author_id = auth.uid());
CREATE POLICY "Couple can update records" ON public.records
  FOR UPDATE TO authenticated USING (couple_id = public.current_couple_id());
CREATE POLICY "Couple can delete records" ON public.records
  FOR DELETE TO authenticated USING (couple_id = public.current_couple_id());

-- photos policies (inherit through record)
CREATE POLICY "Couple can view photos" ON public.photos
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.records r WHERE r.id = record_id AND r.couple_id = public.current_couple_id()));
CREATE POLICY "Couple can insert photos" ON public.photos
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.records r WHERE r.id = record_id AND r.couple_id = public.current_couple_id()));
CREATE POLICY "Couple can delete photos" ON public.photos
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.records r WHERE r.id = record_id AND r.couple_id = public.current_couple_id()));

-- ratings policies
CREATE POLICY "Couple can view ratings" ON public.ratings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.records r WHERE r.id = record_id AND r.couple_id = public.current_couple_id()));
CREATE POLICY "Self can upsert ratings" ON public.ratings
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.records r WHERE r.id = record_id AND r.couple_id = public.current_couple_id()));
CREATE POLICY "Self can update own rating" ON public.ratings
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Self can delete own rating" ON public.ratings
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Storage bucket for photos
INSERT INTO storage.buckets (id, name, public) VALUES ('record-photos', 'record-photos', true)
  ON CONFLICT DO NOTHING;

CREATE POLICY "Public read record photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'record-photos');
CREATE POLICY "Auth upload record photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'record-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Owner delete record photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'record-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
