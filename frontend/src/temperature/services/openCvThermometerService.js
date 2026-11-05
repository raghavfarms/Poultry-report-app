/**
 * OpenCV.js Computer Vision Service for Thermometer Scanning.
 * 
 * Works as a specialized local computer vision validation layer alongside Google Gemini Vision.
 * 
 * Capabilities:
 * 1. Image Quality & Blur Detection (Laplacian variance & mean luminance)
 * 2. Contrast & Brightness Enhancement
 * 3. Red Spirit Capillary Column & Meniscus Detection (HSV color space & vertical morphology)
 * 4. Thermometer Scale Tick Mark Detection (Horizontal morphology)
 * 5. Mathematically Calibrated Temperature Calculation:
 *    Temperature = T1 + ((Y1 - Yliquid) / (Y1 - Y2)) * (T2 - T1)
 * 6. Hybrid Multi-Engine Cross-Validation (Gemini + OpenCV)
 */

let cvInstance = null;
let cvLoadingPromise = null;

/**
 * Dynamically load OpenCV.js only when temperature scanner is opened.
 * Prevents unnecessary bundle bloat on other pages.
 */
export async function getOpenCv() {
  if (cvInstance && cvInstance.Mat) {
    return cvInstance;
  }

  if (!cvLoadingPromise) {
    cvLoadingPromise = (async () => {
      try {
        const mod = await import('@techstark/opencv-js');
        const cv = mod.default || mod;
        if (cv && typeof cv.then === 'function') {
          cvInstance = await cv;
        } else {
          cvInstance = cv;
        }
        return cvInstance;
      } catch (err) {
        console.warn('[OpenCV] Dynamic import failed or OpenCV already global:', err);
        if (typeof window !== 'undefined' && window.cv && window.cv.Mat) {
          cvInstance = window.cv;
          return cvInstance;
        }
        throw err;
      }
    })();
  }

  return cvLoadingPromise;
}

/**
 * Check if OpenCV is currently loaded and ready
 */
export function isOpenCvReady() {
  return Boolean(cvInstance && cvInstance.Mat);
}

/**
 * Helper to get a cv.Mat from HTMLCanvasElement or ImageData
 */
function getMatFromSource(cv, source) {
  if (source instanceof HTMLCanvasElement) {
    return cv.imread(source);
  }
  if (source instanceof ImageData) {
    return cv.matFromImageData(source);
  }
  if (source && source.width && source.height && source.getContext) {
    return cv.imread(source);
  }
  throw new Error('Unsupported source for OpenCV processing. Must be HTMLCanvasElement or ImageData.');
}

/**
 * 1. IMAGE QUALITY & BLUR DETECTION
 * Calculates Laplacian variance for focus sharpness and mean luminance for lighting.
 * Rejects blurry, severely dark, or overexposed frames in <30ms before calling Gemini.
 */
export async function checkImageQuality(canvasOrImageData) {
  try {
    const cv = await getOpenCv();
    const src = getMatFromSource(cv, canvasOrImageData);
    const gray = new cv.Mat();
    const laplacian = new cv.Mat();
    const mean = new cv.Mat();
    const stddev = new cv.Mat();

    try {
      // 1. Grayscale conversion
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // 2. Mean brightness check (0 to 255)
      const meanBrightness = cv.mean(gray)[0];

      // 3. Laplacian variance for edge sharpness
      cv.Laplacian(gray, laplacian, cv.CV_64F);
      cv.meanStdDev(laplacian, mean, stddev);
      const blurScore = stddev.data64F[0] * stddev.data64F[0];

      const isTooDark = meanBrightness < 35;
      const isOverexposed = meanBrightness > 240;
      const isBlurry = blurScore < 38;

      let isAcceptable = true;
      let message = 'Image quality is good for optical scanning.';

      if (isTooDark) {
        isAcceptable = false;
        message = 'Photo is too dark. Please position the thermometer in better light.';
      } else if (isOverexposed) {
        isAcceptable = false;
        message = 'Severe glare or overhead light reflection detected. Tilt slightly to reduce glare.';
      } else if (isBlurry) {
        isAcceptable = false;
        message = 'Photo is blurry or camera moved. Hold phone steady and retake.';
      }

      return {
        success: true,
        isAcceptable,
        isBlurry,
        isTooDark,
        isOverexposed,
        blurScore: Math.round(blurScore),
        brightnessScore: Math.round(meanBrightness),
        message,
      };
    } finally {
      src.delete();
      gray.delete();
      laplacian.delete();
      mean.delete();
      stddev.delete();
    }
  } catch (err) {
    console.warn('[OpenCV] Image quality check fallback:', err);
    return {
      success: false,
      isAcceptable: true, // Non-blocking fallback
      blurScore: null,
      brightnessScore: null,
      message: 'Quality check bypassed.',
      error: err.message,
    };
  }
}

