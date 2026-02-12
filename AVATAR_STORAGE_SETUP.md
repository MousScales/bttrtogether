# Avatar Storage Setup

## 1. Create Storage Bucket in Supabase Dashboard

1. Go to your Supabase project: https://supabase.com/dashboard/project/xwkgmewbzohylnjirxaw
2. Click **Storage** in the left sidebar
3. Click **"New bucket"**
4. Set the following:
   - **Name:** `avatars`
   - **Public bucket:** ✅ **Yes** (so avatars are publicly accessible)
   - **File size limit:** 5 MB (optional)
   - **Allowed MIME types:** `image/*` (optional, for images only)
5. Click **"Create bucket"**

## 2. Set up Storage RLS Policies

Run this SQL in the **SQL Editor**:

```sql
-- Storage policies for avatars bucket

-- Allow anyone to read avatars (public bucket)
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Allow authenticated users to upload avatars to their own folder
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to update their own avatars
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own avatars
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

## 3. Folder Structure

Avatars will be stored as:
```
avatars/
  {user_id}/
    avatar.jpg
```

This way each user can only modify their own folder.

## 4. Getting Avatar URLs

After upload, get the public URL:
```javascript
const { data } = supabase.storage
  .from('avatars')
  .getPublicUrl(`${userId}/avatar.jpg`);

const avatarUrl = data.publicUrl;
```

Then save `avatarUrl` to `profiles.avatar_url`.

## Done!

Once the bucket is created and policies are set, the app's avatar upload will work automatically.
