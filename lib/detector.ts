import {
  FilesetResolver,
  ObjectDetector,
  type Detection,
} from "@mediapipe/tasks-vision";

let detectorInstance: ObjectDetector | null = null;
let initPromise: Promise<ObjectDetector> | null = null;

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
    // FilesetResolver menunjuk ke direktori lokal public/mediapipe
    const vision = await FilesetResolver.forVisionTasks("/mediapipe");

    const detector = await ObjectDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "/models/efficientdet_lite0.tflite",
      },
      runningMode: "VIDEO",
      categoryAllowlist: ["person"],
      scoreThreshold: 0.5,
    });

    detectorInstance = detector;
    return detector;
  })();

  return initPromise;
}

export type { Detection };