/**
 * 2. RED SPIRIT LIQUID COLUMN & MENISCUS DETECTION
 * Segments the red spirit capillary column in HSV color space.
 * Applies vertical morphological opening to eliminate horizontal noise.
 * Returns the exact Y coordinate (top boundary) of the liquid column.
 */
export async function detectLiquidMeniscus(canvasOrImageData) {
  try {
    const cv = await getOpenCv();
    const src = getMatFromSource(cv, canvasOrImageData);
    const rgb = new cv.Mat();
    const hsv = new cv.Mat();
    const mask1 = new cv.Mat();
    const mask2 = new cv.Mat();
    const redMask = new cv.Mat();
    const cleaned = new cv.Mat();
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, 7));
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();

    const imgWidth = src.cols;
    const imgHeight = src.rows;

    try {
      // 1. Convert to RGB then to HSV
      cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
      cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);

      // 2. Red hue range segmentation (Red wraps around 0 and 180)
      // Lower red: H: 0-12, S: 45-255, V: 40-255
      const lowRed1 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 45, 40, 0]);
      const highRed1 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [12, 255, 255, 0]);
      cv.inRange(hsv, lowRed1, highRed1, mask1);
      lowRed1.delete();
      highRed1.delete();

      // Upper red: H: 165-180, S: 45-255, V: 40-255
      const lowRed2 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [165, 45, 40, 0]);
      const highRed2 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [180, 255, 255, 0]);
      cv.inRange(hsv, lowRed2, highRed2, mask2);
      lowRed2.delete();
      highRed2.delete();

      // Combine both red masks
      cv.bitwise_or(mask1, mask2, redMask);

      // 3. Vertical morphological opening (isolates vertical tube, removes horizontal speckles)
      cv.morphologyEx(redMask, cleaned, cv.MORPH_OPEN, kernel);

      // 4. Find vertical contours
      cv.findContours(cleaned, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let bestColumn = null;
      let maxScore = -1;

      // Restrict search to middle 80% horizontal area (where worker aligns thermometer)
      const minX = imgWidth * 0.15;
      const maxX = imgWidth * 0.85;

      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const rect = cv.boundingRect(cnt);
        cnt.delete();

        const centerX = rect.x + rect.width / 2;
        if (centerX < minX || centerX > maxX) continue;

        // Thermometer liquid column is tall and slender
        const aspectRatio = rect.height / Math.max(rect.width, 1);
        if (rect.height < 25) continue;

        // Score based on height, vertical aspect ratio, and closeness to center
        const centerDist = Math.abs(centerX - imgWidth / 2) / (imgWidth / 2);
        const score = rect.height * Math.min(aspectRatio, 15) * (1 - 0.4 * centerDist);

        if (score > maxScore) {
          maxScore = score;
          bestColumn = {
            x: rect.x,
            y: rect.y, // Top of bounding box = Meniscus level!
            width: rect.width,
            height: rect.height,
            aspectRatio,
            score,
          };
        }
      }

      if (bestColumn) {
        // Meniscus Y normalized to 0-1000 scale
        const normalizedY = Math.round((bestColumn.y / imgHeight) * 1000);
        return {
          success: true,
          liquidDetected: true,
          meniscusPixelY: bestColumn.y,
          meniscusNormalizedY: normalizedY,
          columnBox: bestColumn,
          imageHeight: imgHeight,
          imageWidth: imgWidth,
          confidence: Math.min(0.95, 0.6 + (bestColumn.height / imgHeight) * 0.35),
        };
      }

      return {
        success: false,
        liquidDetected: false,
        message: 'Could not detect vertical red spirit capillary column.',
      };
    } finally {
      src.delete();
      rgb.delete();
      hsv.delete();
      mask1.delete();
      mask2.delete();
      redMask.delete();
      cleaned.delete();
      kernel.delete();
      contours.delete();
      hierarchy.delete();
    }
  } catch (err) {
    console.warn('[OpenCV] Liquid meniscus detection error:', err);
    return {
      success: false,
      liquidDetected: false,
      error: err.message,
    };
  }
}

/**
 * 3. THERMOMETER SCALE-LINE DETECTION
 * Detects horizontal scale tick marks on the plate using horizontal morphological filtering.
 */
