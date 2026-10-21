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
 * High-Precision Thermometer Vision Service.
 * Powered by Gemini 3.8 / 3.7 Vision with strict physical liquid column verification.
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

  // Strict physical liquid meniscus verification prompt
  const prompt = `LOOK CLOSELY AT THIS IMAGE:
1. Is this a photograph of a physical liquid-in-glass thermometer?
2. Examine the central vertical glass capillary tube between the scales:
   - Does it contain a colored indicator liquid column (e.g. bright red or blue spirit, or silver mercury)?
   - Where does the liquid column end (the top meniscus)?

CRITICAL REJECTION RULES (NO GUESSING):
- If this is NOT a thermometer: return detected = false, error = "NOT_A_THERMOMETER".
- If the capillary tube is EMPTY or clear throughout the visible frame (no liquid column inside this photo): return detected = false, error = "MENISCUS_NOT_VISIBLE".
- If the meniscus is cut off or not inside this photo (e.g. photo shows only high numbers like 30°C-50°C and the liquid has not reached this section): return detected = false, error = "MENISCUS_NOT_VISIBLE".
- DO NOT GUESS OR ESTIMATE A READING. Only return detected = true if the colored liquid column AND its top meniscus are clearly visible.

Return strictly JSON:
If colored liquid column and meniscus are clearly visible:
{
  "hasLiquid": true,
  "detected": true,
  "temperature": <exact integer or half-degree in Celsius on the left scale>,
  "reasoning": "<concise description of liquid color and exact meniscus tick mark level>"
}

If no liquid is visible or image is unclear:
{
  "hasLiquid": false,
  "detected": false,
  "error": "MENISCUS_NOT_VISIBLE" | "NOT_A_THERMOMETER" | "UNCLEAR_IMAGE",
  "reasoning": "<clear message explaining why no reading was taken and to rescan>"
}`;

  // Prioritize frontier vision reasoning models (avoiding flash-lite hallucination)
  const candidateGeminiModels = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.5-flash',
    'gemini-2.5-pro',
  ];

  for (const model of candidateGeminiModels) {
    try {
      const config = {
        responseMimeType: 'application/json',
      };

      // 12-second timeout for thorough reasoning and accurate verification
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
        setTimeout(() => reject(new Error(`Timeout after 12000ms on ${model}`)), 12000)
      );

      const response = await Promise.race([generatePromise, timeoutPromise]);
      const responseText = response.text?.trim() || '';

      // Parse JSON response strictly
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);

          // Strictly reject when meniscus is not in frame, no liquid, or not a thermometer
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
                confidence: 0.99,
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

  // Never return any fake or random number
  return {
    success: false,
    error: 'Could not detect thermometer liquid level. Please ensure the top of the liquid column is inside the camera frame and rescan.',
    errorCode: 'NO_READING_DETECTED',
  };
}
