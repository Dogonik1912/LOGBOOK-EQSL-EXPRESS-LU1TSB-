const SUPPORTED_LANGUAGES = new Set([
  'en', 'pt', 'pt-br', 'fr', 'de', 'it', 'nl', 'pl', 'ru', 'uk', 'zh', 'ja', 'ko',
  'ar', 'hi', 'tr', 'sv', 'no', 'da', 'fi', 'cs', 'el', 'ro', 'hu', 'id',
]);

const cache = new Map<string, string>();

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const language = typeof req.body?.language === 'string' ? req.body.language.toLowerCase() : '';

  if (!text || text.length > 500 || !SUPPORTED_LANGUAGES.has(language)) {
    return res.status(400).json({ error: 'Invalid translation request' });
  }
  if (language === 'es') return res.status(200).json({ translated: text });

  const cacheKey = language + '\u0000' + text;
  const cached = cache.get(cacheKey);
  if (cached) return res.status(200).json({ translated: cached });

  try {
    const endpoint = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl='
      + encodeURIComponent(language) + '&dt=t&q=' + encodeURIComponent(text);
    const upstream = await fetch(endpoint, { headers: { Accept: 'application/json' } });
    if (!upstream.ok) {
      return res.status(502).json({ error: 'Translation provider unavailable' });
    }
    const data = await upstream.json();
    const translated = Array.isArray(data?.[0])
      ? data[0].map((part: any) => part?.[0] || '').join('')
      : '';
    if (!translated) return res.status(502).json({ error: 'Empty translation result' });

    cache.set(cacheKey, translated);
    if (cache.size > 1500) cache.delete(cache.keys().next().value as string);
    return res.status(200).json({ translated });
  } catch {
    return res.status(502).json({ error: 'Translation provider unavailable' });
  }
}
