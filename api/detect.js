// Vercel serverless function: POST /api/detect
// Body: { image: "<base64 jpeg>" }
// Sends the image to Claude Haiku vision to identify playing cards.
// Requires ANTHROPIC_API_KEY env var on Vercel.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'ANTHROPIC_API_KEY not configured in Vercel environment variables.'
      });
    }

    const body = req.body || {};
    const image = typeof body === 'string' ? JSON.parse(body).image : body.image;
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'Missing "image" (base64 string) in request body.' });
    }

    // Call Claude Haiku (cheapest vision model) to identify cards.
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: image
              }
            },
            {
              type: 'text',
              text: `You are analyzing a screenshot of an online blackjack game. List every playing card that is clearly visible and face-up on the table. Ignore face-down cards, chips, buttons, and UI text.

Return ONLY a JSON array of card strings using this exact format:
- Number cards: "2","3","4","5","6","7","8","9","10"
- Face cards: "J","Q","K"
- Ace: "A"

Include suit as a single letter suffix: S=spades, H=hearts, D=diamonds, C=clubs.

Examples: ["AS","10H","KD","5C","7S"]

If no face-up cards are visible, return an empty array: []

Return ONLY the JSON array, nothing else.`
            }
          ]
        }]
      })
    });

    const claudeData = await claudeRes.json();

    if (!claudeRes.ok) {
      console.error('Claude API error:', JSON.stringify(claudeData));
      return res.status(claudeRes.status).json({
        error: 'Claude API error',
        detail: claudeData.error ? claudeData.error.message : JSON.stringify(claudeData)
      });
    }

    // Extract the text content from Claude's response.
    const textBlock = (claudeData.content || []).find(b => b.type === 'text');
    const rawText = textBlock ? textBlock.text.trim() : '[]';

    // Parse the JSON array from Claude's response. Be lenient about markdown wrapping.
    let cards = [];
    try {
      const jsonStr = rawText.replace(/```json\s*/g, '').replace(/```/g, '').trim();
      cards = JSON.parse(jsonStr);
      if (!Array.isArray(cards)) cards = [];
    } catch {
      console.error('Failed to parse Claude response as JSON:', rawText);
      cards = [];
    }

    // Return in a format compatible with the front-end: { cards: ["AS","10H",...] }
    return res.status(200).json({ cards });
  } catch (err) {
    console.error('Detect error:', err);
    return res.status(500).json({
      error: 'Detect failed',
      detail: String((err && err.message) || err)
    });
  }
};
