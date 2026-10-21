import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

const prompt = `EXAMINE THE CAPILLARY TUBE (the central vertical glass tube) IN THIS IMAGE VERY CAREFULLY.

A true thermometer liquid reading requires a visible TRANSITION / MENISCUS:
- Below the meniscus, the tube MUST be filled with bright colored liquid (red or blue).
- Above the meniscus, the tube MUST be empty, clear, and transparent (the white background shows through).

STEP-BY-STEP VERIFICATION:
1. Is the tube filled with colored liquid at the bottom of the image? (yes/no)
2. Is the tube empty and transparent at the top of the image? (yes/no)
3. Is there a sharp, visible transition point (meniscus) where the colored liquid abruptly stops and clear tube begins? (yes/no)
4. What is the exact pixel color of the liquid? (e.g. bright red, blue, or none/clear)

STRICT REJECTION RULES:
- If the tube has NO colored liquid anywhere in the image: detected = false, error = "NO_LIQUID_IN_VIEW".
- If the tube is uniformly clear/empty: detected = false, error = "NO_LIQUID_IN_VIEW".
- If you cannot clearly see where colored liquid turns into empty clear tube: detected = false, error = "NO_MENISCUS_FOUND".
- DO NOT GUESS A TEMPERATURE BASED ON SCALE NUMBERS. Scale numbers (like 30, 40, 50) DO NOT indicate temperature unless colored liquid stops right next to them.

Return JSON:
{
  "hasColoredLiquid": boolean,
  "hasTransitionPoint": boolean,
  "detected": boolean,
  "temperature": number or null,
  "error": string or null,
  "reasoning": string
}`;

async function test(name, file) {
  console.log(`\nTesting ${name}...`);
  const buf = fs.readFileSync(file);
  const res = await ai.models.generateContent({
    model: 'gemini-3.5-flash-lite',
    contents: [
      {
        inlineData: {
          data: buf.toString('base64'),
          mimeType: 'image/jpeg',
        },
      },
      prompt,
    ],
    config: {
      responseMimeType: 'application/json',
    },
  });
  console.log(res.text);
}

await test('Crop 40 (NO liquid)', 'crop_at_40.jpg');
await test('Crop 30 (NO liquid)', 'crop_at_30.jpg');
await test('Full Real Image (Liquid at 25/26)', 'C:/Users/KBM/.gemini/antigravity/brain/2948f876-4e4c-47cf-9b0e-d45afd87d065/.user_uploaded/media_1792579865874_8f99ade0.jpg');

