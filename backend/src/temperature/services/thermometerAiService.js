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

  // Comprehensive physical metrology validator closing all loopholes (empty tubes, full tubes, low temps)
  const prompt = `You are a precision physical metrology validator for physical liquid-in-glass poultry shed thermometers.

FULL OPERATING TEMPERATURE RANGE:
- The thermometer operates across the full range from -10°C to 50°C.
- In cold sheds or winter conditions, temperatures below 15°C (such as 5°C, 8°C, 10°C, 12°C, 14°C) ARE COMPLETELY VALID.
- Do NOT assume or bias towards 20°C-30°C. Read the genuine position of the liquid meniscus wherever it rests on the scale.

MANDATORY PHYSICAL MENISCUS RULES (CLOSING ALL LOOPHOLES):
1. WHAT IS THE MENISCUS:
   The meniscus is the visible physical boundary where the colored liquid column (red spirit) ENDS and the clear/empty capillary tube BEGINS.

2. LOOPHOLE 1 - TUBE COMPLETELY EMPTY (Meniscus is below frame):
   If the capillary tube in this photo is clear or empty with NO colored liquid column or no meniscus:
   DO NOT guess or extract any number from the printed scale!
   Return detected=false, error="MENISCUS_BELOW_FRAME", reasoning="Capillary tube is empty in this view. Please point camera lower towards the bulb to capture where the red liquid line ends."

3. LOOPHOLE 2 - TUBE COMPLETELY FULL (Meniscus is above frame):
   If the colored liquid fills the capillary tube from the bottom edge of the photo all the way through to the top edge with NO visible meniscus:
   DO NOT take the top visible number on the scale as the reading! The true liquid level is higher outside this photo.
   Return detected=false, error="MENISCUS_ABOVE_FRAME", reasoning="Liquid column fills the entire view past the top edge. Please point camera higher to capture where the red liquid line ends."

4. LOOPHOLE 3 - NOT A REAL THERMOMETER (Paper / Digital Screen / Wall):
   If this is a piece of paper, printed digits, phone screen, hand, wall, or not an authentic physical liquid-in-glass thermometer:
   Return detected=false, error="NOT_A_THERMOMETER", reasoning="Please point the camera directly at an authentic physical liquid-in-glass poultry shed thermometer."

5. VALID READING (Meniscus transition is clearly inside the frame):
   Only when the actual top meniscus (red liquid stops, clear capillary begins) is visibly positioned between printed numbers inside the frame:
   - Identify the exact Celsius temperature (°C) at the meniscus (can be < 15°C e.g. 10°C, 12°C, or > 20°C e.g. 25°C, 30°C).
   - Cross-check with the Fahrenheit scale (°F) at the exact same horizontal height: F ≈ C * 1.8 + 32.

Return strictly JSON:
If valid meniscus transition is visible and authentic:
{
  "detected": true,
  "hasLiquid": true,
  "temperature": <integer Celsius reading>,
  "celsiusExact": <float or int>,
  "fahrenheitExact": <float or int>,
  "crossValidated": true,
  "reasoning": "<clear explanation of meniscus level, Celsius tick, and Fahrenheit cross-check>"
}

If rejected (empty tube, full tube, fake object, or unclear):
{
  "detected": false,
  "hasLiquid": false,
  "error": "MENISCUS_BELOW_FRAME" | "MENISCUS_ABOVE_FRAME" | "NOT_A_THERMOMETER" | "UNCLEAR_IMAGE",
  "reasoning": "<specific instruction telling the user how to move camera>"
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
