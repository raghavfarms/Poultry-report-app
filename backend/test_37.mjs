import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

const prompt = `LOOK VERY CAREFULLY at this image.
Is there an actual physical liquid-in-glass thermometer in this image?
If yes, examine the central vertical glass capillary tube.
Does it contain colored liquid (red, blue, or silver)?
Is the top meniscus (the boundary where the liquid stops and empty tube begins) clearly visible inside this image?

CRITICAL:
If there is NO colored liquid in the tube, or if the meniscus is NOT inside this photo, return:
{
  "detected": false,
  "error": "MENISCUS_NOT_VISIBLE",
  "reasoning": "Explain clearly why no reading is taken"
}

If the meniscus IS clearly visible inside this photo:
{
  "detected": true,
  "temperature": <integer or half-degree in Celsius on the left scale>,
  "reasoning": "Explain exact meniscus level"
}`;

async function test(name, file) {
  console.log(`\nTesting ${name} with gemini-3.7-flash...`);
  const buf = fs.readFileSync(file);
  const t0 = Date.now();
  const res = await ai.models.generateContent({
    model: 'gemini-3.7-flash',
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
  console.log(`Time: ${Date.now() - t0}ms`);
  console.log(res.text);
}

await test('Crop 40 (NO liquid)', 'crop_at_40.jpg');
await test('Full Real Image (Liquid at 25/26)', 'C:/Users/KBM/.gemini/antigravity/brain/2948f876-4e4c-47cf-9b0e-d45afd87d065/.user_uploaded/media_1792579865874_8f99ade0.jpg');

