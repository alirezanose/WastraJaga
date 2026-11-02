/**
 * app/api/events/route.ts
 * GET /api/events — Server-Sent Events (SSE) Stream untuk Dashboard Pecalang.
 *
 * Mengirimkan stream pembaruan real-time:
 *   - Event deteksi kamera baru
 *   - Pembaruan tindakan/keputusan pecalang
 *   - Heartbeat setiap ~20 detik untuk menjaga koneksi tetap hidup
 */

import { NextRequest } from "next/server";
import { eventBus, EVENT_CHANNELS, type DashboardEvent, type ActionUpdatePayload } from "@/lib/events";
import { db } from "@/lib/db";
import { events, cameras, users } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Query 25 riwayat event terakhir dari DB saat inisialisasi koneksi
  let initialEvents: DashboardEvent[] = [];
  try {
    const rawEvents = await db
      .select({
        id: events.id,
        templeId: events.templeId,
        cameraId: events.cameraId,
        cameraLabel: cameras.label,
        trackId: events.trackId,
        ts: events.ts,
        status: events.status,
        reasons: events.reasons,
        confidence: events.confidence,
        officerAction: events.officerAction,
        officerId: events.officerId,
        officerName: users.name,
      })
      .from(events)
      .leftJoin(cameras, eq(events.cameraId, cameras.id))
      .leftJoin(users, eq(events.officerId, users.id))
      .orderBy(desc(events.ts))
      .limit(25);

    initialEvents = rawEvents.map((r) => ({
      id: r.id,
      templeId: r.templeId,
      cameraId: r.cameraId,
      cameraLabel: r.cameraLabel ?? undefined,
      trackId: r.trackId,
      ts: r.ts.toISOString(),
      status: r.status as DashboardEvent["status"],
      reasons: r.reasons,
      confidence: r.confidence,
      officerAction: r.officerAction as DashboardEvent["officerAction"],
      officerId: r.officerId,
      officerName: r.officerName ?? undefined,
    }));
  } catch (err) {
    console.error("[sse] Gagal mengambil initial events:", err);
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (type: string, data: unknown) => {
        const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      // 1. Kirim snapshot riwayat event awal
      send("initial", initialEvents);

      // 2. Listener event deteksi baru
      const handleNewDetection = (event: DashboardEvent) => {
        send("detection", event);
      };

      // 3. Listener pembaruan tindakan petugas
      const handleOfficerAction = (action: ActionUpdatePayload) => {
        send("action", action);
      };

      eventBus.on(EVENT_CHANNELS.NEW_DETECTION, handleNewDetection);
      eventBus.on(EVENT_CHANNELS.OFFICER_ACTION, handleOfficerAction);

      // 4. Heartbeat ~20 detik sesuai AGENTS.md
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeatInterval);
        }
      }, 20_000);

      // 5. Cleanup saat client disconnect
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeatInterval);
        eventBus.off(EVENT_CHANNELS.NEW_DETECTION, handleNewDetection);
        eventBus.off(EVENT_CHANNELS.OFFICER_ACTION, handleOfficerAction);
        try {
          controller.close();
        } catch {
          // controller mungkin sudah tertutup
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
