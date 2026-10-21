import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

console.log('Listing all available Gemini models on this key...');
try {
  const models = await ai.models.list();
  for await (const m of models) {
    if (m.name.includes('flash') || m.name.includes('pro')) {
      console.log(m.name, m.supportedActions || '');
    }
  }
} catch (err) {
  console.error('List models failed:', err.message);
}

