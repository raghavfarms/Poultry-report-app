import { GoogleGenAI } from '@google/genai';

// Cache singleton GoogleGenAI client to keep HTTP/TLS connection open
let cachedAiClient = null;
let cachedKey = null;

function getAiClient() {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey || geminiKey.trim() === '' || geminiKey === 'YOUR_GEMINI_API_KEY') {
    return null;
  }
  if (!cachedAiClient || cachedKey !== geminiKey) {
    cachedKey = geminiKey;
    cachedAiClient = new GoogleGenAI({ apiKey: geminiKey.trim() });
  }
  return cachedAiClient;
}

/**
 * Precision Thermometer Reading Vision Service.
 * Powered by Google Gemini Vision with strict meniscus presence verification.
 */
export async function extractTemperatureFromImage(base64Image, mimeType = 'image/jpeg') {
  if (!base64Image || typeof base64Image !== 'string') {
    return {
      success: false,
      error: 'No image data provided for thermometer scanning.',
    };
  }

  // Normalize base64 image data
  let cleanBase64 = base64Image;
  let cleanMimeType = mimeType;
  if (base64Image.includes(';base64,')) {
    const parts = base64Image.split(';base64,');
    cleanMimeType = parts[0].replace('data:', '') || mimeType;
    cleanBase64 = parts[1];
  }

  const ai = getAiClient();
  if (!ai) {
    return {
      success: false,
      keyMissing: true,
      error: 'Google Gemini API Key is missing. Please configure GEMINI_API_KEY in backend/.env',
    };
  }

  // Strict negative-first meniscus verification prompt
  const prompt = `EXAMINE THIS THERMOMETER IMAGE:
Is this a photograph of a thermometer?
Is the indicator liquid (red, blue, green, or silver) actually present and visible in the central capillary tube?
Where is the meniscus (top boundary of the liquid column)?

CRITICAL NEGATIVE CHECK:
- If this is NOT a thermometer: return detected = false.
- If the capillary tube is EMPTY or clear: return detected = false.
- If the meniscus / top level of the liquid is NOT inside this photo (e.g. photo was taken only of 30°C-50°C and the liquid has not reached this section, or the liquid is cut off): return detected = false.
- DO NOT GUESS OR ESTIMATE. Only return detected = true if the meniscus is clearly visible against the scale marks.

Return strictly JSON:
If meniscus is clearly visible:
{
  "detected": true,
  "hasLiquid": true,
  "temperature": <integer or half-degree number in Celsius on LEFT scale>,
  "liquidColor": "<red|blue|silver|green|other>",
  "reasoning": "<short description of meniscus level relative to scale marks>"
}

If NOT visible or NOT a thermometer:
{
  "detected": false,
  "hasLiquid": false,
  "error": "MENISCUS_NOT_VISIBLE" | "NOT_A_THERMOMETER" | "UNCLEAR_IMAGE",
  "reasoning": "<clear explanation why no reading can be taken>"
}`;

  // Prioritize active fast vision models
  const candidateGeminiModels = [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite-preview',
    'gemini-3.8-flash',
  ];

  for (const model of candidateGeminiModels) {
    try {
      const config = {
        responseMimeType: 'application/json',
      };

      // 9-second timeout to handle mobile image upload + inference without false failure
      const generatePromise = ai.models.generateContent({
        model,
        contents: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: cleanMimeType,
            },
          },
          prompt,
        ],
        config,
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after 9000ms on ${model}`)), 9000)
      );

      const response = await Promise.race([generatePromise, timeoutPromise]);
      const responseText = response.text?.trim() || '';

      // Parse JSON response strictly
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);

          // Handle rejection when meniscus is not in frame or not a thermometer
          if (parsed.detected === false || parsed.hasLiquid === false) {
            return {
              success: false,
              error: parsed.reasoning || 'Liquid level (meniscus) not visible in photo. Please frame the thermometer lower so where the liquid column ends is clearly visible.',
              errorCode: parsed.error || 'MENISCUS_NOT_VISIBLE',
              modelUsed: `Gemini (${model})`,
            };
          }

          const rawVal = parsed.temperature ?? parsed.temp ?? parsed.celsius;
          if (rawVal !== undefined && rawVal !== null) {
            const numVal = parseFloat(rawVal);
            if (!isNaN(numVal) && numVal >= -30 && numVal <= 60) {
              return {
                success: true,
                temperature: Math.round(numVal),
                confidence: 0.98,
                liquidColor: parsed.liquidColor || 'detected',
                reasoning: parsed.reasoning || '',
                modelUsed: `Gemini (${model})`,
              };
            }
          }
        } catch (_) {}
      }
    } catch (gErr) {
      console.warn(`[Gemini Vision] Model ${model} failed or timed out:`, gErr.message);
    }
  }

  // Never return a hardcoded or random number
  return {
    success: false,
    error: 'Could not detect thermometer liquid level. Please ensure the top of the liquid column is inside the camera frame.',
    errorCode: 'NO_READING_DETECTED',
  };
}

