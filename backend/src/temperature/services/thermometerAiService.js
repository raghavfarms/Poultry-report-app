import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';

/**
 * Precision Thermometer Reading Vision Service.
 * 
 * Uses Anthropic Claude (Claude 3.5 Sonnet / 3.7 Sonnet) as the PRIMARY high-precision vision engine
 * for accurate analog spirit column meniscus reading (preventing +/- 3°C to 4°C drift).
 * 
 * Falls back to Google Gemini Vision if Anthropic key is not supplied or fails.
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

  // Validate supported image media types for Anthropic
  const validAnthropicMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const anthropicMediaType = validAnthropicMimes.includes(cleanMimeType) ? cleanMimeType : 'image/jpeg';

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
  // 1. PRIMARY ENGINE: Anthropic Claude 3.5 Sonnet Vision
  // ---------------------------------------------------------------------------
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey && anthropicKey.trim() !== '' && anthropicKey !== 'YOUR_ANTHROPIC_API_KEY') {
    try {
      const anthropic = new Anthropic({ apiKey: anthropicKey.trim() });
      
      const candidateClaudeModels = [
        'claude-3-5-sonnet-20241022',
        'claude-3-5-sonnet-latest',
        'claude-3-7-sonnet-20250219',
        'claude-3-5-haiku-20241022',
      ];

      for (const model of candidateClaudeModels) {
        try {
          const response = await anthropic.messages.create({
            model,
            max_tokens: 500,
            temperature: 0,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: anthropicMediaType,
                      data: cleanBase64,
                    },
                  },
                  {
                    type: 'text',
                    text: prompt,
                  },
                ],
              },
            ],
          });

          const responseText = response.content
            .filter((c) => c.type === 'text')
            .map((c) => c.text)
            .join('')
            .trim();

          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.success && typeof parsed.temperature === 'number') {
              return {
                success: true,
                temperature: Math.round(parsed.temperature),
                confidence: parsed.confidence || 0.98,
                detectedType: parsed.detectedType || 'thermometer',
                explanation: parsed.explanation || `${Math.round(parsed.temperature)}°C verified by Claude Vision`,
                modelUsed: `Claude (${model})`,
              };
            } else if (parsed.error) {
              return {
                success: false,
                error: parsed.error,
                modelUsed: `Claude (${model})`,
              };
            }
          }
        } catch (mErr) {
          console.warn(`[Claude Vision] Model ${model} failed, trying next:`, mErr.message);
        }
      }
    } catch (claudeErr) {
      console.error('[Claude Vision] Anthropic API failed:', claudeErr.message);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. SECONDARY / FALLBACK ENGINE: Google Gemini Vision
  // ---------------------------------------------------------------------------
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey.trim() !== '' && geminiKey !== 'YOUR_GEMINI_API_KEY') {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey.trim() });
      const candidateGeminiModels = [
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-2.5-flash-lite',  
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
                confidence: parsed.confidence || 0.9,
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
    }
  }

  // Both missing or failed
  return {
    success: false,
    keyMissing: !anthropicKey && !geminiKey,
    error: 'AI Vision key not configured. Please add ANTHROPIC_API_KEY in backend/.env to scan with Claude.',
  };
}
    
  

