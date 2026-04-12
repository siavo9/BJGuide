// Vercel serverless function: POST /api/detect
// Body: { image: "<base64 jpeg>" }
// Sends the image to Claude Haiku vision to identify playing cards, player hand, and dealer upcard.
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

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
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
              text: `You are analyzing a screenshot of an online blackjack game. Identify ALL face-up playing cards visible on the table. Ignore face-down cards (shown as a solid color or pattern with no rank/suit visible), chips, buttons, and UI elements.

Return a JSON object with exactly these fields:

{
  "allCards": ["6C","5S","9H"],
  "playerCards": ["6C","5S"],
  "dealerUpcard": "9H"
}

Rules:
- "allCards": every face-up card on the table (player + dealer combined). Use rank + suit: 2-10, J, Q, K, A followed by S/H/D/C.
- "playerCards": only the cards in the player's hand (usually the left or bottom hand).
- "dealerUpcard": the single face-up dealer card (usually the right or top hand). If the dealer has multiple face-up cards, list only the original upcard if identifiable, otherwise the first one.
- If a card's suit is unclear, make your best guess — the suit does not affect gameplay.
- Do NOT include face-down cards, card backs, or cards you cannot clearly read.
- If no cards are visible, return {"allCards":[],"playerCards":[],"dealerUpcard":null}

Return ONLY the JSON object, nothing else.`
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

    const textBlock = (claudeData.content || []).find(b => b.type === 'text');
    const rawText = textBlock ? textBlock.text.trim() : '{}';

    let parsed = {};
    try {
      const jsonStr = rawText.replace(/```json\s*/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error('Failed to parse Claude response as JSON:', rawText);
      parsed = { allCards: [], playerCards: [], dealerUpcard: null };
    }

    return res.status(200).json({
      allCards: Array.isArray(parsed.allCards) ? parsed.allCards : [],
      playerCards: Array.isArray(parsed.playerCards) ? parsed.playerCards : [],
      dealerUpcard: parsed.dealerUpcard || null
    });
  } catch (err) {
    console.error('Detect error:', err);
    return res.status(500).json({
      error: 'Detect failed',
      detail: String((err && err.message) || err)
    });
  }
};