export async function detectScaleLines(canvasOrImageData) {
  try {
    const cv = await getOpenCv();
    const src = getMatFromSource(cv, canvasOrImageData);
    const gray = new cv.Mat();
    const edges = new cv.Mat();
    const horizontalLines = new cv.Mat();
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(15, 1));
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();

    const imgHeight = src.rows;
    const imgWidth = src.cols;

    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.Canny(gray, edges, 50, 150);

      // Horizontal morphological filter extracts only horizontal lines/tick marks
      cv.morphologyEx(edges, horizontalLines, cv.MORPH_OPEN, kernel);
      cv.findContours(horizontalLines, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      const detectedLines = [];
      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const rect = cv.boundingRect(cnt);
        cnt.delete();

        // Must be horizontal mark (width > height * 1.5)
        if (rect.width >= 10 && rect.height <= 8) {
          detectedLines.push({
            y: rect.y + rect.height / 2,
            x: rect.x,
            width: rect.width,
            normalizedY: Math.round(((rect.y + rect.height / 2) / imgHeight) * 1000),
          });
        }
      }

      // Sort lines vertically from top to bottom
      detectedLines.sort((a, b) => a.y - b.y);

      return {
        success: true,
        scaleLinesDetected: detectedLines.length >= 4,
        lineCount: detectedLines.length,
        lines: detectedLines.slice(0, 30),
      };
    } finally {
      src.delete();
      gray.delete();
      edges.delete();
      horizontalLines.delete();
      kernel.delete();
      contours.delete();
      hierarchy.delete();
    }
  } catch (err) {
    console.warn('[OpenCV] Scale lines detection error:', err);
    return {
      success: false,
      scaleLinesDetected: false,
      lineCount: 0,
      lines: [],
    };
  }
}

/**
 * 4. MATHEMATICALLY CALIBRATED TEMPERATURE CALCULATION
 * 
 * Formula:
 * Temperature = T1 + ((Y1 - Yliquid) / (Y1 - Y2)) * (T2 - T1)
 * 
 * Where:
 * - T1 = First known temperature marking (e.g. 20°C)
 * - T2 = Second known temperature marking (e.g. 30°C)
 * - Y1 = Pixel / normalized position of first marking
 * - Y2 = Pixel / normalized position of second marking
 * - Yliquid = Pixel / normalized position of detected liquid level
 * 
 * In standard top-down image coordinates:
 * Y increases downwards (Top is 0, Bottom is 1000).
 * Since 30°C (T2) is higher physically on the thermometer than 20°C (T1),
 * Y2 < Y1.
 * As liquid rises towards 30°C, Yliquid decreases from Y1 towards Y2.
 * (Y1 - Yliquid) / (Y1 - Y2) rises from 0 to 1, and Temperature rises from T1 to T2.
 */
export function calculateCalibratedTemperature(meniscusY, scaleMarkings) {
  if (
    typeof meniscusY !== 'number' ||
    !Array.isArray(scaleMarkings) ||
    scaleMarkings.length < 2
  ) {
    return {
      isValid: false,
      temperature: null,
      reason: 'Insufficient scale calibration points.',
    };
  }

  // Filter valid markings and sort by temperature
  const validMarks = scaleMarkings
    .filter((m) => typeof m.temp === 'number' && typeof m.y === 'number' && !isNaN(m.temp) && !isNaN(m.y))
    .sort((a, b) => a.temp - b.temp);

  if (validMarks.length < 2) {
    return {
      isValid: false,
      temperature: null,
      reason: 'At least two verified scale markings are required for calibration.',
    };
  }

  // Select the closest pair of scale marks that bracket or are closest to the meniscus
  let bestPair = null;
  let minDistance = Infinity;

  for (let i = 0; i < validMarks.length - 1; i++) {
    const m1 = validMarks[i];
    const m2 = validMarks[i + 1];

    if (m1.y === m2.y || m1.temp === m2.temp) continue;

    // Check distance of meniscus to this segment
    const minY = Math.min(m1.y, m2.y);
    const maxY = Math.max(m1.y, m2.y);
    const isInside = meniscusY >= minY - 50 && meniscusY <= maxY + 50;
    const dist = isInside ? 0 : Math.min(Math.abs(meniscusY - minY), Math.abs(meniscusY - maxY));

    if (dist < minDistance) {
      minDistance = dist;
      bestPair = [m1, m2];
    }
  }

  if (!bestPair) {
    bestPair = [validMarks[0], validMarks[validMarks.length - 1]];
  }

  const [m1, m2] = bestPair;
  const t1 = m1.temp;
  const t2 = m2.temp;
  const y1 = m1.y;
  const y2 = m2.y;

  if (y1 === y2 || t1 === t2) {
    return {
      isValid: false,
      temperature: null,
      reason: 'Invalid scale coordinates: delta Y or delta T is zero.',
    };
  }

  // Mathematical calibrated formula
  const ratio = (y1 - meniscusY) / (y1 - y2);
  const calculated = t1 + ratio * (t2 - t1);

  // Poultry shed realistic safety check (10°C to 50°C)
  if (isNaN(calculated) || calculated < 5 || calculated > 55) {
    return {
      isValid: false,
      temperature: null,
      calculatedRaw: calculated,
      reason: `Calculated value (${calculated?.toFixed(1)}°C) falls outside realistic physical limits.`,
    };
  }

  return {
    isValid: true,
    temperature: parseFloat(calculated.toFixed(1)),
    t1,
    t2,
    y1,
    y2,
    yLiquid: meniscusY,
    ratio: parseFloat(ratio.toFixed(3)),
  };
}

