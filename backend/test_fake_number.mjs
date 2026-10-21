import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

import { extractTemperatureFromImage } from './src/temperature/services/thermometerAiService.js';

const imgBuffer = fs.readFileSync('number_32.jpg');
const base64 = imgBuffer.toString('base64');

console.log('Testing image with just number 32°C written on it...');
const res = await extractTemperatureFromImage(base64, 'image/jpeg');
console.log('Result for fake number 32:', JSON.stringify(res, null, 2));

