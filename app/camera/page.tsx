"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { getObjectDetector, getFaceDetector, type Detection } from "@/lib/detector";
import { ObjectTracker, type TrackedPerson, type BoundingBox } from "@/lib/tracker";
import { cropAndBlurHead, pixelateRegionOnCanvas } from "@/lib/crop";
import type { ObjectDetector, FaceDetector } from "@mediapipe/tasks-vision";
import type { LLMOutput } from "@/lib/llm/schema";

// Status busana yang mungkin (sesuai AGENTS.md)
type PersonStatus = "pending" | "ok" | "violation" | "uncertain" | "error";

interface TrackStatus {
  status: PersonStatus;
  reasons: string[];
  confidence?: number;
  latencyMs?: number;
  attributes?: LLMOutput;
  updatedAt?: string;
}

interface ScanProofItem {
  channelId: string;
  trackId: number;
  timestamp: string;
  status: PersonStatus;
  reasons: string[];
  confidence: number;
  latencyMs: number;
  croppedDataUrl: string;
  attributes?: LLMOutput;
}

// Konfigurasi koneksi tiap slot CCTV sekunder (CAM-02 s/d CAM-04)
interface SecondarySlotConfig {
  mode: "standby" | "usb" | "ip_mjpeg" | "ip_video";
  deviceId?: string;
  streamUrl?: string;
}

// Warna overlay kotak sesuai status
const STATUS_COLORS: Record<
  PersonStatus,
  { stroke: string; fill: string; badge: string; text: string }
> = {
  pending:   { stroke: "#71717a", fill: "rgba(244,244,245,0.12)", badge: "#ffffff", text: "#09090b" },
  ok:        { stroke: "#16a34a", fill: "rgba(220,252,231,0.18)", badge: "#16a34a", text: "#ffffff" },
  violation: { stroke: "#dc2626", fill: "rgba(254,226,226,0.22)", badge: "#dc2626", text: "#ffffff" },
  uncertain: { stroke: "#ca8a04", fill: "rgba(254,249,195,0.18)", badge: "#ca8a04", text: "#ffffff" },
  error:     { stroke: "#71717a", fill: "rgba(244,244,245,0.10)", badge: "#ffffff", text: "#71717a" },
};

const STATUS_ICON: Record<PersonStatus, string> = {
  pending:   "○",
  ok:        "✓",
  violation: "✗",
  uncertain: "?",
  error:     "–",
};

// Konfigurasi pemindaian
const STABLE_FRAMES_REQUIRED = 2;
const RESCAN_INTERVAL_MS = 5000; // Scan ulang otomatis setiap 5 detik
const DEFAULT_CAMERA_TOKEN = "dev-camera-token-12345";

