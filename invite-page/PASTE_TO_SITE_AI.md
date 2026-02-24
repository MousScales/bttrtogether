# Copy everything below this line and paste it to the bttrsite AI

---

You are working on the **bttrsite** Vercel project (https://bttrsite.vercel.app), the web companion for the Bttr Together mobile app. Implement the following so the app’s invite links, add-me links, and Stripe bank-return flow work through this domain.

---

## 1. Invite / Join page (rich link preview)

**Goal:** When someone shares a link like `https://bttrsite.vercel.app/join/GOAL_LIST_ID`, the page must return HTML with **Open Graph** meta so iMessage shows one rich preview card (image + title “Join [challenge name]” + domain). The challenge name comes from Supabase.

**Do this:**

- Create **api/join/[id].js** (Vercel serverless function) at the repo root. It should:
  - Accept GET/POST with `id` in the query (from the path `/join/:id`).
  - Fetch the challenge name from Supabase: table `goal_lists`, column `name`, where `id` = the path id. Use env vars `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
  - Return HTML with: `<meta property="og:title" content="Join &quot;[challenge name]&quot;" />`, `<meta property="og:image" content="https://bttrsite.vercel.app/fsf.png" />`, `<meta property="og:url" content="[current page url]" />`, and a body with “Open in app” link: `href="bttrtogether://join/[id]"`.
- Add rewrite in **vercel.json**: `{ "source": "/join/:id", "destination": "/api/join/:id" }`.
- Serve **fsf.png** at the site root (e.g. `public/fsf.png`) so `https://bttrsite.vercel.app/fsf.png` works. The image file is the app icon (user will provide or copy from the app repo `assets/fsf.png`).
- Install dependency: `npm install @supabase/supabase-js`.
- Set in Vercel env: **SUPABASE_URL**, **SUPABASE_ANON_KEY** (same as in the app).

(Full code for api/join/[id].js is in the app repo at `api/join/[id].js` or in `invite-page/PASTE_THIS_TO_AI.md` if you need the exact template.)

---

## 2. Add-me page (friend link)

**Goal:** When someone shares `https://bttrsite.vercel.app/add-me/USER_ID`, show a page with Open Graph and an “Open in app” link so they can add that user as a friend.

**Do this:**

- Create **api/add-me/[id].js** (Vercel serverless function) at the repo root. It should:
  - Accept request with `id` (user id from path `/add-me/:id`).
  - Fetch from Supabase table `profiles`, columns `name`, `username`, for that `id`.
  - Return HTML with: `og:title` = “Add [name] on Bttr Together”, `og:image` = `https://bttrsite.vercel.app/fsf.png`, and body with link: `href="bttrtogether://add-me/[id]"` (“Open in app”).
- Add rewrite in **vercel.json**: `{ "source": "/add-me/:id", "destination": "/api/add-me/:id" }`.
- Same fsf.png, Supabase env vars, and `@supabase/supabase-js` as in step 1.

(Full code is in the app repo at `api/add-me/[id].js` or in `invite-page/PASTE_ADD_ME_TO_AI.md`.)

---

## 3. Payout return page (Stripe bank onboarding)

**Goal:** After a user completes Stripe Connect bank onboarding, Stripe redirects to `https://bttrsite.vercel.app/payout-return`. That URL must serve a page that immediately redirects the user back to the app via `bttrtogether://payout`.

**Do this:**

- Serve a page at **/payout-return** that:
  - Shows a short message like “Bank setup complete. Opening Bttr Together…”
  - Redirects to `bttrtogether://payout` (via `<meta http-equiv="refresh">` and/or `window.location.href`).
  - Includes a fallback link: `<a href="bttrtogether://payout">Tap here if the app doesn’t open</a>`.
- Implementation: add a static file **payout-return.html** (e.g. in `public/`) with the content below, and ensure the route **/payout-return** serves it (e.g. put file at `public/payout-return.html` and add a rewrite from `/payout-return` to `/payout-return.html`, or configure your framework so `/payout-return` returns this HTML).

**Content for payout-return.html:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Return to Bttr Together</title>
  <meta http-equiv="refresh" content="2;url=bttrtogether://payout" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: #0a0a0a;
      color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      text-align: center;
    }
    p { font-size: 16px; color: #888; margin: 0 0 16px; }
    a { font-size: 16px; font-weight: 600; color: #4CAF50; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <p>Bank setup complete. Opening Bttr Together…</p>
  <p><a href="bttrtogether://payout">Tap here if the app doesn’t open</a></p>
  <script>window.location.href = 'bttrtogether://payout';</script>
</body>
</html>
```

---

## Summary for bttrsite

- **Join:** `api/join/[id].js` + rewrite `/join/:id` → `/api/join/:id` + `fsf.png` at root + Supabase env.
- **Add-me:** `api/add-me/[id].js` + rewrite `/add-me/:id` → `/api/add-me/:id` (same fsf.png and Supabase env).
- **Payout return:** Page at `/payout-return` that redirects to `bttrtogether://payout` (use the HTML above).
- **vercel.json** should include all three rewrites; keep any existing rewrites you already have.
- **Env vars:** SUPABASE_URL, SUPABASE_ANON_KEY (and fsf.png at root for og:image).

After this, the app can use https://bttrsite.vercel.app for invite links, add-me links, and the Stripe Connect return URL.
