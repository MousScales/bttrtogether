-- Storage policies for the avatars bucket (profile pictures).
-- Run this in Supabase Dashboard → SQL Editor if pfps are not showing.

-- Allow anyone to read avatars (so profile pictures load for all users)
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Allow authenticated users to upload their own avatar (path: userId/avatar.xxx)
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to update their own avatar (for upsert when changing pfp)
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