// Definisi 4 Channel CCTV Pura
const CCTV_CHANNELS = [
  {
    id: "CAM-01",
    cameraId: "camera-candi-bentar-01",
    label: "CANDI BENTAR UTAMA",
    zone: "Jaba Pisan · Pintu Masuk Utama",
    protocol: "USB UVC · ON-DEVICE AI",
  },
  {
    id: "CAM-02",
    cameraId: "camera-kori-agung-02",
    label: "KORI AGUNG TENGAH",
    zone: "Jaba Tengah · Koridor Pengunjung",
    protocol: "RTSP/WebRTC · HTTP MJPEG · USB",
  },
  {
    id: "CAM-03",
    cameraId: "camera-gerbang-selatan-03",
    label: "GERBANG SELATAN",
    zone: "Akses Pemedek & Wisatawan",
    protocol: "RTSP/WebRTC · HTTP MJPEG · USB",
  },
  {
    id: "CAM-04",
    cameraId: "camera-jaba-sisi-04",
    label: "POS PECALANG TIMUR",
    zone: "Area Peminjaman Kamen/Senteng",
    protocol: "RTSP/WebRTC · HTTP MJPEG · USB",
  },
] as const;

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const usbVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const usbCanvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const usbStreamsRef = useRef<Record<string, MediaStream | null>>({});
  const usbTrackersRef = useRef<Record<string, ObjectTracker>>({});
  const lastMpTimestampRef = useRef<number>(0);

  const detectorRef = useRef<ObjectDetector | null>(null);
  const faceDetectorRef = useRef<FaceDetector | null>(null);
  const trackerRef = useRef<ObjectTracker>(
    new ObjectTracker({
      iouThreshold: 0.25,
      maxMissedFrames: 25,
      maxCentroidDistance: 150,
    })
  );

  const streamRef = useRef<MediaStream | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const frameCountRef = useRef<number>(0);
  const fpsTimerRef = useRef<number>(0);

  // Tracking waktu scan terakhir per ID (untuk auto re-scan 5 detik)
  const lastScanTimeRef = useRef<Map<number, number>>(new Map());
  // Track ID yang sedang dalam proses request HTTP agar tidak tumpang-tindih
  const activeScanRef = useRef<Set<number>>(new Set());
  // Hitungan frame stabil per track ID
  const stableFrameCountRef = useRef<Map<number, number>>(new Map());
  // Status terkini per track ID
  const trackStatusRef = useRef<Map<number, TrackStatus>>(new Map());
  // Koordinat wajah terakhir untuk dipakai saat crop
  const latestFacesRef = useRef<BoundingBox[]>([]);
  // Daftar orang aktif terakhir untuk tombol "Scan Sekarang"
  const latestTracksRef = useRef<TrackedPerson[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingStep, setLoadingStep] = useState<string>("Menyiapkan...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [personCount, setPersonCount] = useState<number>(0);
  const [faceCount, setFaceCount] = useState<number>(0);
  const [clockStr, setClockStr] = useState<string>("--:--:-- WITA");

  // Layout CCTV: null = Grid 2x2, atau ID channel ("CAM-01", dll.) untuk 1x1 fokus
  const [activeChannel, setActiveChannel] = useState<string | null>(null);

  // Daftar perangkat kamera USB yang terdeteksi di komputer
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [primaryDeviceIdx, setPrimaryDeviceIdx] = useState<number>(0);
  // Konfigurasi tiap slot kamera sekunder (CAM-02, CAM-03, CAM-04) — default STANDBY (tidak menduplikasi CAM-01!)
  const [secondarySlots, setSecondarySlots] = useState<Record<string, SecondarySlotConfig>>({
    "CAM-02": { mode: "standby" },
    "CAM-03": { mode: "standby" },
    "CAM-04": { mode: "standby" },
  });
  const secondarySlotsRef = useRef<Record<string, SecondarySlotConfig>>({
    "CAM-02": { mode: "standby" },
    "CAM-03": { mode: "standby" },
    "CAM-04": { mode: "standby" },
  });
  // Modal/form inline pengaturan sumber kamera untuk slot tertentu
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState<string>("http://192.168.1.50:8080/video");

  // Bukti crop privasi terakhir & log hasil scan di sidebar
  const [latestProof, setLatestProof] = useState<ScanProofItem | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanProofItem[]>([]);
  const [, setStatusVersion] = useState<number>(0);

  // Jam real-time CCTV (WITA)
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const time = now.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      setClockStr(`${time} WITA`);
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    Object.values(usbStreamsRef.current).forEach((s) => {
      s?.getTracks().forEach((t) => t.stop());
    });
    usbStreamsRef.current = {};
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
  }, []);

  // Ganti kamera utama pada CAM-01 jika ada >1 webcam USB
  const switchPrimaryCamera = async () => {
    if (videoDevices.length < 2) return;
    const nextIdx = (primaryDeviceIdx + 1) % videoDevices.length;
    const targetDevice = videoDevices[nextIdx];
    if (!targetDevice) return;

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: targetDevice.deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = newStream;
      setPrimaryDeviceIdx(nextIdx);
      trackerRef.current.reset();
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      alert(
        `Gagal mengganti kamera CAM-01: ${
          err instanceof Error ? err.message : "Perangkat sedang dipakai"
        }`
      );
    }
  };

  // Hubungkan slot sekunder ke USB webcam tertentu
  const connectSlotToUsb = async (slotId: string, deviceId: string) => {
    try {
      const oldStream = usbStreamsRef.current[slotId];
      oldStream?.getTracks().forEach((t) => t.stop());

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 360 } },
        audio: false,
      });
      usbStreamsRef.current[slotId] = newStream;
      usbTrackersRef.current[slotId] = new ObjectTracker({
        iouThreshold: 0.25,
        maxMissedFrames: 25,
        maxCentroidDistance: 150,
      });
      setSecondarySlots((prev) => {
        const next: Record<string, SecondarySlotConfig> = {
          ...prev,
          [slotId]: { mode: "usb", deviceId },
        };
        secondarySlotsRef.current = next;
        return next;
      });
      setEditingSlot(null);

      setTimeout(() => {
        const videoEl = usbVideoRefs.current[slotId];
        if (videoEl) {
          videoEl.srcObject = newStream;
          videoEl.play().catch(() => {});
        }
      }, 100);
    } catch (err) {
      alert(
        `Gagal membuka kamera USB pada ${slotId}: ${
          err instanceof Error ? err.message : "Perangkat sedang dipakai"
        }`
      );
    }
  };

  // Hubungkan slot sekunder ke IP Camera (MJPEG / HLS / HTTP Stream)
  const connectSlotToIpUrl = (slotId: string, url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    const isVideoFileOrHls =
      trimmed.endsWith(".m3u8") || trimmed.endsWith(".mp4") || trimmed.endsWith(".webm");
    setSecondarySlots((prev) => {
      const next: Record<string, SecondarySlotConfig> = {
        ...prev,
        [slotId]: {
          mode: isVideoFileOrHls ? "ip_video" : "ip_mjpeg",
          streamUrl: trimmed,
        },
      };
      secondarySlotsRef.current = next;
      return next;
    });
    setEditingSlot(null);
  };

  // Putuskan slot sekunder kembali ke STANDBY
  const disconnectSlot = (slotId: string) => {
    const oldStream = usbStreamsRef.current[slotId];
    oldStream?.getTracks().forEach((t) => t.stop());
    delete usbStreamsRef.current[slotId];
    delete usbTrackersRef.current[slotId];
    setSecondarySlots((prev) => {
      const next: Record<string, SecondarySlotConfig> = {
        ...prev,
        [slotId]: { mode: "standby" },
      };
      secondarySlotsRef.current = next;
      return next;
    });
    setEditingSlot(null);
  };

  // Kirim crop yang sudah di-blur wajahnya ke /api/scan (mendukung CAM-01 s/d CAM-04)
  const scanPerson = useCallback(
    async (
      trackId: number,
      box: TrackedPerson["box"],
      faces: BoundingBox[],
      sourceVideo?: HTMLVideoElement | null,
      channelId: string = "CAM-01"
    ) => {
      const video = sourceVideo ?? videoRef.current;
      if (!video || activeScanRef.current.has(trackId)) return;

      activeScanRef.current.add(trackId);
      lastScanTimeRef.current.set(trackId, Date.now());

      // 1. Buat crop + pixelate wajah di browser (privasi 100% on-device)
      const croppedDataUrl = cropAndBlurHead(
        video,
        box,
        { includeDataUrlPrefix: true },
        faces
      );
      if (!croppedDataUrl) {
        activeScanRef.current.delete(trackId);
        return;
      }

      const imageBase64 = croppedDataUrl.replace(/^data:image\/[a-z]+;base64,/, "");
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

        const nowTime = new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });

        if (!res.ok) {
          trackStatusRef.current.set(trackId, {
            status: "error",
            reasons: [`HTTP ${res.status}`],
            updatedAt: nowTime,
          });
        } else {
          const data = (await res.json()) as {
            status: PersonStatus;
            reasons: string[];
            confidence: number;
            latency_ms: number;
            attributes?: LLMOutput;
          };

          trackStatusRef.current.set(trackId, {
            status: data.status,
            reasons: data.reasons,
            confidence: data.confidence,
            latencyMs: data.latency_ms,
            attributes: data.attributes,
            updatedAt: nowTime,
          });

          const proofItem: ScanProofItem = {
            channelId,
            trackId,
            timestamp: nowTime,
            status: data.status,
            reasons: data.reasons,
            confidence: data.confidence,
            latencyMs: data.latency_ms,
            croppedDataUrl,
            attributes: data.attributes,
          };

          setLatestProof(proofItem);
          setScanHistory((prev) => [proofItem, ...prev.slice(0, 9)]);
        }
      } catch (err) {
        console.error(`[scan] Gagal kirim track #${trackId}:`, err);
        trackStatusRef.current.set(trackId, {
          status: "error",
          reasons: ["Koneksi gagal"],
        });
      } finally {
        activeScanRef.current.delete(trackId);
        setStatusVersion((v) => v + 1);
      }
    },
    []
  );

  // Tombol paksa Scan Ulang Sekarang (memindai ulang semua kamera aktif)
  const triggerManualRescan = useCallback(() => {
    lastScanTimeRef.current.clear();
    for (const person of latestTracksRef.current) {
      void scanPerson(person.id, person.box, latestFacesRef.current, videoRef.current, "CAM-01");
    }
  }, [scanPerson]);

  // Inisialisasi model MediaPipe (ObjectDetector + FaceDetector) dan kamera utama
  const startCamera = useCallback(async () => {
    stopStream();
    setIsLoading(true);
    setErrorMessage(null);
    trackerRef.current.reset();
    lastScanTimeRef.current.clear();
    activeScanRef.current.clear();
    stableFrameCountRef.current.clear();
    trackStatusRef.current.clear();

    try {
      setLoadingStep("Memuat model deteksi tubuh & wajah (MediaPipe)...");
      const [detector, faceDetector] = await Promise.all([
        getObjectDetector(),
        getFaceDetector(),
      ]);
      detectorRef.current = detector;
      faceDetectorRef.current = faceDetector;

      setLoadingStep("Meminta izin akses kamera...");
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Browser Anda tidak mendukung akses kamera (getUserMedia).");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });

      streamRef.current = stream;

      // Dapatkan daftar semua kamera USB/lokal yang terpasang
      const devices = await navigator.mediaDevices.enumerateDevices();
      setVideoDevices(devices.filter((d) => d.kind === "videoinput"));

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

  // Gambar overlay: pixelate wajah asli + kotak status + alasan pelanggaran
  const drawOverlay = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      video: HTMLVideoElement,
      trackedPersons: TrackedPerson[],
      faceBoxes: BoundingBox[],
      canvasWidth: number,
      canvasHeight: number
    ) => {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // 1. BLUR / PIXELATE SEMUA WAJAH DARI FACEDETECTOR SECARA LANGSUNG DI ATAS VIDEO
      const blurredPersonIds = new Set<number>();
      for (const face of faceBoxes) {
        const padX = face.width * 0.25;
        const padY = face.height * 0.28;
        const fx = Math.max(0, Math.round(face.originX - padX));
        const fy = Math.max(0, Math.round(face.originY - padY));
        const fw = Math.min(canvasWidth - fx, Math.round(face.width + padX * 2));
        const fh = Math.min(canvasHeight - fy, Math.round(face.height + padY * 2));

        pixelateRegionOnCanvas(ctx, video, fx, fy, fw, fh, fx, fy, fw, fh, 14);

        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(fx, fy, fw, fh);
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(9, 9, 11, 0.78)";
        ctx.fillRect(fx, fy, Math.min(fw, 86), 16);
        ctx.fillStyle = "#ffffff";
        ctx.font = "600 9px monospace";
        ctx.fillText("FACE BLURRED", fx + 5, fy + 11);
        ctx.restore();

        for (const p of trackedPersons) {
          const cx = face.originX + face.width / 2;
          const cy = face.originY + face.height / 2;
          if (
            cx >= p.box.originX - 40 &&
            cx <= p.box.originX + p.box.width + 40 &&
            cy >= p.box.originY - 40 &&
            cy <= p.box.originY + p.box.height * 0.65
          ) {
            blurredPersonIds.add(p.id);
          }
        }
      }

      // 2. GAMBAR KOTAK DETEKSI TUBUH & BADGE STATUS
      for (const person of trackedPersons) {
        const { originX, originY, width, height } = person.box;
        const trackInfo = trackStatusRef.current.get(person.id);
        const isScanning = activeScanRef.current.has(person.id);
        const status: PersonStatus = trackInfo?.status ?? "pending";
        const colors = STATUS_COLORS[status];
        const icon = STATUS_ICON[status];

        // Fallback: jika FaceDetector belum menangkap wajah untuk person ini, tetap pixelate 28% atas
        if (!blurredPersonIds.has(person.id)) {
          const headH = Math.round(height * 0.28);
          if (headH > 8) {
            pixelateRegionOnCanvas(
              ctx,
              video,
              originX,
              originY,
              width,
              headH,
              originX,
              originY,
              width,
              headH,
              14
            );
          }
        }

        // Kotak tubuh sesuai status
        ctx.lineWidth = 2;
        ctx.strokeStyle = colors.stroke;
        ctx.fillStyle = colors.fill;
        ctx.beginPath();
        ctx.rect(originX, originY, width, height);
        ctx.stroke();
        ctx.fill();

        const statusText =
          status === "pending"
            ? "Menganalisis busana..."
            : status === "ok"
            ? "Sesuai Adat"
            : status === "violation"
            ? "Perlu Dicek Petugas"
            : status === "uncertain"
            ? "Ragu / Cek Manual"
            : "Gagal Scan";

        const scanSuffix = isScanning ? " [SCAN...]" : "";
        const label = `#${person.id} ${icon} ${statusText}${scanSuffix}`;
        ctx.font = "600 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
        const textW = ctx.measureText(label).width;
        const padX = 8;
        const badgeH = 22;
        const badgeW = textW + padX * 2;
        const badgeY = Math.max(4, originY - badgeH - 4);

        ctx.fillStyle = colors.badge;
        ctx.fillRect(originX, badgeY, badgeW, badgeH);
        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(originX, badgeY, badgeW, badgeH);
        ctx.fillStyle = colors.text;
        ctx.fillText(label, originX + padX, badgeY + 15);

        if (trackInfo?.reasons && trackInfo.reasons.length > 0) {
          const primaryReason = trackInfo.reasons[0];
          ctx.font = "500 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
          const reasonW = Math.min(canvasWidth - originX - 8, ctx.measureText(primaryReason).width + 16);
          const subY = Math.min(canvasHeight - 24, originY + height - 22);

          ctx.fillStyle = status === "violation" ? "#dc2626" : "#09090b";
          ctx.fillRect(originX, subY, reasonW, 20);
          ctx.fillStyle = "#ffffff";
          ctx.fillText(primaryReason, originX + 8, subY + 14);
        }
      }
    },
    []
  );

  // Loop deteksi real-time (ObjectDetector + FaceDetector + Auto Re-Scan 5s pada semua kamera USB aktif)
  useEffect(() => {
    let active = true;

    const nextMpTs = (baseTs: number): number => {
      const candidate = Math.floor(baseTs);
      const next = candidate > lastMpTimestampRef.current ? candidate : lastMpTimestampRef.current + 1;
      lastMpTimestampRef.current = next;
      return next;
    };

    const processVideoElement = (
      channelId: string,
      video: HTMLVideoElement,
      canvas: HTMLCanvasElement,
      tracker: ObjectTracker,
      idOffset: number,
      shouldTriggerApiScan: boolean,
      baseTimestamp: number
    ): { persons: number; faces: number } => {
      const detector = detectorRef.current;
      const faceDetector = faceDetectorRef.current;
      if (
        !detector ||
        video.readyState < 2 ||
        video.videoWidth <= 0 ||
        video.videoHeight <= 0
      ) {
        return { persons: 0, faces: 0 };
      }

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return { persons: 0, faces: 0 };

      try {
        const vw = video.videoWidth;
        const vh = video.videoHeight;

        // A. Deteksi Wajah (FaceDetector)
        const faceBoxes: BoundingBox[] = [];
        if (faceDetector) {
          const faceResult = faceDetector.detectForVideo(video, nextMpTs(baseTimestamp));
          for (const f of faceResult.detections || []) {
            if (f.boundingBox) {
              const b = f.boundingBox;
              faceBoxes.push({
                originX: Math.max(0, b.originX),
                originY: Math.max(0, b.originY),
                width: Math.min(b.width, vw - b.originX),
                height: Math.min(b.height, vh - b.originY),
              });
            }
          }
        }

        // B. Deteksi Orang (ObjectDetector)
        const detectionResult = detector.detectForVideo(video, nextMpTs(baseTimestamp));
        const personBoxes: BoundingBox[] = (detectionResult.detections || [])
          .filter((det: Detection) =>
            det.categories.some(
              (cat) =>
                cat.categoryName.toLowerCase() === "person" && (cat.score ?? 0) >= 0.4
            )
          )
          .map((det: Detection) => {
            const b = det.boundingBox!;
            return {
              originX: Math.max(0, b.originX),
              originY: Math.max(0, b.originY),
              width: Math.min(b.width, vw - b.originX),
              height: Math.min(b.height, vh - b.originY),
            };
          });

        // C. Fallback Pintar untuk Webcam Close-up
        for (const face of faceBoxes) {
          const faceCenterX = face.originX + face.width / 2;
          const faceCenterY = face.originY + face.height / 2;
          const alreadyCovered = personBoxes.some(
            (p) =>
              faceCenterX >= p.originX - 30 &&
              faceCenterX <= p.originX + p.width + 30 &&
              faceCenterY >= p.originY - 30 &&
              faceCenterY <= p.originY + p.height
          );

          if (!alreadyCovered) {
            const synthW = Math.min(vw, Math.round(face.width * 3.0));
            const synthX = Math.max(
              0,
              Math.min(vw - synthW, Math.round(faceCenterX - synthW / 2))
            );
            const synthY = Math.max(0, Math.round(face.originY - face.height * 0.25));
            const synthH = Math.max(face.height * 2, vh - synthY);
            personBoxes.push({
              originX: synthX,
              originY: synthY,
              width: synthW,
              height: synthH,
            });
          }
        }

        const rawTracks = tracker.update(personBoxes);
        const activeTracks: TrackedPerson[] = rawTracks.map((t) => ({
          ...t,
          id: t.id + idOffset,
        }));

        if (channelId === "CAM-01") {
          latestFacesRef.current = faceBoxes;
          latestTracksRef.current = activeTracks;
        }

        // D. Auto Re-Scan setiap 5 detik
        if (shouldTriggerApiScan) {
          const nowMs = Date.now();
          for (const person of activeTracks) {
            const id = person.id;
            const count = (stableFrameCountRef.current.get(id) ?? 0) + 1;
            stableFrameCountRef.current.set(id, count);

            if (count >= STABLE_FRAMES_REQUIRED && !activeScanRef.current.has(id)) {
              const lastScan = lastScanTimeRef.current.get(id) ?? 0;
              if (nowMs - lastScan >= RESCAN_INTERVAL_MS) {
                void scanPerson(id, person.box, faceBoxes, video, channelId);
              }
            }
          }
        }

        drawOverlay(ctx, video, activeTracks, faceBoxes, canvas.width, canvas.height);
        return { persons: activeTracks.length, faces: faceBoxes.length };
      } catch (detError) {
        console.error(`Gagal deteksi frame pada ${channelId}:`, detError);
        return { persons: 0, faces: 0 };
      }
    };

    const renderLoop = (timestamp: number) => {
      if (!active) return;

      let totalPersons = 0;
      let totalFaces = 0;

      // 1. Proses CAM-01 Utama
      if (videoRef.current && canvasRef.current) {
        const res = processVideoElement(
          "CAM-01",
          videoRef.current,
          canvasRef.current,
          trackerRef.current,
          0,
          true,
          timestamp
        );
        totalPersons += res.persons;
        totalFaces += res.faces;
      }

      // 2. Proses CAM-02, CAM-03, CAM-04 jika terhubung ke USB Webcam
      const seenDeviceOffsets = new Map<string, number>();
      const secondaryChannelOffsets: Record<string, number> = {
        "CAM-02": 200,
        "CAM-03": 300,
        "CAM-04": 400,
      };

      for (const chId of ["CAM-02", "CAM-03", "CAM-04"]) {
        const slotCfg = secondarySlotsRef.current[chId];
        const usbVideo = usbVideoRefs.current[chId];
        const usbCanvas = usbCanvasRefs.current[chId];
        if (slotCfg?.mode === "usb" && usbVideo && usbCanvas) {
          if (!usbTrackersRef.current[chId]) {
            usbTrackersRef.current[chId] = new ObjectTracker({
              iouThreshold: 0.25,
              maxMissedFrames: 25,
              maxCentroidDistance: 150,
            });
          }
          const devKey = slotCfg.deviceId || chId;
          const isFirstForDevice = !seenDeviceOffsets.has(devKey);
          const offset = seenDeviceOffsets.get(devKey) ?? secondaryChannelOffsets[chId] ?? 200;
          if (isFirstForDevice) {
            seenDeviceOffsets.set(devKey, offset);
          }

          const res = processVideoElement(
            chId,
            usbVideo,
            usbCanvas,
            usbTrackersRef.current[chId],
            offset,
            isFirstForDevice,
            timestamp
          );
          if (isFirstForDevice) {
            totalPersons += res.persons;
            totalFaces += res.faces;
          }
        }
      }

      setPersonCount(totalPersons);
      setFaceCount(totalFaces);

      frameCountRef.current++;
      if (timestamp - fpsTimerRef.current >= 1000) {
        const currentFps = Math.round(
          (frameCountRef.current * 1000) / (timestamp - fpsTimerRef.current)
        );
        setFps(currentFps);
        frameCountRef.current = 0;
        fpsTimerRef.current = timestamp;
      }

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

  useEffect(() => {
    startCamera();
    return () => {
      stopStream();
    };
  }, [startCamera, stopStream]);

  const isGridMode = activeChannel === null;

  return (
    <div className="min-h-screen bg-white text-zinc-950 flex flex-col selection:bg-zinc-200">
      {/* Top Header CCTV Matrix */}
      <header className="w-full border-b border-zinc-200 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 bg-white">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-xs uppercase tracking-widest font-mono text-zinc-500 hover:text-zinc-950 transition-colors"
          >
            &larr; Beranda
          </Link>
          <span className="text-zinc-300">|</span>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 bg-red-600 animate-pulse" />
            <h1 className="text-xs sm:text-sm font-mono uppercase tracking-widest font-semibold text-zinc-950">
              CCTV MATRIX · PURA AGUNG BESAKIH
            </h1>
          </div>
          <span className="hidden md:inline-block text-xs font-mono text-zinc-400">
            [{clockStr}]
          </span>
        </div>

        {/* Kontrol Mode CCTV & Telemetri */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <div className="flex border border-zinc-900">
            <button
              type="button"
              onClick={() => setActiveChannel(null)}
              className={`px-2.5 py-1 uppercase tracking-wider transition-colors ${
                isGridMode
                  ? "bg-zinc-950 text-white"
                  : "bg-white text-zinc-800 hover:bg-zinc-100"
              }`}
            >
              Grid 2x2
            </button>
            {CCTV_CHANNELS.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => setActiveChannel(ch.id)}
                title={`${ch.label} (${ch.zone})`}
                className={`px-2 py-1 uppercase tracking-wider border-l border-zinc-900 transition-colors ${
                  activeChannel === ch.id
                    ? "bg-zinc-950 text-white"
                    : "bg-white text-zinc-800 hover:bg-zinc-100"
                }`}
              >
                {ch.id}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={triggerManualRescan}
            className="border border-zinc-900 bg-white px-2.5 py-1 uppercase tracking-wider text-zinc-950 hover:bg-zinc-950 hover:text-white transition-colors"
            title="Kirim crop terbaru ke AI sekarang juga"
          >
            ↻ Scan Sekarang
          </button>

          <div className="border border-zinc-200 px-2.5 py-1 bg-zinc-50 text-zinc-700">
            FPS: <span className="text-zinc-950 font-semibold">{fps}</span>
          </div>

          <div className="border border-zinc-200 px-2.5 py-1 bg-zinc-50 text-zinc-700">
            Orang: <span className="text-zinc-950 font-semibold">{personCount}</span> · Wajah Blur:{" "}
            <span className="text-zinc-950 font-semibold">{faceCount}</span>
          </div>

          <Link
            href="/dashboard"
            className="border border-zinc-900 bg-zinc-950 px-3 py-1 uppercase text-white hover:bg-white hover:text-zinc-950 transition-colors"
          >
            Dashboard &rarr;
          </Link>
        </div>
      </header>

      {/* Main Content: Kiri = Matrix Kamera CCTV, Kanan = Inspector Bukti Privasi & Atribut AI */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 border-b border-zinc-200">
        {/* Area Matrix CCTV (8 Kolom di Desktop) */}
        <section className="lg:col-span-8 p-3 sm:p-4 bg-zinc-50/50 flex flex-col gap-3 border-b lg:border-b-0 lg:border-r border-zinc-200">
          <div
            className={`grid gap-3 flex-1 ${
              isGridMode ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
            }`}
          >
            {/* ── CHANNEL 1: CANDI BENTAR UTAMA (PRIMARY AI + FACE BLUR) ── */}
            <div
              className={`relative bg-zinc-950 border border-zinc-900 overflow-hidden flex flex-col justify-between aspect-video ${
                !isGridMode && activeChannel !== "CAM-01" ? "hidden" : ""
              }`}
            >
              {/* Header Bar dalam CCTV */}
              <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-3 py-1.5 bg-white/95 border-b border-zinc-200 font-mono text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 bg-red-600 animate-pulse" />
                  <span className="font-bold text-zinc-950">CAM-01 · CANDI BENTAR UTAMA</span>
                  <span className="hidden sm:inline text-emerald-700 font-semibold">[LIVE AI]</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {videoDevices.length > 1 && (
                    <button
                      type="button"
                      onClick={switchPrimaryCamera}
                      className="text-[10px] uppercase border border-zinc-900 px-1.5 py-0.5 bg-zinc-50 hover:bg-zinc-950 hover:text-white transition-colors"
                      title="Ganti sumber webcam utama pada CAM-01"
                    >
                      ⇄ Ganti Kamera
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setActiveChannel(activeChannel === "CAM-01" ? null : "CAM-01")
                    }
                    className="text-[10px] uppercase border border-zinc-300 px-1.5 py-0.5 bg-white hover:bg-zinc-950 hover:text-white transition-colors"
                  >
                    {activeChannel === "CAM-01" ? "⊡ Kembali 2x2" : "⛶ Perbesar"}
                  </button>
                </div>
              </div>

              {/* Loading Indicator */}
              {isLoading && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/95 p-6 text-center">
                  <div className="h-7 w-7 border-2 border-zinc-300 border-t-zinc-950 rounded-full animate-spin mb-3" />
                  <p className="text-xs font-mono uppercase tracking-widest text-zinc-900">
                    {loadingStep}
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-1 font-mono">
                    WASM + EfficientDet + BlazeFace On-Device
                  </p>
                </div>
              )}

              {/* Error Banner */}
              {errorMessage && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white p-6 text-center">
                  <div className="h-8 w-8 border border-rose-600 flex items-center justify-center text-rose-600 font-mono text-xs mb-2">
                    !
                  </div>
                  <p className="text-xs font-mono text-zinc-800 mb-3 max-w-xs">{errorMessage}</p>
                  <button
                    type="button"
                    onClick={startCamera}
                    className="px-4 py-1.5 border border-zinc-900 bg-zinc-950 text-white text-xs font-mono uppercase hover:bg-white hover:text-zinc-950"
                  >
                    Coba Lagi
                  </button>
                </div>
              )}

              {/* Video Utama + Canvas Overlay (Face Blur & Bounding Box) */}
              <div className="relative w-full h-full flex items-center justify-center pt-7">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 pt-7 w-full h-full object-contain pointer-events-none"
                />
              </div>

              {/* Footer Bar dalam CAM-01 */}
              <div className="absolute bottom-2 left-2 right-2 z-20 flex items-center justify-between pointer-events-none font-mono text-[10px]">
                <span className="bg-white/90 border border-zinc-300 px-2 py-0.5 text-zinc-900">
                  AUTO RE-SCAN: TIAP 5 DETIK
                </span>
                <span className="bg-zinc-950/90 text-white px-2 py-0.5">
                  PRIVACY: BLAZEFACE ON-DEVICE
                </span>
              </div>
            </div>

            {/* ── CHANNELS 2, 3, 4: SLOT CCTV INDEPENDEN (STANDBY / USB / IP CAMERA) ── */}
            {CCTV_CHANNELS.slice(1).map((ch) => {
              const slot = secondarySlots[ch.id] ?? { mode: "standby" };
              const isEditing = editingSlot === ch.id;

              return (
                <div
                  key={ch.id}
                  className={`relative bg-zinc-950 border border-zinc-300 overflow-hidden flex flex-col justify-between aspect-video ${
                    !isGridMode && activeChannel !== ch.id ? "hidden" : ""
                  }`}
                >
                  {/* Header Bar Slot */}
                  <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-3 py-1.5 bg-white/95 border-b border-zinc-200 font-mono text-[11px]">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block h-2 w-2 ${
                          slot.mode === "standby" ? "bg-zinc-400" : "bg-emerald-600 animate-pulse"
                        }`}
                      />
                      <span className="font-bold text-zinc-950">
                        {ch.id} · {ch.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {slot.mode !== "standby" && (
                        <button
                          type="button"
                          onClick={() => disconnectSlot(ch.id)}
                          className="text-[10px] uppercase border border-rose-300 text-rose-700 px-1.5 py-0.5 bg-white hover:bg-rose-600 hover:text-white"
                        >
                          Putuskan
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setActiveChannel(activeChannel === ch.id ? null : ch.id)
                        }
                        className="text-[10px] uppercase border border-zinc-300 px-1.5 py-0.5 bg-white hover:bg-zinc-950 hover:text-white transition-colors"
                      >
                        {activeChannel === ch.id ? "⊡ 2x2" : "⛶"}
                      </button>
                    </div>
                  </div>

                  {/* Isi Tengah Slot: Standby vs Konektor vs Active Stream */}
                  <div className="relative w-full h-full flex items-center justify-center pt-7">
                    {isEditing ? (
                      <div className="w-full h-full bg-white p-4 flex flex-col justify-center gap-2.5 font-mono text-xs z-20">
                        <div className="flex items-center justify-between border-b border-zinc-200 pb-1.5">
                          <span className="font-bold text-zinc-950 uppercase">
                            Hubungkan {ch.id} ({ch.label})
                          </span>
                          <button
                            type="button"
                            onClick={() => setEditingSlot(null)}
                            className="text-zinc-500 hover:text-zinc-950"
                          >
                            ✕ Tutup
                          </button>
                        </div>

                        {/* Opsi 1: Pilih Perangkat Kamera USB */}
                        <div>
                          <p className="text-[10px] uppercase text-zinc-500 mb-1">
                            1. Pilih Kamera USB / Capture Card (UVC):
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {videoDevices.map((dev, idx) => (
                              <button
                                key={dev.deviceId || idx}
                                type="button"
                                onClick={() => connectSlotToUsb(ch.id, dev.deviceId)}
                                className="border border-zinc-900 bg-zinc-50 hover:bg-zinc-950 hover:text-white px-2 py-1 text-[10px] truncate max-w-[210px]"
                              >
                                📷 {dev.label || `Kamera USB #${idx + 1}`}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Opsi 2: Masukkan URL Stream IP Camera / HP IP Webcam / Gateway RTSP */}
                        <div>
                          <p className="text-[10px] uppercase text-zinc-500 mb-1">
                            2. URL Stream IP CCTV / HP IP Webcam (MJPEG / HLS .m3u8 / WebRTC):
                          </p>
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={urlInput}
                              onChange={(e) => setUrlInput(e.target.value)}
                              placeholder="http://192.168.1.50:8080/video"
                              className="flex-1 border border-zinc-300 px-2 py-1 text-[11px] text-zinc-900 focus:outline-none focus:border-zinc-900"
                            />
                            <button
                              type="button"
                              onClick={() => connectSlotToIpUrl(ch.id, urlInput)}
                              className="border border-zinc-900 bg-zinc-950 text-white px-3 py-1 text-[10px] uppercase hover:bg-white hover:text-zinc-950"
                            >
                              Sambungkan
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : slot.mode === "standby" ? (
                      <div className="flex flex-col items-center justify-center text-center p-4 font-mono">
                        <div className="text-[11px] tracking-widest uppercase text-zinc-400 mb-1">
                          [ STANDBY · BELUM ADA KAMERA TERHUBUNG ]
                        </div>
                        <div className="text-[10px] text-zinc-500 mb-3">
                          {ch.zone} · Protokol: {ch.protocol}
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditingSlot(ch.id)}
                          className="border border-zinc-500 bg-zinc-900 text-white hover:bg-white hover:text-zinc-950 px-3 py-1.5 text-[11px] uppercase tracking-wider transition-colors"
                        >
                          + Hubungkan Kamera / IP CCTV
                        </button>
                      </div>
                    ) : slot.mode === "usb" ? (
                      <div className="relative w-full h-full flex items-center justify-center">
                        <video
                          ref={(el) => {
                            usbVideoRefs.current[ch.id] = el;
                          }}
                          playsInline
                          muted
                          className="w-full h-full object-contain"
                        />
                        <canvas
                          ref={(el) => {
                            usbCanvasRefs.current[ch.id] = el;
                          }}
                          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                        />
                      </div>
                    ) : slot.mode === "ip_mjpeg" ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={slot.streamUrl}
                        alt={`Stream IP CCTV ${ch.id}`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <video
                        src={slot.streamUrl}
                        autoPlay
                        playsInline
                        muted
                        controls
                        className="w-full h-full object-contain"
                      />
                    )}
                  </div>

                  {/* Footer Bar Slot */}
                  <div className="absolute bottom-2 left-2 right-2 z-10 flex items-center justify-between font-mono text-[10px] pointer-events-none">
                    <span className="bg-white/90 border border-zinc-300 px-2 py-0.5 text-zinc-900">
                      {ch.zone}
                    </span>
                    <span className="bg-zinc-950/85 text-white px-2 py-0.5 uppercase">
                      {slot.mode === "standby" ? "NO SIGNAL" : `ONLINE (${slot.mode.toUpperCase()})`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bar Legenda Status di bawah Grid CCTV */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-zinc-200 px-3 py-2 font-mono text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-zinc-400 uppercase">Indikator AI:</span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 bg-emerald-600 inline-block" />
                <span>✓ Sesuai Adat (OK)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 bg-red-600 inline-block" />
                <span>✗ Perlu Dicek (Violation)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 bg-amber-500 inline-block" />
                <span>? Ragu / Verifikasi Petugas</span>
              </span>
            </div>
            <span className="text-[11px] text-zinc-500">
              Mendukung USB Webcam (UVC), IP Camera (HTTP MJPEG / HLS), &amp; RTSP-to-WebRTC Gateway
            </span>
          </div>
        </section>

        {/* Sidebar Kanan: Bukti Privasi (Crop yang Dikirim ke AI) & Hasil Atribut Real-time (4 Kolom) */}
        <aside className="lg:col-span-4 bg-white p-4 sm:p-5 flex flex-col gap-5">
          {/* Bagian 1: Bukti Privasi On-Device (Crop Terakhir) */}
          <div className="border border-zinc-200 p-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-2 mb-3">
              <div>
                <h2 className="font-mono text-xs uppercase tracking-widest text-zinc-950 font-semibold">
                  Bukti Privasi &amp; Input AI
                </h2>
                <p className="text-[11px] text-zinc-500">
                  Gambar ~256px yang dikirim ke server (wajah sudah di-blur di browser)
                </p>
              </div>
              <span className="font-mono text-[10px] border border-zinc-900 px-1.5 py-0.5 uppercase">
                No Raw Video
              </span>
            </div>

            {latestProof ? (
              <div className="grid grid-cols-12 gap-3 items-start">
                {/* Preview Gambar Crop yang Sudah Di-blur */}
                <div className="col-span-5 border border-zinc-300 bg-zinc-100 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={latestProof.croppedDataUrl}
                    alt="Bukti crop dengan wajah ter-blur"
                    className="w-full h-auto object-contain max-h-44 mx-auto"
                  />
                  <div className="bg-zinc-950 text-white font-mono text-[9px] text-center py-0.5 uppercase">
                    {latestProof.channelId} · Track #{latestProof.trackId} · {latestProof.timestamp}
                  </div>
                </div>

                {/* Rincian Vonis & Atribut AI */}
                <div className="col-span-7 flex flex-col gap-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-mono text-xs font-bold uppercase px-2 py-0.5 ${
                        latestProof.status === "ok"
                          ? "bg-emerald-600 text-white"
                          : latestProof.status === "violation"
                          ? "bg-red-600 text-white"
                          : "bg-amber-500 text-white"
                      }`}
                    >
                      {STATUS_ICON[latestProof.status]} {latestProof.status.toUpperCase()}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-500">
                      {latestProof.latencyMs} ms
                    </span>
                  </div>

                  {/* Alasan Utama */}
                  <div className="border-l-2 border-zinc-900 pl-2 py-0.5 text-xs text-zinc-900 font-medium">
                    {latestProof.reasons.map((r, idx) => (
                      <div key={idx}>• {r}</div>
                    ))}
                  </div>

                  {/* Detail Atribut dari Gemini Vision */}
                  {latestProof.attributes && (
                    <div className="bg-zinc-50 border border-zinc-200 p-2 font-mono text-[11px] space-y-1 text-zinc-700">
                      <div className="flex justify-between">
                        <span>Baju Atasan/Bahu:</span>
                        <span
                          className={
                            latestProof.attributes.upper_body.confidence < 0.6
                              ? "text-amber-700 font-semibold"
                              : latestProof.attributes.upper_body.shoulders_covered
                              ? "text-emerald-700 font-semibold"
                              : "text-red-600 font-semibold"
                          }
                        >
                          {latestProof.attributes.upper_body.confidence < 0.6
                            ? "Belum Jelas (Cek Cahaya)"
                            : latestProof.attributes.upper_body.shoulders_covered
                            ? "Tertutup ✓"
                            : "Terbuka / Tanpa Baju ✗"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Selendang/Senteng:</span>
                        <span
                          className={
                            latestProof.attributes.sash.present
                              ? "text-emerald-700 font-semibold"
                              : "text-amber-700 font-semibold"
                          }
                        >
                          {latestProof.attributes.sash.present ? "Ada ✓" : "Tidak Terlihat"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Kain Bawah:</span>
                        <span className="text-zinc-950 font-semibold">
                          {latestProof.attributes.lower_garment.type}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center font-mono text-xs text-zinc-400 border border-dashed border-zinc-200">
                Menunggu orang terdeteksi di depan kamera...
              </div>
            )}
          </div>

          {/* Bagian 2: Log Real-time Pemindaian Kamera */}
          <div className="flex-1 flex flex-col border border-zinc-200 p-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-2 mb-3">
              <h3 className="font-mono text-xs uppercase tracking-widest text-zinc-950 font-semibold">
                Log Pemindaian Live (Tiap 5 Detik)
              </h3>
              <span className="font-mono text-[11px] text-zinc-400">
                {scanHistory.length} event
              </span>
            </div>

            {scanHistory.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-xs font-mono text-zinc-400 py-6">
                Belum ada riwayat scan pada sesi ini.
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto max-h-72 pr-1">
                {scanHistory.map((item, i) => (
                  <div
                    key={`${item.trackId}-${item.timestamp}-${i}`}
                    className="flex items-start justify-between gap-2 border-b border-zinc-100 pb-2 text-xs"
                  >
                    <div>
                      <div className="font-mono text-[11px] text-zinc-500">
                        [{item.timestamp}] {item.channelId} · Track #{item.trackId} · Conf{" "}
                        {Math.round(item.confidence * 100)}%
                      </div>
                      <div className="text-zinc-900 font-medium">
                        {item.reasons[0] ?? "Selesai dianalisis"}
                      </div>
                    </div>
                    <span
                      className={`font-mono text-[10px] uppercase px-1.5 py-0.5 shrink-0 ${
                        item.status === "ok"
                          ? "bg-emerald-100 text-emerald-900 border border-emerald-400"
                          : item.status === "violation"
                          ? "bg-red-100 text-red-900 border border-red-400"
                          : "bg-amber-100 text-amber-900 border border-amber-400"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
