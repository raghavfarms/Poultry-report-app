async function convertToHindi(text) {
  if (!text) return text;
  const clean = text.trim();
  if (/[\u0900-\u097F]/.test(clean) && !/[a-zA-Z]/.test(clean)) {
    return clean.endsWith('?') ? clean : clean + '?';
  }

  try {
    const rawText = clean.replace(/[\?؟]/g, '').trim();
    const url = 'https://inputtools.google.com/request?text=' + encodeURIComponent(rawText) + '&itc=hi-t-i0-und&num=1';
    const res = await fetch(url);
    const data = await res.json();
    if (data[0] === 'SUCCESS' && data[1]?.[0]?.[1]?.[0]) {
      let hindi = data[1][0][1][0].trim();
      return hindi.endsWith('?') ? hindi : hindi + '?';
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
  return clean.endsWith('?') ? clean : clean + '?';
}

async function run() {
  console.log('1:', await convertToHindi('bataye chale gye?'));
  console.log('2:', await convertToHindi('batein chale gye?'));
  console.log('3:', await convertToHindi('kya worker late aya'));
  console.log('4:', await convertToHindi('avckm'));
  console.log('5:', await convertToHindi('ka'));
}
run();
