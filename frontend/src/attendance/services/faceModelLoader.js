let faceapiInstance = null;
let modelsLoaded = false;
let loadPromise = null;

export async function getFaceApi() {
  if (faceapiInstance) return faceapiInstance;
  if (typeof window !== 'undefined' && window.faceapi) {
    faceapiInstance = window.faceapi;
    return faceapiInstance;
  }

  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      return reject(new Error('faceapi requires a browser environment.'));
    }

    const existingScript = document.querySelector('script[data-face-api="true"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        faceapiInstance = window.faceapi;
        resolve(faceapiInstance);
      });
      existingScript.addEventListener('error', (e) => reject(e));
      return;
    }

    const script = document.createElement('script');
    script.src = '/face-api.min.js';
    script.async = true;
    script.dataset.faceApi = 'true';
    script.onload = () => {
      faceapiInstance = window.faceapi;
      resolve(faceapiInstance);
    };
    script.onerror = () => {
      reject(new Error('Failed to load /face-api.min.js script.'));
    };
    document.head.appendChild(script);
  });
}

export async function loadFaceModels(modelUri = '/models') {
  if (modelsLoaded) return true;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const faceapi = await getFaceApi();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(modelUri),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(modelUri),
        faceapi.nets.faceRecognitionNet.loadFromUri(modelUri),
      ]);
      modelsLoaded = true;
      return true;
    } catch (err) {
      loadPromise = null;
      console.error('Failed to load face detection models:', err);
      throw new Error('Unable to initialize face recognition models. Please refresh.');
    }
  })();

  return loadPromise;
}

export function areModelsLoaded() {
  return modelsLoaded;
}

export async function detectFaceForEnrolment(input) {
  const faceapi = await getFaceApi();
  await loadFaceModels();

  // We use detectAllFaces first to ensure there is strictly ONE face in the frame!
  // High-resolution inputSize 416 extracts crisp landmarks to avoid duplicate/ambiguous profiles
  const detections = await faceapi
    .detectAllFaces(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.60 }))
    .withFaceLandmarks(true)
    .withFaceDescriptors();

  if (!detections || detections.length === 0) {
    return { status: 'NO_FACE', message: 'No face detected in camera.' };
  }

  if (detections.length > 1) {
    return {
      status: 'MULTIPLE_FACES',
      message: `${detections.length} faces detected. Only one person should be in the frame.`,
    };
  }

  const detection = detections[0];
  const box = detection.detection.box;

  // Basic quality checks: face box should be sufficiently large
  if (box.width < 90 || box.height < 90) {
    return {
      status: 'TOO_FAR',
      message: 'Please move closer to the camera.',
      detection,
    };
  }

  // Convert Float32Array to standard JavaScript Array of numbers
  const descriptor = Array.from(detection.descriptor);

  return {
    status: 'SUCCESS',
    descriptor,
    detection,
    score: detection.detection.score,
    box: {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
    },
  };
}

export async function detectAndRecognizeFaces(input, enrolledWorkers = [], threshold = 0.40) {
  const faceapi = await getFaceApi();
  await loadFaceModels();

  // Optimized inputSize 320 provides fast real-time performance on mobile while maintaining accurate landmarks
  const detections = await faceapi
    .detectAllFaces(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.50 }))
    .withFaceLandmarks(true)
    .withFaceDescriptors();

  if (!detections || detections.length === 0) {
    return { faces: [], bestMatch: null, ambiguousMatch: null };
  }

  const recognized = detections.map((det) => {
    const queryDesc = det.descriptor;
    let bestWorker = null;
    let minDistance = 1.0;
    let secondBestWorker = null;
    let secondMinDistance = 1.0;

    for (const enrolled of enrolledWorkers) {
      if (!enrolled.descriptor || enrolled.descriptor.length !== 128) continue;
      const dist = faceapi.euclideanDistance(queryDesc, enrolled.descriptor);
      if (dist < minDistance) {
        // Demote previous best to second best
        secondMinDistance = minDistance;
        secondBestWorker = bestWorker;
        minDistance = dist;
        bestWorker = enrolled;
      } else if (dist < secondMinDistance) {
        secondMinDistance = dist;
        secondBestWorker = enrolled;
      }
    }

    // Ambiguity guard: If 2 workers have near-identical distances (gap < 0.04),
    // do NOT mark attendance for the wrong person! Require a clearer angle.
    const isAmbiguous = bestWorker && secondBestWorker && (secondMinDistance - minDistance < 0.04) && (minDistance <= threshold);

    // Strict threshold (<= 0.40) and must not be ambiguous between two similar workers
    const matched = bestWorker && minDistance <= threshold && !isAmbiguous;
    return {
      box: det.detection.box,
      score: det.detection.score,
      matched,
      isAmbiguous,
      worker: matched ? bestWorker : null,
      ambiguousCandidates: isAmbiguous ? [bestWorker, secondBestWorker] : [],
      distance: minDistance,
      margin: secondMinDistance - minDistance,
      confidence: Math.max(0, Math.min(100, Math.round((1 - minDistance) * 100))),
    };
  });

  // Find the most confident single match among detected faces
  const validMatches = recognized.filter((r) => r.matched);
  validMatches.sort((a, b) => a.distance - b.distance);
  const bestMatch = validMatches.length > 0 ? validMatches[0] : null;

  const ambiguousMatch = recognized.find((r) => r.isAmbiguous) || null;

  return {
    faces: recognized,
    bestMatch,
    ambiguousMatch,
  };
}


