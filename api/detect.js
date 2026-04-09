// Vercel serverless function: POST /api/detect
// Body: { image: "<base64 jpeg without data: prefix>" }
// Proxies to Roboflow hosted inference and returns the JSON predictions.
// Requires ROBOFLOW_API_KEY and ROBOFLOW_MODEL env vars on Vercel.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.ROBOFLOW_API_KEY;
    const model = process.env.ROBOFLOW_MODEL;
    if (!apiKey || !model) {
      return res.status(500).json({
        error: 'Roboflow not configured. Set ROBOFLOW_API_KEY and ROBOFLOW_MODEL env vars on Vercel.'
      });
    }

    // Vercel auto-parses JSON bodies for Node serverless functions.
    const body = req.body || {};
    const image = typeof body === 'string' ? JSON.parse(body).image : body.image;
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'Missing "image" (base64 string) in request body.' });
    }

    // Lower confidence/overlap thresholds to give stylized/illustrated cards a chance to match.
    const params = new URLSearchParams({
      api_key: apiKey,
      confidence: '15',
      overlap: '30'
    });
    const url = `https://serverless.roboflow.com/${model}?${params.toString()}`;
    const rfRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: image // Roboflow accepts a raw base64 string as the request body.
    });

    const text = await rfRes.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!rfRes.ok) {
      return res.status(rfRes.status).json({ error: 'Roboflow error', detail: data });
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error('Detect error:', err);
    return res.status(500).json({
      error: 'Detect failed',
      detail: String((err && err.message) || err)
    });
  }
};

// Allow larger JSON bodies (base64 JPEG frames can exceed the 1MB default).
module.exports.config = {
  api: {
    bodyParser: { sizeLimit: '10mb' }
  }
};
