const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Allow large JSON bodies so we can POST base64-encoded screenshots.
app.use(express.json({ limit: '15mb' }));

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

/**
 * POST /api/detect
 * Body: { image: "<base64 jpeg/png without data: prefix>" }
 * Proxies the image to the Roboflow hosted inference API and returns its JSON.
 * Requires ROBOFLOW_API_KEY and ROBOFLOW_MODEL env vars (e.g. "playing-cards-ow27d/2").
 */
app.post('/api/detect', async (req, res) => {
  try {
    const apiKey = process.env.ROBOFLOW_API_KEY;
    const model = process.env.ROBOFLOW_MODEL;
    if (!apiKey || !model) {
      return res.status(500).json({
        error: 'Roboflow not configured. Set ROBOFLOW_API_KEY and ROBOFLOW_MODEL env vars.'
      });
    }
    const { image } = req.body || {};
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'Missing image in request body.' });
    }

    const url = `https://serverless.roboflow.com/${model}?api_key=${encodeURIComponent(apiKey)}`;
    const rfRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: image // Roboflow accepts a raw base64 string as the body
    });

    const text = await rfRes.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!rfRes.ok) {
      return res.status(rfRes.status).json({ error: 'Roboflow error', detail: data });
    }
    res.json(data);
  } catch (err) {
    console.error('Detect error:', err);
    res.status(500).json({ error: 'Detect failed', detail: String(err && err.message || err) });
  }
});

// SPA fallback for any other GET
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Blackjack Counter running on http://localhost:${PORT}`);
});
