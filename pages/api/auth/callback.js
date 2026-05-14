export default async function handler(req, res) {
  try {
    const { code, shop } = req.query;

    if (!code || !shop) {
      return res.status(400).send('Missing code or shop parameter. code=' + code + ' shop=' + shop);
    }

    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        code,
      }),
    });

    const text = await tokenRes.text();
    let data;
    try { data = JSON.parse(text); } catch { return res.status(500).send('Non-JSON response: ' + text); }

    if (!data.access_token) {
      return res.status(500).send('Failed to get token: ' + JSON.stringify(data));
    }

    return res.status(200).send(`
      <html>
        <body style="font-family:sans-serif;padding:40px;background:#0a1a0f;color:#fff;">
          <h2>Access Token Retrieved</h2>
          <p>Copy this and add it as <strong>SHOPIFY_ACCESS_TOKEN</strong> in Netlify env vars:</p>
          <code style="background:#1a3d1a;padding:12px;display:block;margin-top:12px;word-break:break-all;">
            ${data.access_token}
          </code>
        </body>
      </html>
    `);
  } catch (err) {
    return res.status(500).send('Exception: ' + err.message);
  }
}
