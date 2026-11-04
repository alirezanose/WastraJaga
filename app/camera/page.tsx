"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { getObjectDetector, type Detection } from "@/lib/detector";
import { ObjectTracker, type TrackedPerson } from "@/lib/tracker";
import { cropAndBlurHead } from "@/lib/crop";
import type { ObjectDetector } from "@mediapipe/tasks-vision";

// Status busana yang mungkin (sesuai AGENTS.md)
type PersonStatus = "pending" | "ok" | "violation" | "uncertain" | "error";

interface TrackStatus {
  status: PersonStatus;
  reasons: string[];
}

// Warna overlay kotak sesuai status
const STATUS_COLORS: Record<PersonStatus, { stroke: string; fill: string; badge: string; text: string }> = {
  pending:   { stroke: "#71717a", fill: "rgba(244,244,245,0.15)", badge: "#ffffff", text: "#09090b" },
  ok:        { stroke: "#16a34a", fill: "rgba(220,252,231,0.20)", badge: "#16a34a", text: "#ffffff" },
  violation: { stroke: "#dc2626", fill: "rgba(254,226,226,0.20)", badge: "#dc2626", text: "#ffffff" },
  uncertain: { stroke: "#ca8a04", fill: "rgba(254,249,195,0.20)", badge: "#ca8a04", text: "#ffffff" },
  error:     { stroke: "#71717a", fill: "rgba(244,244,245,0.10)", badge: "#ffffff", text: "#71717a" },
};

const STATUS_ICON: Record<PersonStatus, string> = {
  pending:   "○",
  ok:        "✓",
  violation: "✗",
  uncertain: "?",
  error:     "–",
};

