# Prompt for the other AI: Set up invite join page on bttrsite (Vercel)

**Context:** The mobile app "Bttr Together" shares invite links like `https://bttrsite.vercel.app/join/<goal_list_id>`. We need the **bttrsite** Vercel project (the one that deploys to https://bttrsite.vercel.app) to serve a dynamic invite page at `/join/:id` so that when someone shares the link in iMessage (or similar), it shows a **single rich preview card** (like Snapchat): image on top, title "Join [challenge name]", then the domain. The challenge name comes from Supabase (`goal_lists.name`).

**Do the following on the bttrsite repo (the Vercel site project):**

---

## 1. Create the API route (Vercel serverless function)

Create this file at the **root** of the bttrsite repo:

**Path:** `api/join/[id].js`

**Contents:** (copy exactly)

```js
const { createClient } = require('@supabase/supabase-js');

const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : process.env.BTTRSITE_BASE_URL || 'https://bttrsite.vercel.app';
const IMAGE_URL = `${BASE_URL}/fsf.png`;

function escapeHtml(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getJoinPageHtml(id, challengeName, requestUrl) {
  const title = challengeName ? `Join "${escapeHtml(challengeName)}"` : 'Join on Bttr Together';
  const pageUrl = requestUrl || `${BASE_URL}/join/${id}`;
  return `<!DOCTYPE html>
<html lang="en" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="You're invited to join a challenge. Open in the app to join." />
  <meta property="og:image" content="${IMAGE_URL}" />
  <meta property="og:url" content="${pageUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="You're invited to join a challenge." />
  <meta name="twitter:image" content="${IMAGE_URL}" />
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
    img { width: 80px; height: 80px; margin-bottom: 24px; }
    h1 { font-size: 22px; font-weight: 500; margin: 0 0 8px; }
    p { font-size: 15px; color: #888; margin: 0 0 32px; }
    a {
      display: inline-block;
      padding: 14px 32px;
      font-size: 17px;
      font-weight: 600;
      color: #fff;
      text-decoration: none;
      text-shadow: 0 0 12px rgba(255,255,255,0.8);
    }
    a:active { opacity: 0.9; }
  </style>
</head>
<body>
  <img src="/fsf.png" alt="Bttr Together" />
  <h1>${escapeHtml(title)}</h1>
  <p>You're invited to join a challenge. Tap below to open in the app.</p>
  <a href="bttrtogether://join/${escapeHtml(id)}" id="open-app">Open in app</a>
</body>
</html>`;
}

module.exports = async (req, res) => {
  const id = req.query.id;
  if (!id) {
    res.status(404).setHeader('Content-Type', 'text/html').end(
      getJoinPageHtml('', null, `${BASE_URL}/join`)
    );
    return;
  }

  let challengeName = null;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseAnonKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data } = await supabase
        .from('goal_lists')
        .select('name')
        .eq('id', id)
        .maybeSingle();
      if (data && data.name) challengeName = data.name;
    } catch (_) {
      // keep challengeName null, use fallback title
    }
  }

  const requestUrl = `${BASE_URL}/join/${id}`;

  const html = getJoinPageHtml(id, challengeName, requestUrl);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).end(html);
};
```

---

## 2. Add the rewrite so `/join/:id` is handled by the API

- If the project **does not have** a `vercel.json` at the root, create one with:

```json
{
  "rewrites": [
    { "source": "/join/:id", "destination": "/api/join/:id" }
  ]
}
```

- If the project **already has** a `vercel.json`, add this rewrite to the existing `rewrites` array (do not remove other rewrites):  
  `{ "source": "/join/:id", "destination": "/api/join/:id" }`

Result: requests to `https://bttrsite.vercel.app/join/<id>` are served by the serverless function above.

---

## 3. Serve the preview image at the root

The Open Graph meta tags point to `https://bttrsite.vercel.app/fsf.png`. The site must serve that URL.

- **Next.js:** Put the image file at `public/fsf.png` (so it is served as `/fsf.png`).
- **Other static / Vite / CRA:** Put `fsf.png` in the folder that is the static/asset root so the built site serves it at `/fsf.png`.

The image file itself is the app icon: **copy `assets/fsf.png` from the Bttr Together mobile app repo** (or get `fsf.png` from the user) and place it in that public/static root.

---

## 4. Install Supabase in the bttrsite project

In the bttrsite repo run:

```bash
npm install @supabase/supabase-js
```

(If it’s already installed, skip this.)

---

## 5. Set Vercel environment variables

In the Vercel dashboard for the **bttrsite** project:

- **Settings → Environment Variables**

Add (use the same values as in the Bttr Together app):

- **`SUPABASE_URL`** – Supabase project URL (e.g. `https://xxxx.supabase.co`).
- **`SUPABASE_ANON_KEY`** – Supabase anonymous/public key.

Redeploy after adding or changing env vars so the serverless function can read them.

---

## 6. Summary checklist

- [ ] File `api/join/[id].js` exists at repo root with the exact code above.
- [ ] `vercel.json` includes the rewrite: `"source": "/join/:id"` → `"destination": "/api/join/:id"`.
- [ ] `fsf.png` is served at the site root (e.g. `public/fsf.png` for Next.js).
- [ ] `@supabase/supabase-js` is in `package.json` (npm install done).
- [ ] `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set in Vercel for this project.
- [ ] Project is deployed; then test: open `https://bttrsite.vercel.app/join/<some-valid-goal-list-uuid>` and confirm the page shows and the HTML has `<meta property="og:title" content="Join &quot;...&quot;" />` with the challenge name.

After this, when the app shares `https://bttrsite.vercel.app/join/<goal_list_id>`, iMessage (and similar) will show one rich preview card: image, "Join [challenge name]", and bttrsite.vercel.app.
