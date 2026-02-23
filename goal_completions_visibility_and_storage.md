# Goal completions: everyone sees posts + proof images

## 1. Everyone can see posts in the goals list

The table `goal_completions` already has a SELECT policy so that **everyone in the goal list** can see each other's completion posts (caption + proof image):

- **Completion author** (the person who posted)
- **Goal owner** (the person who owns that goal)
- **List owner** (the person who created the goal list)
- **Participants** (everyone in `group_goal_participants` for that list)

This is set in `add_goal_completion_caption.sql`:

- Policy: **"Users can view completions in their goal lists"**  
  → SELECT allowed when you are the completion author, or the goal is in a list where you are owner or participant.

No extra RLS change is needed for visibility. If someone in the list still cannot see a post, check that:

- The goal list is **started** (so group goals and participants are loaded).
- There are no other policies on `goal_completions` that restrict SELECT more than this.

## 2. Proof image/video shows (not just the photo icon)

The app loads proof media by:

1. Resolving the proof URL with **signed URLs** when needed (works for **private** buckets).
2. Falling back to the **public URL** when the bucket is public.

So the image (or video thumbnail) should show for everyone who can see the post, as long as storage is set up correctly.

### Storage bucket setup (Supabase Dashboard → Storage)

Create a bucket named **`goal-proofs`** and choose one of:

**Option A – Public bucket (simplest)**  
- Set the bucket to **Public**.  
- Proof images will load via public URLs.  
- No extra storage policies needed.

**Option B – Private bucket**  
- Keep the bucket **Private**.  
- Add a storage policy so **authenticated users** can read objects, for example:

  - Policy name: e.g. `Authenticated read goal-proofs`
  - Allowed operation: **SELECT** (read)
  - Target: bucket `goal-proofs`
  - USING expression: `auth.role() = 'authenticated'`

  (Exact policy syntax depends on your Supabase version; use the Dashboard “New policy” for storage and allow read for authenticated users.)

The app uses **signed URLs** for proof media, so as long as authenticated users can create signed URLs and read from the bucket, proof images will load and you won’t see only the photo icon.

## 3. If you still see only the photo icon

- Confirm the post was saved with a proof (image/video) in **GoalPostScreen** (e.g. check `goal_completions.proof_url` in Table Editor).
- In Storage, open the **goal-proofs** bucket and check that the file exists at the path stored in `proof_url`.
- If the bucket is private, ensure the storage policy allows **authenticated** users to **read** from **goal-proofs**.
