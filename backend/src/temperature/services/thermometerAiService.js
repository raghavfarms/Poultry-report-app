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
 * Powered by Google Gemini Vision with strict meniscus detection and universal scale support.
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

  // Universal dual-scale spirit & mercury thermometer reading prompt
  const prompt = `You are a precision industrial optical instrument reader for liquid-in-glass thermometers (spirit, alcohol, mercury, or galinstan).
Read the exact temperature in Celsius (°C) from this thermometer photograph.

THERMOMETER CHARACTERISTICS:
1. Two vertical printed scales flanking a central capillary tube.
2. LEFT SCALE is Celsius (°C): numbers such as 50, 40, 30, 20, 10, 0, -10, -20, -30.
   - Long lines every 10°C (with numerals).
   - Medium line every 5°C.
   - Small tick marks every 1°C.
3. RIGHT SCALE is Fahrenheit (°F): numbers such as 120, 100, 80, 60, 40, 20, 0, -20.
4. INDICATOR LIQUID: The capillary tube contains an indicator liquid column of ANY color:
   - Red spirit / alcohol
   - Blue spirit / alcohol
   - Silver / metallic grey mercury or galinstan
   - Green spirit / alcohol, or dark liquid.

CRITICAL READING & VERIFICATION RULES:
1. MENISCUS DETECTION (STRICT):
   - You MUST locate the exact top boundary (meniscus) where the filled liquid column ends against the empty capillary tube above it.
   - If the liquid column meniscus is NOT visible inside this photo (e.g. the photo only captures a cropped top section like 30°C–50°C where the liquid has not reached, or the tube is empty, or the photo only shows numbers without the liquid tip):
     YOU MUST RETURN "detected": false and "error": "MENISCUS_NOT_VISIBLE". DO NOT GUESS OR ESTIMATE.
2. OUT OF FOCUS / UNCLEAR:
   - If the image is blurry, glaring, or does not clearly show the scale tick marks and meniscus:
     RETURN "detected": false and "error": "UNCLEAR_IMAGE".
3. READING THE TEMPERATURE:
   - When the meniscus IS clearly visible: read the exact Celsius degree level on the LEFT scale aligned with the top of the liquid.
   - Support ANY physical temperature on the scale (from -30°C to +60°C, e.g. 10°C, 16°C, 24°C, 35°C, 42°C). Do NOT assume or bias towards any specific range.
   - Cross-check with Fahrenheit on the right: Celsius ≈ (Fahrenheit - 32) * 5/9.
   - Never report Fahrenheit as Celsius (e.g. 78°F is ~25.5°C, NOT 78°C).

OUTPUT FORMAT:
Return strictly a valid JSON object:
If meniscus is clearly visible:
{
  "detected": true,
  "temperature": <exact integer or rounded number in Celsius, e.g. 16, 26, 32>,
  "fahrenheit": <number>,
  "liquidColor": "<red|blue|silver|green|other>",
  "reasoning": "<short description of meniscus level relative to scale marks>"
}

If meniscus is NOT visible or image is unclear:
{
  "detected": false,
  "error": "MENISCUS_NOT_VISIBLE" | "UNCLEAR_IMAGE",
  "message": "<clear explanation to worker on how to frame the camera properly>"
}`;

  // Prioritize active models with available quota and lowest latency
  const candidateGeminiModels = [
    'gemini-3.1-flash-lite-preview',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
    'gemini-flash-latest',
    'gemini-3-flash-preview',
  ];

  for (const model of candidateGeminiModels) {
    try {
      const config = {
        responseMimeType: 'application/json',
        temperature: 0.0,
      };
      if (!model.includes('lite')) {
        config.thinkingConfig = { thinkingBudget: 0 };
      }

      // 4-second timeout to guarantee sub-second / fast fallback without hanging
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
        setTimeout(() => reject(new Error(`Timeout after 4000ms on ${model}`)), 4000)
      );

      const response = await Promise.race([generatePromise, timeoutPromise]);

      const responseText = response.text?.trim() || '';
      
      // Parse JSON response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);

          // Handle explicit rejection when liquid/meniscus is not in frame
          if (parsed.detected === false) {
            return {
              success: false,
              error: parsed.message || (parsed.error === 'MENISCUS_NOT_VISIBLE'
                ? 'Liquid level (meniscus) not visible in photo. Please frame the thermometer lower so where the liquid column ends is clearly visible.'
                : 'Could not clearly read thermometer. Please take a closer photo with good lighting.'),
              errorCode: parsed.error || 'DETECTION_FAILED',
              modelUsed: `Gemini (${model})`,
            };
          }

          const rawVal = parsed.temperature ?? parsed.temp ?? parsed.celsius ?? parsed.reading;
          if (rawVal !== undefined && rawVal !== null) {
            const numVal = parseFloat(rawVal);
            // Universal range: support full physical thermometer scale (-30°C to +60°C)
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

      // Regex fallback ONLY if JSON was not cleanly formatted but contained valid temperature
      const regexMatch = responseText.match(/"temperature":\s*(-?\d+(?:\.\d+)?)/i) ||
                         responseText.match(/(-?\d+(?:\.\d+)?)\s*°?C/);
      if (regexMatch) {
        const numVal = parseFloat(regexMatch[1]);
        if (!isNaN(numVal) && numVal >= -30 && numVal <= 60) {
          return {
            success: true,
            temperature: Math.round(numVal),
            confidence: 0.92,
            modelUsed: `Gemini (${model})`,
          };
        }
      }
    } catch (gErr) {
      console.warn(`[Gemini Vision] Model ${model} failed or timed out:`, gErr.message);
    }
  }

  // Honest failure - never return a hardcoded/hallucinated number like 26°C
  return {
    success: false,
    error: 'Could not detect thermometer liquid level. Please ensure the top of the liquid column is inside the camera frame.',
    errorCode: 'NO_READING_DETECTED',
  };
}
