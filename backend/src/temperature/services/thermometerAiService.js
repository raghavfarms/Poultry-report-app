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

  // Precision physical liquid meniscus verification prompt
  const prompt = `You are a precision computer vision analyzer for physical liquid-in-glass poultry shed thermometers.

TASK:
1. Determine if this image shows a physical thermometer.
2. Locate the glass capillary tube and the colored indicator liquid column (usually red or blue spirit, or mercury).
3. Find the top meniscus (where the colored liquid column ends).
4. Read the corresponding temperature in degrees Celsius (°C) from the Celsius scale (marked with °C, usually with gradations like 0, 10, 20, 30, 40, 50°C).

RULES:
- If this is a real thermometer and the colored liquid meniscus is visible:
  Set detected = true, hasLiquid = true, and provide the exact Celsius temperature (e.g. 24, 25, 26).
- If this is NOT a thermometer (e.g. wall, random paper, floor, blank):
  Set detected = false, hasLiquid = false, error = "NOT_A_THERMOMETER", reasoning = "Please point the camera directly at the thermometer."
- If the thermometer tube is visible but completely empty/clear with NO colored liquid meniscus in this view:
  Set detected = false, hasLiquid = false, error = "MENISCUS_NOT_VISIBLE", reasoning = "Liquid level not visible in frame. Move camera to include where the red liquid line ends."

Return strictly JSON:
If meniscus is visible:
{
  "hasLiquid": true,
  "detected": true,
  "temperature": <number in Celsius>,
  "reasoning": "<short description of liquid meniscus position>"
}

If no meniscus or not a thermometer:
{
  "hasLiquid": false,
  "detected": false,
  "error": "MENISCUS_NOT_VISIBLE" | "NOT_A_THERMOMETER" | "UNCLEAR_IMAGE",
  "reasoning": "<helpful rescan tip for user>"
}`;

  // Prioritize active quota-available fast vision models first, then frontier fallbacks
  const candidateGeminiModels = [
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.5-flash',
  ];

  for (const model of candidateGeminiModels) {
    try {
      const config = {
        responseMimeType: 'application/json',
      };

      // 8-second timeout for prompt response
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
        setTimeout(() => reject(new Error(`Timeout after 8000ms on ${model}`)), 8000)
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
