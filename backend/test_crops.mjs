import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

import { extractTemperatureFromImage } from './src/temperature/services/thermometerAiService.js';

console.log('--- TEST 1: Crop around number 40 ---');
const buf40 = fs.readFileSync('crop_at_40.jpg');
const r40 = await extractTemperatureFromImage(buf40.toString('base64'), 'image/jpeg');
console.log('Result 40:', JSON.stringify(r40, null, 2));

console.log('\n--- TEST 2: Crop around number 30 ---');
const buf30 = fs.readFileSync('crop_at_30.jpg');
const r30 = await extractTemperatureFromImage(buf30.toString('base64'), 'image/jpeg');
console.log('Result 30:', JSON.stringify(r30, null, 2));

