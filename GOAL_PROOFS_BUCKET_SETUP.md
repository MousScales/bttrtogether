# Create the goal-proofs bucket (required for post images/videos)

Your app uploads post images and videos to a bucket named **goal-proofs**. Right now only **avatars** exists, so uploads fail and you see the photo icon instead of the media.

## 1. Create the bucket in Supabase

1. In **Supabase Dashboard** go to **Storage** (as in your screenshot).
2. Click the green **"+ New bucket"** button.
3. Set:
   - **Name:** `goal-proofs` (must be exactly this – the app uses this name).
   - **Public bucket:** turn **ON** so images load for everyone without extra auth.
   - **File size limit:** e.g. `50 MB` if you want to allow videos.
   - **Allowed MIME types:** leave empty (allow all) or set `image/*, video/*`.
4. Click **Create bucket**.

## 2. (Optional) Add storage policies

If uploads still fail after creating the bucket, run the policies in **SQL Editor**:

1. Open **SQL Editor** in Supabase.
2. Run the contents of **goal_proofs_storage_policy.sql** (the SELECT policy).
3. If you get errors when posting, also uncomment and run the INSERT and UPDATE policies in that file.

## 3. Test again

After the **goal-proofs** bucket exists and is **Public**:

- Post a new goal completion with a photo or video.
- You should see the image (or video) in the goals list instead of only the icon.

Existing posts that were created when the bucket didn’t exist have no file to show; only new posts will display media.
