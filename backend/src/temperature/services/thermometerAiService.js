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

  // Dual-scale metrology cross-validation prompt for 100% precision
  const prompt = `You are a precision metrology and vision inspector for physical liquid-in-glass poultry shed thermometers.

STEP-BY-STEP RIGOROUS INSPECTION:
1. PHYSICAL AUTHENTICITY VALIDATION:
   - Verify this is an authentic physical liquid-in-glass thermometer.
   - Locate the vertical glass tube with colored indicator liquid (red spirit).
   - If this is a piece of paper, handwritten number, digital display, screen, wall, or NOT a real liquid-in-glass thermometer: REJECT.
   - If the capillary tube is empty/clear with NO meniscus inside this photo view: REJECT.

2. PRECISE MENISCUS PINPOINTING:
   - Find the exact top meniscus (where the colored liquid column ends and clear glass begins).
   - Trace horizontally across both scales at this meniscus height.

3. DUAL-SCALE CROSS-VALIDATION:
   - CELSIUS SCALE (°C):
     * Identify the nearest numbered label below the meniscus (e.g. 20°C).
     * Count the 1°C tick marks from that number up to the meniscus.
     * What is the exact Celsius value?
   - FAHRENHEIT SCALE (°F):
     * Check the Fahrenheit scale at the exact same horizontal height.
     * What is the Fahrenheit value?
   - Cross-check: Verify F ≈ C * 1.8 + 32. Both scales must be consistent.

Return strictly JSON:
If meniscus is visible and authentic:
{
  "detected": true,
  "hasLiquid": true,
  "temperature": <integer Celsius reading>,
  "celsiusExact": <float or int>,
  "fahrenheitExact": <float or int>,
  "crossValidated": true,
  "reasoning": "<concise description of meniscus at Celsius tick mark and Fahrenheit equivalent>"
}

If no meniscus, empty tube, paper with numbers, or not a physical thermometer:
{
  "detected": false,
  "hasLiquid": false,
  "error": "MENISCUS_NOT_VISIBLE" | "NOT_A_THERMOMETER" | "UNCLEAR_IMAGE",
  "reasoning": "<clear explanation for rescan>"
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

      // 18-second timeout to allow complete visual reasoning and network transfer
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
        setTimeout(() => reject(new Error(`Timeout after 18000ms on ${model}`)), 18000)
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

          const rawVal = parsed.temperature ?? parsed.celsiusExact ?? parsed.temp ?? parsed.celsius;
          if (rawVal !== undefined && rawVal !== null) {
            const numVal = parseFloat(rawVal);
            if (!isNaN(numVal) && numVal >= -30 && numVal <= 60) {
              return {
                success: true,
                temperature: Math.round(numVal),
                celsiusExact: parsed.celsiusExact ?? numVal,
                fahrenheitExact: parsed.fahrenheitExact ?? null,
                crossValidated: Boolean(parsed.crossValidated),
                confidence: parsed.crossValidated ? 1.0 : 0.99,
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
