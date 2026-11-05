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
 * High-Speed & Resilient Poultry Shed Thermometer Vision Service.
 * Powered by Gemini 3.5 Flash Lite & 3.8 Flash for sub-second readings.
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

  // High-accuracy practical reading prompt for farm sheds
  const prompt = `You are a high-speed vision system that reads temperature from physical thermometers in poultry farms.

YOUR TASK:
Carefully inspect the image and read the temperature shown on the thermometer.

SUPPORTED THERMOMETERS:
1. Liquid-in-glass (red alcohol/spirit, blue liquid, or mercury):
   - Locate the colored column (usually red or blue) and read where its top level points on the printed Celsius (°C) scale.
   - Look at the nearby printed numbers (e.g. 15, 20, 25, 30, 35, 40) and scale lines.
2. Digital thermometer (LCD / LED screen):
   - Read the digital temperature number shown in Celsius (°C).
3. Dial / bimetallic gauge thermometer:
   - Read where the indicator needle points on the Celsius (°C) scale.

RULES:
- Be practical and helpful: Shed lighting and angles vary. If you see a thermometer and can determine the temperature (usually between 10°C and 45°C), return detected=true with the Celsius temperature immediately.
- DO NOT reject valid images with technical errors about liquid meniscus boundaries.
- ONLY return detected=false if the image genuinely does NOT show a thermometer (e.g. a face, ceiling, wall, clothes, or completely dark/blank).

RETURN STRICTLY JSON:
If temperature is found:
{
  "detected": true,
  "temperature": <integer Celsius rounded, e.g. 26>,
  "celsiusExact": <float or int, e.g. 26.2>,
  "confidence": 0.95,
  "type": "liquid_glass" | "digital" | "dial",
  "reasoning": "<short description, e.g. Red liquid column reaches 26°C mark on scale>"
}

If no thermometer is visible or completely unreadable:
{
  "detected": false,
  "error": "NO_THERMOMETER_DETECTED",
  "reasoning": "Thermometer not clearly visible. Please point the camera directly at the thermometer and hold steady."
}`;

  // Priority list of Gemini models for speed and uptime
  const candidateGeminiModels = [
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.8-flash',
    'gemini-3.5-flash',
  ];

  for (const model of candidateGeminiModels) {
    try {
      const config = {
        responseMimeType: 'application/json',
      };

      // 4.5-second timeout per model for rapid speed
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

          if (parsed.detected === false) {
            return {
              success: false,
              error: parsed.reasoning || 'Thermometer not detected. Please point the camera directly at the thermometer scale and hold steady.',
              errorCode: parsed.error || 'NO_THERMOMETER_DETECTED',
              modelUsed: `Gemini (${model})`,
            };
          }

          const rawVal = parsed.temperature ?? parsed.celsiusExact ?? parsed.temp ?? parsed.celsius;
          if (rawVal !== undefined && rawVal !== null) {
            const numVal = parseFloat(rawVal);
            if (!isNaN(numVal) && numVal >= -30 && numVal <= 65) {
              return {
                success: true,
                temperature: Math.round(numVal),
                celsiusExact: parsed.celsiusExact ?? numVal,
                confidence: parsed.confidence || 0.95,
                reasoning: parsed.reasoning || '',
                modelUsed: `Gemini (${model})`,
              };
            }
          }
        } catch (_) {}
      }
    } catch (gErr) {
      console.warn(`[Gemini Vision] Model ${model} failed:`, gErr.message);
    }
  }

  return {
    success: false,
    error: 'Could not read temperature clearly. Please hold the camera 6–10 inches away facing the thermometer scale.',
    errorCode: 'NO_READING_DETECTED',
  };
}