/**
 * 5. HYBRID GEMINI + OPENCV VALIDATION
 * 
 * Compares detection from Gemini Vision with independent OpenCV measurements.
 * 
 * Returns one of three confidence states:
 * - 'high': Both engines agree within tolerance (<= 1.5°C). Auto-displays reading.
 * - 'medium': Slight variation (1.5°C - 3.0°C). Asks for confirmation or optional retake.
 * - 'low': Conflict (> 3.0°C) or failed detection. Disables auto-save, requires retake or manual entry.
 */
export function evaluateHybridResult(geminiData, openCvData, qualityData) {
  const geminiTemp = typeof geminiData?.temperature === 'number' ? geminiData.temperature : null;
  const openCvTemp = typeof openCvData?.temperature === 'number' ? openCvData.temperature : null;

  // 1. If quality was unacceptable
  if (qualityData && !qualityData.isAcceptable) {
    return {
      status: 'low',
      confidence: 0.2,
      temperature: geminiTemp,
      openCvReading: openCvTemp,
      disagreement: false,
      message: qualityData.message || 'Image quality insufficient.',
      details: { qualityData, geminiData, openCvData },
    };
  }

  // 2. Both Gemini and OpenCV provided valid readings
  if (geminiTemp !== null && openCvTemp !== null) {
    const diff = Math.abs(geminiTemp - openCvTemp);

    if (diff <= 1.5) {
      // High Confidence Agreement
      return {
        status: 'high',
        confidence: 0.98,
        temperature: Math.round(geminiTemp),
        exactTemperature: parseFloat(geminiTemp.toFixed(1)),
        openCvReading: openCvTemp,
        diff: parseFloat(diff.toFixed(1)),
        disagreement: false,
        message: `High confidence: Gemini (${geminiTemp}°C) and OpenCV (${openCvTemp}°C) verified within ${diff.toFixed(1)}°C.`,
        details: { qualityData, geminiData, openCvData },
      };
    } else if (diff <= 3.0) {
      // Medium Confidence
      return {
        status: 'medium',
        confidence: 0.85,
        temperature: Math.round(geminiTemp),
        exactTemperature: parseFloat(geminiTemp.toFixed(1)),
        openCvReading: openCvTemp,
        diff: parseFloat(diff.toFixed(1)),
        disagreement: false,
        message: `Medium confidence: Gemini read ${geminiTemp}°C, OpenCV calibrated at ${openCvTemp}°C (diff: ${diff.toFixed(1)}°C). Please confirm reading.`,
        details: { qualityData, geminiData, openCvData },
      };
    } else {
      // Conflict / Disagreement
      return {
        status: 'low',
        confidence: 0.4,
        temperature: Math.round(geminiTemp),
        exactTemperature: parseFloat(geminiTemp.toFixed(1)),
        openCvReading: openCvTemp,
        diff: parseFloat(diff.toFixed(1)),
        disagreement: true,
        message: `Vision conflict: Gemini detected ${geminiTemp}°C but OpenCV detected ${openCvTemp}°C (diff: ${diff.toFixed(1)}°C). Please retake photo with camera steady and centered.`,
        details: { qualityData, geminiData, openCvData },
      };
    }
  }

  // 3. Only Gemini succeeded (e.g. OpenCV could not isolate the capillary due to complex lighting)
  if (geminiTemp !== null) {
    return {
      status: 'medium',
      confidence: 0.82,
      temperature: Math.round(geminiTemp),
      exactTemperature: parseFloat(geminiTemp.toFixed(1)),
      openCvReading: null,
      disagreement: false,
      message: `Gemini detected ${geminiTemp}°C. OpenCV secondary check was inconclusive. Please verify reading before saving.`,
      details: { qualityData, geminiData, openCvData },
    };
  }

  // 4. Failed detection
  return {
    status: 'low',
    confidence: 0.1,
    temperature: null,
    openCvReading: null,
    disagreement: false,
    message: 'Could not reliably read thermometer. Please take a closer photograph with good lighting.',
    details: { qualityData, geminiData, openCvData },
  };
}
