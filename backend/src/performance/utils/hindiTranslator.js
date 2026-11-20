/**
 * Automatic Hindi Translator & Transliteration Helper
 * Converts any Hinglish / Romanized text (e.g. 'bataye chale gye', 'kya worker late aya')
 * into clean Hindi in Devanagari script using Google Input Tools transliteration.
 */

export async function convertToHindi(text) {
  if (!text || typeof text !== 'string') return text;
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  // 1. If text is already pure Hindi Devanagari (\u0900-\u097F) with no English letters
  if (/[\u0900-\u097F]/.test(trimmed) && !/[a-zA-Z]/.test(trimmed)) {
    return trimmed.endsWith('?') ? trimmed : `${trimmed}?`;
  }

  // 2. Transliterate Romanized / Hinglish text to Hindi Devanagari
  try {
    const rawText = trimmed.replace(/[\?؟!\.]/g, '').trim();
    if (!rawText) return trimmed.endsWith('?') ? trimmed : `${trimmed}?`;

    const url = `https://inputtools.google.com/request?text=${encodeURIComponent(rawText)}&itc=hi-t-i0-und&num=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json',
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (data[0] === 'SUCCESS' && Array.isArray(data[1])) {
        // Collect transliterated words or full phrase
        let hindiResult = '';
        if (data[1][0]?.[1]?.[0]) {
          hindiResult = data[1][0][1][0].trim();
        }

        if (hindiResult) {
          return hindiResult.endsWith('?') ? hindiResult : `${hindiResult}?`;
        }
      }
    }
  } catch (err) {
    console.warn('Google InputTools transliteration error:', err.message);
  }

  // Fallback: return original text with question mark
  return trimmed.endsWith('?') ? trimmed : `${trimmed}?`;
}
