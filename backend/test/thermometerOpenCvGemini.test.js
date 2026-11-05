import { describe, it } from 'node:test';
import assert from 'assert';
import {
  calculateCalibratedTemperature,
  evaluateHybridResult,
} from '../../frontend/src/temperature/services/openCvThermometerService.js';

describe('Thermometer OpenCV + Gemini Hybrid Vision Suite', () => {
  describe('1. Calibrated Temperature Mathematical Formula', () => {
    it('should correctly calculate exact midpoint temperature (25°C between 20°C and 30°C)', () => {
      // In top-to-bottom coordinates:
      // 30°C is at Y = 400 (higher up physically)
      // 20°C is at Y = 600 (lower down physically)
      // Meniscus at Y = 500 (exact midpoint)
      const scaleMarkings = [
        { temp: 20, y: 600 },
        { temp: 30, y: 400 },
      ];
      const result = calculateCalibratedTemperature(500, scaleMarkings);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.temperature, 25.0);
      assert.strictEqual(result.t1, 20);
      assert.strictEqual(result.t2, 30);
    });

    it('should calculate arbitrary positions accurately (e.g. 26.5°C)', () => {
      // 20°C at Y=700, 30°C at Y=500 -> 200 pixels for 10°C (20 px per 1°C)
      // 26.5°C should be at Y = 700 - (6.5 * 20) = 570
      const scaleMarkings = [
        { temp: 20, y: 700 },
        { temp: 30, y: 500 },
      ];
      const result = calculateCalibratedTemperature(570, scaleMarkings);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.temperature, 26.5);
    });

    it('should handle multi-point scale calibration and pick closest bracketing pair', () => {
      const scaleMarkings = [
        { temp: 10, y: 800 },
        { temp: 20, y: 650 },
        { temp: 30, y: 500 },
        { temp: 40, y: 350 },
      ];
      // Meniscus at Y = 425 (between 30°C and 40°C -> midpoint = 35°C)
      const result = calculateCalibratedTemperature(425, scaleMarkings);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.temperature, 35.0);
      assert.strictEqual(result.t1, 30);
      assert.strictEqual(result.t2, 40);
    });

    it('should reject calculation when fewer than 2 valid markings are available', () => {
      const scaleMarkings = [{ temp: 20, y: 600 }];
      const result = calculateCalibratedTemperature(500, scaleMarkings);

      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.temperature, null);
    });

    it('should reject calculation when delta Y is zero (division by zero protection)', () => {
      const scaleMarkings = [
        { temp: 20, y: 500 },
        { temp: 30, y: 500 },
      ];
      const result = calculateCalibratedTemperature(500, scaleMarkings);

      assert.strictEqual(result.isValid, false);
    });

    it('should reject calculated temperatures that fall outside realistic poultry limits (<5°C or >55°C)', () => {
      const scaleMarkings = [
        { temp: 20, y: 600 },
        { temp: 30, y: 500 },
      ];
      // Meniscus at Y = -1000 (absurd reading > 100°C)
      const result = calculateCalibratedTemperature(-1000, scaleMarkings);

      assert.strictEqual(result.isValid, false);
    });
  });

  describe('2. Hybrid Multi-Engine Evaluation & Decision Logic', () => {
    it('should return High Confidence when Gemini and OpenCV agree within 1.0°C', () => {
      const geminiData = { temperature: 26, confidence: 0.98 };
      const openCvData = { temperature: 26.3, liquidDetected: true };
      const qualityData = { isAcceptable: true, blurScore: 85, brightnessScore: 140 };

      const hybrid = evaluateHybridResult(geminiData, openCvData, qualityData);

      assert.strictEqual(hybrid.status, 'high');
      assert.strictEqual(hybrid.temperature, 26);
      assert.strictEqual(hybrid.disagreement, false);
      assert.strictEqual(hybrid.diff, 0.3);
      assert.ok(hybrid.confidence >= 0.95);
    });

    it('should return Medium Confidence when slight variance exists (1.5°C to 3.0°C)', () => {
      const geminiData = { temperature: 27, confidence: 0.95 };
      const openCvData = { temperature: 24.8, liquidDetected: true };
      const qualityData = { isAcceptable: true, blurScore: 65, brightnessScore: 120 };

      const hybrid = evaluateHybridResult(geminiData, openCvData, qualityData);

      assert.strictEqual(hybrid.status, 'medium');
      assert.strictEqual(hybrid.disagreement, false);
      assert.strictEqual(hybrid.diff, 2.2);
    });

    it('should return Low Confidence and flag disagreement when delta > 3.0°C (no blind averaging)', () => {
      const geminiData = { temperature: 30, confidence: 0.9 };
      const openCvData = { temperature: 22, liquidDetected: true };
      const qualityData = { isAcceptable: true, blurScore: 70, brightnessScore: 130 };

      const hybrid = evaluateHybridResult(geminiData, openCvData, qualityData);

      assert.strictEqual(hybrid.status, 'low');
      assert.strictEqual(hybrid.disagreement, true);
      assert.strictEqual(hybrid.diff, 8.0);
      // Ensure reading is NOT blindly averaged to 26°C!
      assert.notStrictEqual(hybrid.temperature, 26);
      assert.ok(hybrid.message.includes('Vision conflict'));
    });

    it('should reject with Low Confidence when image quality fails blur/lighting checks', () => {
      const geminiData = { temperature: 26 };
      const openCvData = { temperature: 26 };
      const qualityData = {
        isAcceptable: false,
        isBlurry: true,
        blurScore: 18,
        message: 'Photo is blurry. Hold phone steady and retake.',
      };

      const hybrid = evaluateHybridResult(geminiData, openCvData, qualityData);

      assert.strictEqual(hybrid.status, 'low');
      assert.ok(hybrid.message.includes('blurry'));
    });

    it('should gracefully handle case where OpenCV was inconclusive and provide Medium Confidence for Gemini with verification prompt', () => {
      const geminiData = { temperature: 25, confidence: 0.95 };
      const openCvData = { temperature: null, liquidDetected: false };
      const qualityData = { isAcceptable: true, blurScore: 70, brightnessScore: 130 };

      const hybrid = evaluateHybridResult(geminiData, openCvData, qualityData);

      assert.strictEqual(hybrid.status, 'medium');
      assert.strictEqual(hybrid.temperature, 25);
      assert.strictEqual(hybrid.openCvReading, null);
      assert.ok(hybrid.message.includes('OpenCV secondary check was inconclusive'));
    });
  });

  describe('3. Real-World Simulated Calibration Benchmarks (30 Test Cases)', () => {
    const testCases = [
      { t1: 10, y1: 850, t2: 20, y2: 700, yLiq: 775, expected: 15.0 },
      { t1: 10, y1: 850, t2: 20, y2: 700, yLiq: 730, expected: 18.0 },
      { t1: 20, y1: 700, t2: 30, y2: 500, yLiq: 660, expected: 22.0 },
      { t1: 20, y1: 700, t2: 30, y2: 500, yLiq: 620, expected: 24.0 },
      { t1: 20, y1: 700, t2: 30, y2: 500, yLiq: 600, expected: 25.0 },
      { t1: 20, y1: 700, t2: 30, y2: 500, yLiq: 580, expected: 26.0 },
      { t1: 20, y1: 700, t2: 30, y2: 500, yLiq: 560, expected: 27.0 },
      { t1: 20, y1: 700, t2: 30, y2: 500, yLiq: 540, expected: 28.0 },
      { t1: 20, y1: 700, t2: 30, y2: 500, yLiq: 520, expected: 29.0 },
      { t1: 20, y1: 700, t2: 30, y2: 500, yLiq: 500, expected: 30.0 },
      { t1: 30, y1: 500, t2: 40, y2: 300, yLiq: 480, expected: 31.0 },
      { t1: 30, y1: 500, t2: 40, y2: 300, yLiq: 460, expected: 32.0 },
      { t1: 30, y1: 500, t2: 40, y2: 300, yLiq: 440, expected: 33.0 },
      { t1: 30, y1: 500, t2: 40, y2: 300, yLiq: 420, expected: 34.0 },
      { t1: 30, y1: 500, t2: 40, y2: 300, yLiq: 400, expected: 35.0 },
      { t1: 30, y1: 500, t2: 40, y2: 300, yLiq: 380, expected: 36.0 },
      { t1: 30, y1: 500, t2: 40, y2: 300, yLiq: 360, expected: 37.0 },
      { t1: 30, y1: 500, t2: 40, y2: 300, yLiq: 340, expected: 38.0 },
      { t1: 30, y1: 500, t2: 40, y2: 300, yLiq: 320, expected: 39.0 },
      { t1: 30, y1: 500, t2: 40, y2: 300, yLiq: 300, expected: 40.0 },
      { t1: 20, y1: 640, t2: 30, y2: 480, yLiq: 560, expected: 25.0 },
      { t1: 20, y1: 640, t2: 30, y2: 480, yLiq: 544, expected: 26.0 },
      { t1: 20, y1: 640, t2: 30, y2: 480, yLiq: 528, expected: 27.0 },
      { t1: 20, y1: 640, t2: 30, y2: 480, yLiq: 512, expected: 28.0 },
      { t1: 20, y1: 640, t2: 30, y2: 480, yLiq: 496, expected: 29.0 },
      { t1: 20, y1: 800, t2: 40, y2: 400, yLiq: 680, expected: 26.0 },
      { t1: 20, y1: 800, t2: 40, y2: 400, yLiq: 660, expected: 27.0 },
      { t1: 20, y1: 800, t2: 40, y2: 400, yLiq: 640, expected: 28.0 },
      { t1: 20, y1: 800, t2: 40, y2: 400, yLiq: 600, expected: 30.0 },
      { t1: 20, y1: 800, t2: 40, y2: 400, yLiq: 500, expected: 35.0 },
    ];

    testCases.forEach((tc, idx) => {
      it(`Benchmark Case #${idx + 1}: T1=${tc.t1}°C, T2=${tc.t2}°C, Meniscus Y=${tc.yLiq} -> Expected: ${tc.expected}°C`, () => {
        const marks = [
          { temp: tc.t1, y: tc.y1 },
          { temp: tc.t2, y: tc.y2 },
        ];
        const res = calculateCalibratedTemperature(tc.yLiq, marks);
        assert.strictEqual(res.isValid, true);
        assert.strictEqual(res.temperature, tc.expected);
      });
    });
  });
});
