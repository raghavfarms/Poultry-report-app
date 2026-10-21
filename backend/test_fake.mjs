import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

// Let's create an SVG with text "28" or "Temperature 28" and convert to JPEG/PNG or use powershell to render a number on a card
console.log('Testing what Gemini does when shown a fake image or a paper with a number on it...');

