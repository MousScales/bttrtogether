-- Allow authenticated users to READ from the goal-proofs bucket.
-- Required so createSignedUrl() works and proof images load in the app (especially if bucket is private).
-- Run in Supabase Dashboard → SQL Editor.

DROP POLICY IF EXISTS "Allow authenticated read goal-proofs" ON storage.objects;

CREATE POLICY "Allow authenticated read goal-proofs"
ON storage.objects
FOR SELECT
TO authenticated
USING ( bucket_id = 'goal-proofs' );

-- Allow authenticated users to upload (required so Share saves images)
DROP POLICY IF EXISTS "Allow authenticated upload goal-proofs" ON storage.objects;
CREATE POLICY "Allow authenticated upload goal-proofs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK ( bucket_id = 'goal-proofs' );

-- Allow overwrite (upsert) when changing proof media
DROP POLICY IF EXISTS "Allow authenticated update goal-proofs" ON storage.objects;
CREATE POLICY "Allow authenticated update goal-proofs"
ON storage.objects FOR UPDATE TO authenticated
USING ( bucket_id = 'goal-proofs' )
WITH CHECK ( bucket_id = 'goal-proofs' );
