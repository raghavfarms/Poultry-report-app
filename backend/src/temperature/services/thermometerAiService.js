import { GoogleGenAI } from '@google/genai';

/**
 * Precision Thermometer Reading Vision Service.
 * 
 * Powered by Google Gemini Vision (gemini-2.5-flash / gemini-2.0-flash)
 * for ultra-fast, high-precision thermometer reading.
 * 
 * @param {string} base64Image - Base64 encoded image string (with or without data:image/...;base64, prefix)
 * @param {string} [mimeType='image/jpeg'] - MIME type of the image
 * @returns {Promise<{ success: boolean, temperature?: number, confidence?: number, detectedType?: string, explanation?: string, error?: string, modelUsed?: string }>}
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

  const prompt = `You are an expert precision measurement instrument reader specializing in poultry farm thermometers (specifically liquid-in-glass red alcohol/spirit thermometers and digital units).

Examine this image and read the temperature with extreme precision:

ANALOG SPIRIT/MERCURY TUBE READING INSTRUCTIONS:
1. Locate the Celsius (°C) scale. (Ignore Fahrenheit °F if present, or convert if only °F is shown: °C = Math.round((°F - 32) * 5/9)).
2. Find the two adjacent labeled major numbers that frame the colored liquid meniscus (e.g., between 20 and 30, or 20 and 25).
3. Determine the graduation intervals (tick marks):
   - Count the marks between the numbered divisions.
   - Are the smallest tick marks 1°C per line or 2°C per line? (Most farm spirit thermometers have 1 line per 1°C, with a slightly longer line at every 5°C).
4. Identify the exact top tip of the red/blue liquid column (meniscus).
   - Ignore reflections, highlights on the outer glass tube, or bubble glare.
5. Count tick by tick from the nearest lower major mark up to the meniscus.
   - For example: if starting at 20°C, count: 21, 22, 23, 24, 25, 26, 27...
   - Be rigorous and exact. Do NOT guess or round loosely.

DIGITAL THERMOMETERS:
- Read the digital display digits directly.

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this schema without any markdown formatting or extra text:
{
  "success": true,
  "temperature": 26,
  "confidence": 0.99,
  "unit": "C",
  "detectedType": "analog_spirit_tube",
  "reasoning": "Major mark 20°C is visible. 1°C ticks. Meniscus sits exactly on the 6th line above 20.",
  "explanation": "26°C"
}

If the image is completely blurry, unreadable, or doesn't show a thermometer:
{
  "success": false,
  "error": "Could not read thermometer clearly. Please hold the phone steady and closer to the scale markings."
}`;

  // ---------------------------------------------------------------------------
  // Google Gemini Vision (Ultra Fast: Flash & Flash Lite)
  // Typically responds in 1.0 - 1.8 seconds
  // ---------------------------------------------------------------------------
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey || geminiKey.trim() === '' || geminiKey === 'YOUR_GEMINI_API_KEY') {
    return {
      success: false,
      keyMissing: true,
      error: 'Google Gemini API Key is missing. Please configure GEMINI_API_KEY in backend/.env',
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey.trim() });
    const candidateGeminiModels = [
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.7-flash',
      'gemini-3.8-flash',
    ];

    for (const model of candidateGeminiModels) {
      try {
        const response = await ai.models.generateContent({
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
          config: {
            responseMimeType: 'application/json',
            temperature: 0.0,                                        
          },
        });

        const responseText = response.text?.trim() || '';
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.success && typeof parsed.temperature === 'number') {
            return {
              success: true,
              temperature: Math.round(parsed.temperature),
              confidence: parsed.confidence || 0.95,
              detectedType: parsed.detectedType || 'thermometer',
              explanation: parsed.explanation || 'Reading extracted by Gemini Vision',
              modelUsed: `Gemini (${model})`,
            };
          } else if (parsed.error) {
            return {
              success: false,
              error: parsed.error,
              modelUsed: `Gemini (${model})`,
            };
          }
        }
      } catch (gErr) {
        console.warn(`[Gemini Vision] Model ${model} attempt failed:`, gErr.message);
      }
    }
  } catch (geminiErr) {
    console.error('[Gemini Vision] Google GenAI failed:', geminiErr.message);
    return {
      success: false,
      error: geminiErr.message || 'Error processing thermometer image with Gemini Vision',
    };
  }

  return {
    success: false,
    error: 'Failed to extract temperature reading. Please ensure the scale is clearly visible in the camera frame.',
  };
}
 