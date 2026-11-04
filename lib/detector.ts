import {
  FilesetResolver,
  ObjectDetector,
  FaceDetector,
  type Detection,
} from "@mediapipe/tasks-vision";

let detectorInstance: ObjectDetector | null = null;
let initPromise: Promise<ObjectDetector> | null = null;

let faceDetectorInstance: FaceDetector | null = null;
let faceInitPromise: Promise<FaceDetector> | null = null;

/**
 * Inisialisasi MediaPipe ObjectDetector menggunakan aset lokal (tanpa CDN).
 * File WASM dimuat dari /mediapipe/ dan model dari /models/efficientdet_lite0.tflite.
 */
export async function getObjectDetector(): Promise<ObjectDetector> {
  if (detectorInstance) {
    return detectorInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks("/mediapipe");

    const detector = await ObjectDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "/models/efficientdet_lite0.tflite",
      },
      runningMode: "VIDEO",
      categoryAllowlist: ["person"],
      scoreThreshold: 0.4,
    });

    detectorInstance = detector;
    return detector;
  })();

  return initPromise;
}

/**
 * Inisialisasi MediaPipe FaceDetector menggunakan aset lokal (/models/blaze_face_short_range.tflite).
 * Digunakan khusus untuk mendeteksi titik koordinat wajah secara presisi agar privasi blur 100% akurat.
 */
export async function getFaceDetector(): Promise<FaceDetector> {
  if (faceDetectorInstance) {
    return faceDetectorInstance;
  }

  if (faceInitPromise) {
    return faceInitPromise;
  }

  faceInitPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks("/mediapipe");

    const faceDetector = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "/models/blaze_face_short_range.tflite",
      },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.45,
    });

    faceDetectorInstance = faceDetector;
    return faceDetector;
  })();

  return faceInitPromise;
}

export type { Detection };
