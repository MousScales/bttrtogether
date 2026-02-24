# Copy everything below this line and paste it to the other AI

---

Set up the bttrsite Vercel project (the site that deploys to https://bttrsite.vercel.app) so that invite links from the Bttr Together app show a rich preview in iMessage: one card with an image, the title "Join [challenge name]", and the domain. The app shares links like https://bttrsite.vercel.app/join/<goal_list_id>. Do the following in the bttrsite repo:

1) Create the API route (Vercel serverless function)

Create a file at the root of the bttrsite repo:

Path: api/join/[id].js

Contents (copy exactly):

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

2) Add the rewrite so /join/:id is handled by the API

If the project does not have a vercel.json at the root, create one with:
{"rewrites":[{"source":"/join/:id","destination":"/api/join/:id"}]}

If the project already has a vercel.json, add this object to the existing rewrites array: {"source":"/join/:id","destination":"/api/join/:id"}

3) Serve the preview image at the root

The page references https://bttrsite.vercel.app/fsf.png. The site must serve that file at /fsf.png.
- Next.js: put the image at public/fsf.png.
- Other setups: put fsf.png in the static/asset root so it is served at /fsf.png.
The image is the app icon; the user will provide fsf.png or it can be copied from the Bttr Together app repo assets/fsf.png.

4) Install Supabase in the bttrsite project

Run in the bttrsite repo: npm install @supabase/supabase-js

5) Set Vercel environment variables

In Vercel dashboard for the bttrsite project, go to Settings → Environment Variables and add:
- SUPABASE_URL (Supabase project URL, e.g. https://xxxx.supabase.co)
- SUPABASE_ANON_KEY (Supabase anon/public key)

Use the same values as in the Bttr Together app. Redeploy after adding them.

When done, requests to https://bttrsite.vercel.app/join/<goal_list_id> should return HTML with the challenge name in the og:title so iMessage shows one rich preview card (image + "Join [challenge name]" + domain).
