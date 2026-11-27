/**
 * Captures a lightweight compressed JPEG snapshot from a live <video> element
 * for 7-day punch audit proof. Never throws so attendance punching is never blocked.
 */
function encodeVideoFrame(videoEl, maxWidth, quality) {
  const scale = Math.min(1, maxWidth / videoEl.videoWidth);
  const width = Math.max(1, Math.round(videoEl.videoWidth * scale));
  const height = Math.max(1, Math.round(videoEl.videoHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(videoEl, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

export function capturePunchFrame(videoEl, { maxWidth = 320, quality = 0.55 } = {}) {
  try {
    if (!videoEl || videoEl.readyState < 2 || !videoEl.videoWidth || !videoEl.videoHeight) {
      return null;
    }

    // 1st attempt: 320px wide @ 55% JPEG (~12-20 KB even from a 4K camera)
    let dataUrl = encodeVideoFrame(videoEl, maxWidth, quality);

    // Fallback: if unusually detailed frame is still > 120 KB chars, shrink further to 240px @ 35%
    if (dataUrl && dataUrl.length > 120000) {
      dataUrl = encodeVideoFrame(videoEl, 240, 0.35);
    }

    if (!dataUrl || !dataUrl.startsWith('data:image/jpeg;base64,') || dataUrl.length > 140000) {
      return null;
    }
    return dataUrl;
  } catch {
    return null;
  }
}
