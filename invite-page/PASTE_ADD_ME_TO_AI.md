# Copy everything below this line and paste it to the other AI (second prompt – Add Me page)

---

Add the "Add me" (friend) page to the bttrsite Vercel project so that when users share their profile link it goes through the site (https://bttrsite.vercel.app/add-me/USER_ID) instead of a raw deep link. The page should show a rich preview in iMessage and have an "Open in app" button that opens the deep link (bttrtogether://add-me/USER_ID). Do the following in the bttrsite repo:

1) Create the API route for the Add Me page

Create a file at the root of the bttrsite repo:

Path: api/add-me/[id].js

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

function getAddMePageHtml(id, userName, requestUrl) {
  const title = userName ? `Add ${escapeHtml(userName)} on Bttr Together` : 'Add on Bttr Together';
  const pageUrl = requestUrl || `${BASE_URL}/add-me/${id}`;
  return `<!DOCTYPE html>
<html lang="en" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="Add them as a friend in the Bttr Together app." />
  <meta property="og:image" content="${IMAGE_URL}" />
  <meta property="og:url" content="${pageUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="Add them as a friend in the Bttr Together app." />
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
  <p>Tap below to open in the app and add them as a friend.</p>
  <a href="bttrtogether://add-me/${escapeHtml(id)}" id="open-app">Open in app</a>
</body>
</html>`;
}

module.exports = async (req, res) => {
  const id = req.query.id;
  if (!id) {
    res.status(404).setHeader('Content-Type', 'text/html').end(
      getAddMePageHtml('', null, `${BASE_URL}/add-me`)
    );
    return;
  }

  let userName = null;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseAnonKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data } = await supabase
        .from('profiles')
        .select('name, username')
        .eq('id', id)
        .maybeSingle();
      if (data) userName = data.name || data.username || null;
    } catch (_) {
      // keep userName null
    }
  }

  const requestUrl = `${BASE_URL}/add-me/${id}`;
  const html = getAddMePageHtml(id, userName, requestUrl);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).end(html);
};
```

2) Add the rewrite for the Add Me page

In vercel.json, add this rewrite to the existing rewrites array (keep the join rewrite if present):
{"source":"/add-me/:id","destination":"/api/add-me/:id"}

So rewrites should include both:
- {"source":"/join/:id","destination":"/api/join/:id"}
- {"source":"/add-me/:id","destination":"/api/add-me/:id"}

3) No new assets or env vars

The Add Me page uses the same fsf.png and the same SUPABASE_URL / SUPABASE_ANON_KEY as the join page. If the join page is already set up, no extra steps are needed.

When done, https://bttrsite.vercel.app/add-me/USER_ID will serve a page with Open Graph meta (so iMessage shows a rich preview like "Add [name] on Bttr Together") and an "Open in app" link that opens bttrtogether://add-me/USER_ID in the app.
