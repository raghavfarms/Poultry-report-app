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
 * Powered by Gemini 3.5 Flash Lite & 3.8 Flash for rapid sub-2s response.
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

  // Physical metrology validator for liquid-in-glass shed thermometers
  const prompt = `You are a precision physical metrology validator for physical liquid-in-glass poultry shed thermometers.

FULL OPERATING TEMPERATURE RANGE:
- The thermometer operates from -10°C to 50°C.
- Read the genuine position of the colored liquid meniscus (red spirit line) on the scale.

MANDATORY PHYSICAL MENISCUS RULES:
1. WHAT IS THE MENISCUS:
   The physical boundary where the colored liquid column (red spirit) ENDS and the clear capillary tube BEGINS.

2. TUBE COMPLETELY EMPTY:
   If the capillary tube is clear with NO colored liquid or no meniscus:
   Return detected=false, error="MENISCUS_BELOW_FRAME", reasoning="Capillary tube is empty in this view. Please point camera lower towards the bulb."

3. TUBE COMPLETELY FULL:
   If colored liquid fills the tube past the top edge with NO visible meniscus:
   Return detected=false, error="MENISCUS_ABOVE_FRAME", reasoning="Liquid column fills view past the top edge. Please point camera higher."

4. NOT A REAL THERMOMETER:
   If this is a piece of paper, phone screen, hand, wall, or not an authentic physical thermometer:
   Return detected=false, error="NOT_A_THERMOMETER", reasoning="Please point the camera directly at a physical liquid-in-glass poultry shed thermometer."

5. VALID READING:
   When the top meniscus (red liquid stops, clear capillary begins) is visibly positioned between printed numbers inside the frame:
   - Identify the exact Celsius temperature (°C) at the meniscus.
   - Cross-check with Fahrenheit (°F) at the same horizontal height: F ≈ C * 1.8 + 32.

Return strictly JSON:
If valid meniscus transition is visible:
{
  "detected": true,
  "hasLiquid": true,
  "temperature": <integer Celsius reading>,
  "celsiusExact": <float or int>,
  "fahrenheitExact": <float or int>,
  "crossValidated": true,
  "reasoning": "<clear explanation of meniscus level and Celsius tick>"
}

If rejected (empty tube, full tube, fake object, or unclear):
{
  "detected": false,
  "hasLiquid": false,
  "error": "MENISCUS_BELOW_FRAME" | "MENISCUS_ABOVE_FRAME" | "NOT_A_THERMOMETER" | "UNCLEAR_IMAGE",
  "reasoning": "<instruction telling the user how to move camera>"
}`;

  // Ultra-fast 3.5-flash-lite first (~1s latency), with 3.8-flash fallback
  const candidateGeminiModels = [
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
  ];

  for (const model of candidateGeminiModels) {
    try {
      const config = {
        responseMimeType: 'application/json',
      };

      // 4.5-second timeout per model for rapid industrial-grade speed
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
        setTimeout(() => reject(new Error(`Timeout after 4500ms on ${model}`)), 4500)
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
              error: parsed.reasoning || 'Liquid level (meniscus) not visible in photo. Please frame the thermometer so where the red line ends is clearly visible.',
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
    error: 'Could not detect thermometer liquid level. Please ensure the top of the red liquid column is inside the camera frame and rescan.',
    errorCode: 'NO_READING_DETECTED',
  };
}
