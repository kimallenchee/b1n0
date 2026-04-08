-- ============================================================
--  Migration: avatar_url column on profiles
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Create storage bucket for avatars (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can read avatar files
DO $$ BEGIN
  CREATE POLICY "avatars_public_read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'avatars');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Authenticated users can upload their own avatar (path = user_id/*)
DO $$ BEGIN
  CREATE POLICY "avatars_user_upload"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can update/overwrite their own avatar
DO $$ BEGIN
  CREATE POLICY "avatars_user_update"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can delete their own avatar
DO $$ BEGIN
  CREATE POLICY "avatars_user_delete"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- Add avatar_url to comments so each comment stores the poster's avatar at time of posting
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Notification preferences (jsonb of toggle keys)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
