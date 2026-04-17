import { kv } from '@vercel/kv';

const RATE_LIMIT_SECONDS = 120; // 2 minutes

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  // ── Rate limiting ────────────────────────────────────────────────────────────
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown';

  const rateLimitKey = `rate_limit:${ip}`;

  try {
    const lastRequest = await kv.get(rateLimitKey);

    if (lastRequest) {
      const secondsElapsed = (Date.now() - Number(lastRequest)) / 1000;
      const secondsRemaining = Math.ceil(RATE_LIMIT_SECONDS - secondsElapsed);

      if (secondsElapsed < RATE_LIMIT_SECONDS) {
        return res.status(429).json({
          error: `Rate limit exceeded. Please wait ${secondsRemaining} second${secondsRemaining === 1 ? '' : 's'} before generating again.`,
          retryAfter: secondsRemaining,
        });
      }
    }

    await kv.set(rateLimitKey, Date.now(), { ex: RATE_LIMIT_SECONDS });
  } catch (kvErr) {
    // If KV is unavailable, log and continue rather than blocking the user
    console.error('KV rate limit error:', kvErr.message);
  }

  // ── Proxy to Anthropic ───────────────────────────────────────────────────────
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Upstream request failed' });
  }
}
