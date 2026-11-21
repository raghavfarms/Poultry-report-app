/**
 * Automatic Hindi Translator & Transliteration Helper
 * Converts Romanized / Hinglish text to clean Hindi in Devanagari script
 * while safely preserving uppercase acronyms like 'AI', 'CCTV', 'SOP'.
 */

export async function convertToHindi(text) {
  if (!text || typeof text !== 'string') return text;
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  // 1. If text is already pure Hindi Devanagari (\u0900-\u097F) with no English letters
  if (/[\u0900-\u097F]/.test(trimmed) && !/[a-zA-Z]/.test(trimmed)) {
    return trimmed.endsWith('?') ? trimmed : `${trimmed}?`;
  }

  // 2. Normalize 'A I' or 'A.I.' to standard 'AI'
  let normalized = trimmed
    .replace(/\bA\s+I\b/gi, 'AI')
    .replace(/\bA\.I\.\b/gi, 'AI');

  // Identify acronyms or English words to preserve (e.g. AI, CCTV, SOP, etc.)
  const acronymRegex = /\b(AI|CCTV|SOP|RO|GPS|KG|GM|PVC|AC|LED)\b/gi;

  // Split into tokens of acronyms vs regular text
  const tokens = [];
  let lastIndex = 0;
  let match;

  while ((match = acronymRegex.exec(normalized)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', val: normalized.slice(lastIndex, match.index) });
    }
    tokens.push({ type: 'acronym', val: match[0].toUpperCase() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < normalized.length) {
    tokens.push({ type: 'text', val: normalized.slice(lastIndex) });
  }

  // Transliterate each regular text segment
  const convertedTokens = await Promise.all(
    tokens.map(async (tok) => {
      if (tok.type === 'acronym') return tok.val;
      const rawText = tok.val.replace(/[\?؟!\.]/g, '').trim();
      if (!rawText) return tok.val;

      try {
        const url = `https://inputtools.google.com/request?text=${encodeURIComponent(rawText)}&itc=hi-t-i0-und&num=1`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': 'application/json',
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (data[0] === 'SUCCESS' && data[1]?.[0]?.[1]?.[0]) {
            return data[1][0][1][0].trim();
          }
        }
      } catch (err) {
        console.warn('Google InputTools transliteration warning:', err.message);
      }
      return tok.val;
    })
  );

  let finalResult = convertedTokens.join(' ').replace(/\s+/g, ' ').trim();
  if (finalResult && !finalResult.endsWith('?')) {
    finalResult = `${finalResult}?`;
  }
  return finalResult || trimmed;
}
