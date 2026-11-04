/**
 * app/api/scan/route.ts
 * POST /api/scan — endpoint utama analisis busana adat pura.
 *
 * Input  : { temple_id, camera_id, track_id, image } + header X-Camera-Token
 * Output : { status, reasons, confidence, latency_ms, event_id }
 *
 * Keamanan & privasi:
 *   - Validasi token kamera via header (dibandingkan env CAMERA_API_TOKEN)
 *   - Rate limiting per camera_id: maks 10 request per 30 detik (in-memory)
 *   - Validasi ukuran gambar: maks 150KB setelah base64
 *   - Server TIDAK menulis gambar ke disk sama sekali
 *   - Gambar hanya hidup di memori selama pemrosesan
 *   - Menyimpan metadata ke DB PostgreSQL & membroadcast ke SSE Dashboard
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { analyzeBusana } from "@/lib/llm/adapter";
import { applyRules } from "@/lib/rules";
import { db } from "@/lib/db";
import { events, temples, cameras } from "@/lib/db/schema";
import { broadcastDetection } from "@/lib/events";
import { eq } from "drizzle-orm";

// ──────────────────────────────────────────────
// Zod: validasi body request
// ──────────────────────────────────────────────
const ScanRequestSchema = z.object({
  temple_id: z.string().min(1).max(64),
  camera_id: z.string().min(1).max(64),
  track_id: z.number().int().nonnegative(),
  /** Gambar JPEG dalam format base64 (tanpa prefix data:image/jpeg;base64,) */
  image: z
    .string()
    .min(100)
    // Base64 150KB ≈ 204800 karakter; kami tolak lebih besar dari itu
    .max(204800, "Ukuran gambar melebihi batas 150KB"),
});

type ScanRequest = z.infer<typeof ScanRequestSchema>;

// ──────────────────────────────────────────────
// Rate limiting sederhana (in-memory)
// camera_id → { count, windowStart }
// ──────────────────────────────────────────────
const RATE_LIMIT_MAX = 10; // max request per window
const RATE_LIMIT_WINDOW_MS = 30_000; // 30 detik

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(cameraId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(cameraId);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(cameraId, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count += 1;
  return true;
}

// ──────────────────────────────────────────────
// Handler utama
// ──────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // ── 1. Validasi token kamera ──────────────────────────────────────────────
  const expectedToken = process.env.CAMERA_API_TOKEN || "dev-camera-token-12345";
  const providedToken = req.headers.get("x-camera-token");

  if (!expectedToken) {
    console.warn("[scan] CAMERA_API_TOKEN belum di-set di environment");
  }

  if (expectedToken && providedToken !== expectedToken) {
    console.warn(`[scan] Unauthorized camera token attempt: provided="${providedToken}" expected="${expectedToken}"`);
    return NextResponse.json(
      { error: "Token kamera tidak valid atau tidak ada" },
      { status: 401 }
    );
  }

  // ── 2. Parse & validasi body ──────────────────────────────────────────────
  let body: ScanRequest;
  try {
    const raw = await req.json();
    body = ScanRequestSchema.parse(raw);
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? (err.issues[0]?.message ?? err.message)
        : "Format request tidak valid";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // ── 3. Rate limiting ──────────────────────────────────────────────────────
  if (!checkRateLimit(body.camera_id)) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 }
    );
  }

  // ── 4. Analisis LLM ───────────────────────────────────────────────────────
  // Gambar hanya ada di memori — tidak ditulis ke disk
  const llmOutput = await analyzeBusana(body.image);

  // ── 5. Rule engine → verdict ──────────────────────────────────────────────
  const verdict = applyRules(llmOutput);
  const latencyMs = Date.now() - startTime;
  const eventId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  // ── 6. Simpan ke Database & Resolusi Relasi (Pura & Kamera) ────────────────
  let resolvedTempleId = body.temple_id;
  let resolvedCameraId = body.camera_id;
  let cameraLabel = "Pintu Masuk Candi Bentar";

  try {
    // Pastikan templeId valid di DB, atau fallback ke pura pertama
    const templeRecord = await db
      .select({ id: temples.id, name: temples.name })
      .from(temples)
      .where(eq(temples.id, body.temple_id))
      .limit(1);

    if (templeRecord.length > 0) {
      resolvedTempleId = templeRecord[0].id;
    } else {
      const firstTemple = await db.select({ id: temples.id }).from(temples).limit(1);
      if (firstTemple.length > 0) resolvedTempleId = firstTemple[0].id;
    }

    // Pastikan cameraId valid di DB, atau fallback ke kamera pertama
    const cameraRecord = await db
      .select({ id: cameras.id, label: cameras.label })
      .from(cameras)
      .where(eq(cameras.id, body.camera_id))
      .limit(1);

    if (cameraRecord.length > 0) {
      resolvedCameraId = cameraRecord[0].id;
      cameraLabel = cameraRecord[0].label;
    } else {
      const firstCamera = await db.select({ id: cameras.id, label: cameras.label }).from(cameras).limit(1);
      if (firstCamera.length > 0) {
        resolvedCameraId = firstCamera[0].id;
        cameraLabel = firstCamera[0].label;
      }
    }

    // Insert ke tabel events (PRIVASI: TANPA FOTO/CROP)
    await db.insert(events).values({
      id: eventId,
      templeId: resolvedTempleId,
      cameraId: resolvedCameraId,
      trackId: body.track_id,
      status: verdict.status,
      reasons: verdict.reasons,
      confidence: verdict.confidence,
      officerAction: null,
      officerId: null,
      ts: new Date(),
    });
  } catch (dbErr) {
    console.error("[scan] Gagal menyimpan event ke DB:", dbErr);
  }

  // ── 7. Broadcast Real-time ke Dashboard Petugas via SSE ───────────────────
  try {
    broadcastDetection({
      id: eventId,
      templeId: resolvedTempleId,
      cameraId: resolvedCameraId,
      cameraLabel,
      trackId: body.track_id,
      ts: nowIso,
      status: verdict.status,
      reasons: verdict.reasons,
      confidence: verdict.confidence,
      officerAction: null,
    });
  } catch (sseErr) {
    console.error("[scan] Gagal broadcast SSE:", sseErr);
  }

  // ── 8. Log singkat (tanpa gambar) ─────────────────────────────────────────
  console.log(
    `[scan] id=${eventId} temple=${resolvedTempleId} cam=${resolvedCameraId} track=${body.track_id} ` +
      `status=${verdict.status} conf=${verdict.confidence} latency=${latencyMs}ms`
  );

  // ── 9. Respons ────────────────────────────────────────────────────────────
  return NextResponse.json({
    id: eventId,
    status: verdict.status,
    reasons: verdict.reasons,
    confidence: verdict.confidence,
    latency_ms: latencyMs,
  });
}
