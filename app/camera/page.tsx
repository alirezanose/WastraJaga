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
            "Akses kamera ditolak. Silakan berikan izin akses kamera di pengaturan browser Anda."
          );
          return;
        }
        if (
          err.name === "NotFoundError" ||
          err.name === "DevicesNotFoundError"
        ) {
          setErrorMessage(
            "Perangkat kamera tidak ditemukan. Pastikan webcam/kamera terhubung."
          );
          return;
        }
        if (
          err.name === "NotReadableError" ||
          err.name === "TrackStartError"
        ) {
          setErrorMessage(
            "Kamera sedang digunakan oleh aplikasi lain atau tidak dapat dibaca."
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

  // Menggambar overlay bounding box abu-abu dan label status
  const drawOverlay = (
    ctx: CanvasRenderingContext2D,
    trackedPersons: TrackedPerson[],
    canvasWidth: number,
    canvasHeight: number
  ) => {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    for (const person of trackedPersons) {
      const { originX, originY, width, height } = person.box;

      // Kotak ABU sesuai status "pending" di AGENTS.md
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#94a3b8"; // Slate-400 (Abu)
      ctx.fillStyle = "rgba(148, 163, 184, 0.15)";

      // Gambar kotak
      ctx.beginPath();
      ctx.rect(originX, originY, width, height);
      ctx.stroke();
      ctx.fill();

      // Gambar label badge di atas kotak
      const labelText = `#${person.id} menganalisis...`;
      ctx.font = "bold 13px sans-serif";
      const textMetrics = ctx.measureText(labelText);
      const paddingX = 8;
      const badgeHeight = 22;
      const badgeWidth = textMetrics.width + paddingX * 2;
      const badgeY = Math.max(0, originY - badgeHeight - 2);

      // Background badge abu-abu
      ctx.fillStyle = "rgba(51, 65, 85, 0.9)"; // Slate-700
      ctx.fillRect(originX, badgeY, badgeWidth, badgeHeight);

      // Border badge
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1;
      ctx.strokeRect(originX, badgeY, badgeWidth, badgeHeight);

      // Teks label
      ctx.fillStyle = "#f8fafc";
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
        // Sinkronisasi ukuran canvas dengan video
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
            // Jalankan deteksi MediaPipe pada video frame
            const detectionResult = detector.detectForVideo(video, timestamp);

            // Filter hanya kategori "person"
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

            // Update tracker IoU & Centroid
            const activeTracks = trackerRef.current.update(personBoxes);

            // Gambar overlay
            drawOverlay(ctx, activeTracks, canvas.width, canvas.height);
            setPersonCount(activeTracks.length);
          } catch (detError) {
            console.error("Gagal menjalankan deteksi frame:", detError);
          }
        }
      }

      // Hitung FPS
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
    <div className="relative min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center">
      {/* Top Navigation Bar */}
      <header className="w-full max-w-6xl flex items-center justify-between p-4 border-b border-slate-800 z-20">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-slate-400 hover:text-white transition-colors text-sm font-medium"
          >
            &larr; Beranda
          </Link>
          <span className="text-slate-600">|</span>
          <h1 className="text-base font-semibold text-slate-200">
            Kamera Deteksi Masuk Pura
          </h1>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-full">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                errorMessage
                  ? "bg-rose-500"
                  : isLoading
                  ? "bg-amber-400 animate-pulse"
                  : "bg-emerald-500"
              }`}
            />
            <span className="text-slate-300">
              {errorMessage
                ? "Error"
                : isLoading
                ? loadingStep
                : "Deteksi Aktif"}
            </span>
          </div>

          <div className="bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-full text-slate-300">
            FPS: <span className="text-emerald-400 font-bold">{fps}</span>
          </div>

          <div className="bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-full text-slate-300">
            Orang:{" "}
            <span className="text-emerald-400 font-bold">{personCount}</span>
          </div>
        </div>
      </header>

      {/* Main Viewport */}
      <main className="relative flex-1 w-full max-w-6xl flex items-center justify-center p-4">
        <div className="relative w-full aspect-video max-h-[78vh] bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center">
          {/* Loading Indicator */}
          {isLoading && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm p-6 text-center">
              <div className="h-12 w-12 border-4 border-slate-700 border-t-emerald-500 rounded-full animate-spin mb-4" />
              <p className="text-sm font-medium text-slate-200">
                {loadingStep}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Memuat modul WASM dan model MediaPipe lokal...
              </p>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/90 p-6 text-center max-w-lg mx-auto">
              <div className="h-14 w-14 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 text-2xl font-bold mb-4">
                !
              </div>
              <h2 className="text-lg font-semibold text-rose-300 mb-2">
                Kendala Akses Kamera / Model
              </h2>
              <p className="text-sm text-slate-300 mb-6">{errorMessage}</p>
              <button
                type="button"
                onClick={startCamera}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-medium text-sm transition-colors shadow-lg"
              >
                Coba Lagi
              </button>
            </div>
          )}

          {/* Video Stream Element */}
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-contain"
          />

          {/* Canvas Detection Overlay */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          />

          {/* Overlay Info Corner */}
          {!isLoading && !errorMessage && (
            <div className="absolute bottom-4 left-4 z-20 flex gap-2">
              <div className="bg-slate-950/80 backdrop-blur border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-300">
                Status: <span className="text-slate-400">pending (abu)</span>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
