"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { getObjectDetector, type Detection } from "@/lib/detector";
import { ObjectTracker, type TrackedPerson } from "@/lib/tracker";
import type { ObjectDetector } from "@mediapipe/tasks-vision";

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const detectorRef = useRef<ObjectDetector | null>(null);
  const trackerRef = useRef<ObjectTracker>(
    new ObjectTracker({
      iouThreshold: 0.3,
      maxMissedFrames: 20,
      maxCentroidDistance: 120,
    })
  );

  const streamRef = useRef<MediaStream | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const fpsTimerRef = useRef<number>(0);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingStep, setLoadingStep] = useState<string>("Menyiapkan...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [personCount, setPersonCount] = useState<number>(0);

  // Stop video stream
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
  }, []);

  // Inisialisasi model dan kamera
  const startCamera = useCallback(async () => {
    stopStream();
    setIsLoading(true);
    setErrorMessage(null);
    trackerRef.current.reset();

    try {
      setLoadingStep("Memuat model MediaPipe...");
      const detector = await getObjectDetector();
      detectorRef.current = detector;

      setLoadingStep("Meminta izin akses kamera...");
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          "Browser Anda tidak mendukung akses kamera (getUserMedia)."
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play().catch((err) => {
              console.error("Gagal memutar stream video:", err);
            });
            setIsLoading(false);
          }
        };
      }
    } catch (err: unknown) {
      console.error("Error inisialisasi kamera / model:", err);
      stopStream();
      setIsLoading(false);

      if (err instanceof DOMException) {
        if (
          err.name === "NotAllowedError" ||
          err.name === "PermissionDeniedError"
        ) {
          setErrorMessage(
            "Akses kamera ditolak. Berikan izin kamera di pengaturan browser Anda."
          );
          return;
        }
        if (
          err.name === "NotFoundError" ||
          err.name === "DevicesNotFoundError"
        ) {
          setErrorMessage(
            "Perangkat kamera tidak ditemukan. Pastikan webcam terhubung."
          );
          return;
        }
        if (
          err.name === "NotReadableError" ||
          err.name === "TrackStartError"
        ) {
          setErrorMessage(
            "Kamera sedang digunakan aplikasi lain atau tidak dapat diakses."
          );
          return;
        }
      }

      const msg =
        err instanceof Error
          ? err.message
          : "Gagal memuat kamera atau model deteksi.";
      setErrorMessage(msg);
    }
  }, [stopStream]);

  // Menggambar overlay bounding box abu-abu minimalis dan label status (The White Album style)
  const drawOverlay = (
    ctx: CanvasRenderingContext2D,
    trackedPersons: TrackedPerson[],
    canvasWidth: number,
    canvasHeight: number
  ) => {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    for (const person of trackedPersons) {
      const { originX, originY, width, height } = person.box;

      // Kotak ABU netral presisi sesuai status "pending" di AGENTS.md
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#71717a"; // Zinc-500
      ctx.fillStyle = "rgba(244, 244, 245, 0.15)"; // Zinc-100 halus

      // Gambar kotak
      ctx.beginPath();
      ctx.rect(originX, originY, width, height);
      ctx.stroke();
      ctx.fill();

      // Gambar label badge di atas kotak - gaya monokrom bersih
      const labelText = `#${person.id} menganalisis...`;
      ctx.font = "500 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      const textMetrics = ctx.measureText(labelText);
      const paddingX = 8;
      const badgeHeight = 22;
      const badgeWidth = textMetrics.width + paddingX * 2;
      const badgeY = Math.max(0, originY - badgeHeight - 4);

      // Background badge putih bersih
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(originX, badgeY, badgeWidth, badgeHeight);

      // Border halus badge
      ctx.strokeStyle = "#18181b"; // Zinc-900 border tegas
      ctx.lineWidth = 1;
      ctx.strokeRect(originX, badgeY, badgeWidth, badgeHeight);

      // Teks label hitam arang
      ctx.fillStyle = "#09090b";
      ctx.fillText(labelText, originX + paddingX, badgeY + 15);
    }
  };

  // Detection loop
  useEffect(() => {
    let active = true;

    const renderLoop = (timestamp: number) => {
      if (!active) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const detector = detectorRef.current;

      if (
        video &&
        canvas &&
        detector &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        if (
          canvas.width !== video.videoWidth ||
          canvas.height !== video.videoHeight
        ) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        const ctx = canvas.getContext("2d");
        if (ctx) {
          try {
            const detectionResult = detector.detectForVideo(video, timestamp);

            const personBoxes = (detectionResult.detections || [])
              .filter((det: Detection) =>
                det.categories.some(
                  (cat) =>
                    cat.categoryName.toLowerCase() === "person" &&
                    (cat.score ?? 0) >= 0.5
                )
              )
              .map((det: Detection) => {
                const b = det.boundingBox!;
                return {
                  originX: Math.max(0, b.originX),
                  originY: Math.max(0, b.originY),
                  width: Math.min(b.width, video.videoWidth - b.originX),
                  height: Math.min(b.height, video.videoHeight - b.originY),
                };
              });

            const activeTracks = trackerRef.current.update(personBoxes);
            drawOverlay(ctx, activeTracks, canvas.width, canvas.height);
            setPersonCount(activeTracks.length);
          } catch (detError) {
            console.error("Gagal deteksi frame:", detError);
          }
        }
      }

      frameCountRef.current++;
      if (timestamp - fpsTimerRef.current >= 1000) {
        const currentFps = Math.round(
          (frameCountRef.current * 1000) / (timestamp - fpsTimerRef.current)
        );
        setFps(currentFps);
        frameCountRef.current = 0;
        fpsTimerRef.current = timestamp;
      }

      lastTimeRef.current = timestamp;
      animFrameIdRef.current = requestAnimationFrame(renderLoop);
    };

    if (!isLoading && !errorMessage) {
      fpsTimerRef.current = performance.now();
      frameCountRef.current = 0;
      animFrameIdRef.current = requestAnimationFrame(renderLoop);
    }

    return () => {
      active = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [isLoading, errorMessage]);

  // Mount effect
  useEffect(() => {
    startCamera();
    return () => {
      stopStream();
    };
  }, [startCamera, stopStream]);

  return (
    <div className="min-h-screen bg-white text-zinc-900 flex flex-col items-center selection:bg-zinc-200">
      {/* Top Bar - The White Album clean minimalist header */}
      <header className="w-full max-w-6xl flex items-center justify-between p-4 sm:p-6 border-b border-zinc-200">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-xs uppercase tracking-widest font-mono text-zinc-600 hover:text-zinc-950 transition-colors"
          >
            &larr; Beranda
          </Link>
          <span className="text-zinc-300">/</span>
          <h1 className="text-sm font-medium tracking-tight text-zinc-950">
            Kamera Masuk Pura
          </h1>
        </div>

        {/* Telemetry Chips */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 border border-zinc-200 px-3 py-1 bg-zinc-50">
            <span
              className={`h-2 w-2 rounded-full ${
                errorMessage
                  ? "bg-rose-500"
                  : isLoading
                  ? "bg-amber-400 animate-pulse"
                  : "bg-zinc-900"
              }`}
            />
            <span className="text-zinc-700">
              {errorMessage
                ? "Error"
                : isLoading
                ? loadingStep
                : "Aktif"}
            </span>
          </div>

          <div className="border border-zinc-200 px-3 py-1 bg-zinc-50 text-zinc-700">
            FPS: <span className="text-zinc-950 font-semibold">{fps}</span>
          </div>

          <div className="border border-zinc-200 px-3 py-1 bg-zinc-50 text-zinc-700">
            Orang: <span className="text-zinc-950 font-semibold">{personCount}</span>
          </div>
        </div>
      </header>

      {/* Viewport Frame */}
      <main className="relative flex-1 w-full max-w-6xl flex items-center justify-center p-4 sm:p-6">
        <div className="relative w-full aspect-video max-h-[78vh] bg-zinc-100 border border-zinc-200 overflow-hidden flex items-center justify-center shadow-sm">
          {/* Loading Indicator */}
          {isLoading && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm p-6 text-center">
              <div className="h-8 w-8 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin mb-4" />
              <p className="text-xs font-mono uppercase tracking-widest text-zinc-800">
                {loadingStep}
              </p>
              <p className="text-xs text-zinc-600 mt-1 font-light">
                Memuat modul WASM dan model MediaPipe on-device...
              </p>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white p-6 text-center max-w-md mx-auto">
              <div className="h-10 w-10 border border-rose-500 flex items-center justify-center text-rose-600 font-mono text-sm mb-3">
                !
              </div>
              <h2 className="text-sm font-semibold tracking-tight text-zinc-900 mb-1">
                Kamera Tidak Tersedia
              </h2>
              <p className="text-xs text-zinc-600 mb-6 font-light">{errorMessage}</p>
              <button
                type="button"
                onClick={startCamera}
                className="px-5 py-2 border border-zinc-900 bg-zinc-950 hover:bg-white hover:text-zinc-950 text-white text-xs font-mono uppercase tracking-wider transition-colors"
              >
                Coba Lagi
              </button>
            </div>
          )}

          {/* Video Stream */}
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-contain"
          />

          {/* Canvas Overlay */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          />

          {/* Status Label Corner */}
          {!isLoading && !errorMessage && (
            <div className="absolute bottom-4 left-4 z-20 flex gap-2">
              <div className="border border-zinc-200 bg-white/95 px-3 py-1 text-xs font-mono text-zinc-700 shadow-sm">
                Status: <span className="text-zinc-900 font-medium">pending (abu)</span>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