// Jumlah frame stabil sebelum dikirim ke /api/scan
const STABLE_FRAMES_REQUIRED = 3;
const DEFAULT_CAMERA_TOKEN = "dev-camera-token-12345";

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

  // Track IDs yang sudah dikirim ke /api/scan (sekali per ID)
  const scannedTracksRef = useRef<Set<number>>(new Set());
  // Hitungan frame stabil per track ID
  const stableFrameCountRef = useRef<Map<number, number>>(new Map());
  // Status terkini per track ID
  const trackStatusRef = useRef<Map<number, TrackStatus>>(new Map());

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingStep, setLoadingStep] = useState<string>("Menyiapkan...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [personCount, setPersonCount] = useState<number>(0);
  // Trigger re-render saat status track berubah
  const [, setStatusVersion] = useState<number>(0);

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

  // Kirim crop ke /api/scan dan simpan hasilnya
  const scanPerson = useCallback(
    async (trackId: number, box: TrackedPerson["box"]) => {
      const video = videoRef.current;
      if (!video) return;

      // Buat crop + blur kepala di browser (privasi)
      const imageBase64 = cropAndBlurHead(video, box);
      if (!imageBase64) return;

      const cameraToken =
        process.env.NEXT_PUBLIC_CAMERA_API_TOKEN || DEFAULT_CAMERA_TOKEN;

      try {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-camera-token": cameraToken,
          },
          body: JSON.stringify({
            temple_id: "temple-besakih-01",
            camera_id: "camera-candi-bentar-01",
            track_id: trackId,
            image: imageBase64,
          }),
        });

        if (!res.ok) {
          console.warn(`[scan] HTTP ${res.status} untuk track #${trackId}`);
          trackStatusRef.current.set(trackId, { status: "error", reasons: [`HTTP ${res.status}`] });
        } else {
          const data = await res.json() as {
            status: PersonStatus;
            reasons: string[];
            confidence: number;
            latency_ms: number;
          };
          console.log(`[scan] track #${trackId} → ${data.status} (${data.latency_ms}ms)`);
          trackStatusRef.current.set(trackId, {
            status: data.status,
            reasons: data.reasons,
          });
        }
      } catch (err) {
        console.error(`[scan] Gagal kirim track #${trackId}:`, err);
        trackStatusRef.current.set(trackId, { status: "error", reasons: ["Koneksi gagal"] });
      }

      // Trigger re-render agar warna overlay terupdate
      setStatusVersion((v) => v + 1);
    },
    []
  );

  // Inisialisasi model dan kamera
  const startCamera = useCallback(async () => {
    stopStream();
    setIsLoading(true);
    setErrorMessage(null);
    trackerRef.current.reset();
    scannedTracksRef.current.clear();
    stableFrameCountRef.current.clear();
    trackStatusRef.current.clear();

    try {
      setLoadingStep("Memuat model MediaPipe...");
      const detector = await getObjectDetector();
      detectorRef.current = detector;

      setLoadingStep("Meminta izin akses kamera...");
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Browser Anda tidak mendukung akses kamera (getUserMedia).");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
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
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setErrorMessage("Akses kamera ditolak. Berikan izin kamera di pengaturan browser Anda.");
          return;
        }
        if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          setErrorMessage("Perangkat kamera tidak ditemukan. Pastikan webcam terhubung.");
          return;
        }
        if (err.name === "NotReadableError" || err.name === "TrackStartError") {
          setErrorMessage("Kamera sedang digunakan aplikasi lain atau tidak dapat diakses.");
          return;
        }
      }

      const msg = err instanceof Error ? err.message : "Gagal memuat kamera atau model deteksi.";
      setErrorMessage(msg);
    }
  }, [stopStream]);

  // Gambar overlay bounding box berwarna sesuai status person + sensor privasi kepala
  const drawOverlay = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      trackedPersons: TrackedPerson[],
      canvasWidth: number,
      canvasHeight: number
    ) => {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      for (const person of trackedPersons) {
        const { originX, originY, width, height } = person.box;
        const trackInfo = trackStatusRef.current.get(person.id);
        const status: PersonStatus = trackInfo?.status ?? "pending";
        const colors = STATUS_COLORS[status];
        const icon = STATUS_ICON[status];

        // 1. Kotak deteksi seluruh badan
        ctx.lineWidth = 2;
        ctx.strokeStyle = colors.stroke;
        ctx.fillStyle = colors.fill;
        ctx.beginPath();
        ctx.rect(originX, originY, width, height);
        ctx.stroke();
        ctx.fill();

        // 2. Sensor privasi visual area kepala (28% tinggi atas)
        const headH = Math.round(height * 0.28);
        if (headH > 0) {
          ctx.save();
          // Efek blur gelap semi-opak dengan pattern grid halus
          ctx.fillStyle = "rgba(24, 24, 27, 0.75)";
          ctx.fillRect(originX, originY, width, headH);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
          ctx.lineWidth = 1;
          ctx.strokeRect(originX, originY, width, headH);

          // Tulisan "PRIVACY / BLUR" kecil di area kepala
          ctx.fillStyle = "#ffffff";
          ctx.font = "600 10px monospace";
          ctx.fillText("PRIVASI", originX + 6, originY + 14);
          ctx.restore();
        }

        // 3. Badge label utama di atas kotak
        const statusText =
          status === "pending"
            ? "Menganalisis busana..."
            : status === "ok"
            ? "Sesuai Adat"
            : status === "violation"
            ? "Perlu Pengecekan"
            : status === "uncertain"
            ? "Verifikasi Petugas"
            : "Gagal Scan";

        const label = `#${person.id} ${icon} ${statusText}`;
        ctx.font = "600 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        const textW = ctx.measureText(label).width;
        const padX = 8;
        const badgeH = 22;
        const badgeW = textW + padX * 2;
        const badgeY = Math.max(0, originY - badgeH - 4);

        // Background badge
        ctx.fillStyle = colors.badge;
        ctx.fillRect(originX, badgeY, badgeW, badgeH);

        // Border badge
        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(originX, badgeY, badgeW, badgeH);

        // Teks badge
        ctx.fillStyle = colors.text;
        ctx.fillText(label, originX + padX, badgeY + 15);

        // 4. Jika ada alasan pelanggaran/catatan, tampilkan sub-badge di bawahnya
        if (trackInfo?.reasons && trackInfo.reasons.length > 0 && status !== "ok") {
          const reasonText = trackInfo.reasons[0];
          ctx.font = "500 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
          const reasonW = ctx.measureText(reasonText).width + 12;
          const subY = originY + height + 6;

          ctx.fillStyle = "#ffffff";
          ctx.fillRect(originX, subY, Math.max(badgeW, reasonW), 18);
          ctx.strokeStyle = colors.stroke;
          ctx.strokeRect(originX, subY, Math.max(badgeW, reasonW), 18);
          ctx.fillStyle = "#09090b";
          ctx.fillText(reasonText, originX + 6, subY + 13);
        }
      }
    },
    []
  );

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
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
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
                  (cat) => cat.categoryName.toLowerCase() === "person" && (cat.score ?? 0) >= 0.5
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

            // Cek track ID baru → hitung frame stabil → scan jika cukup stabil
            for (const person of activeTracks) {
              const id = person.id;
              if (scannedTracksRef.current.has(id)) continue;

              const count = (stableFrameCountRef.current.get(id) ?? 0) + 1;
              stableFrameCountRef.current.set(id, count);

              if (count >= STABLE_FRAMES_REQUIRED) {
                // Tandai sudah di-scan agar tidak scan ulang
                scannedTracksRef.current.add(id);
                // Kirim crop ke /api/scan (non-blocking)
                void scanPerson(id, person.box);
              }
            }

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
  }, [isLoading, errorMessage, scanPerson, drawOverlay]);

  // Mount effect
  useEffect(() => {
    startCamera();
    return () => { stopStream(); };
  }, [startCamera, stopStream]);

  return (
    <div className="min-h-screen bg-white text-zinc-900 flex flex-col items-center selection:bg-zinc-200">
      {/* Top Bar */}
      <header className="w-full max-w-6xl flex items-center justify-between p-4 sm:p-6 border-b border-zinc-200">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-xs uppercase tracking-widest font-mono text-zinc-600 hover:text-zinc-950 transition-colors"
          >
            ← Beranda
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
              {errorMessage ? "Error" : isLoading ? loadingStep : "Aktif"}
            </span>
          </div>

          <div className="border border-zinc-200 px-3 py-1 bg-zinc-50 text-zinc-700">
            FPS: <span className="text-zinc-950 font-semibold">{fps}</span>
          </div>

          <div className="border border-zinc-200 px-3 py-1 bg-zinc-50 text-zinc-700">
            Orang: <span className="text-zinc-950 font-semibold">{personCount}</span>
          </div>

          <Link
            href="/dashboard"
            className="border border-zinc-900 bg-zinc-950 px-3 py-1 text-xs font-mono uppercase text-white hover:bg-white hover:text-zinc-950 transition-colors"
          >
            Dashboard &rarr;
          </Link>
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
          <video ref={videoRef} playsInline muted className="w-full h-full object-contain" />

          {/* Canvas Overlay */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          />

          {/* Banner Indikator Privasi (Kanan Atas Frame) */}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-2 border border-zinc-300 bg-white/95 px-3 py-1 font-mono text-[11px] text-zinc-700 shadow-sm backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
            <span>PRIVACY GUARD: HEAD BLUR ON-DEVICE</span>
          </div>

          {/* Legenda Status (kiri bawah) */}
          {!isLoading && !errorMessage && (
            <div className="absolute bottom-4 left-4 z-20 flex flex-col gap-1 bg-white/90 p-2.5 border border-zinc-200 backdrop-blur-sm shadow-sm">
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">Status Penilaian</span>
              {(["pending","ok","violation","uncertain"] as PersonStatus[]).map((s) => (
                <div key={s} className="flex items-center gap-1.5 text-xs font-mono">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm border"
                    style={{
                      backgroundColor: STATUS_COLORS[s].fill.replace("0.20","0.8").replace("0.15","0.8"),
                      borderColor: STATUS_COLORS[s].stroke,
                    }}
                  />
                  <span className="text-zinc-700">
                    {s === "pending"
                      ? "pending (menganalisis)"
                      : s === "ok"
                      ? "ok (busana sesuai)"
                      : s === "violation"
                      ? "violation (pelanggaran)"
                      : "uncertain (ragu/cek manual)"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
