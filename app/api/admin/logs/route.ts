/**
 * app/api/admin/logs/route.ts
 * DELETE /api/admin/logs?id=...      — Hapus 1 baris log audit
 * DELETE /api/admin/logs?templeId=.. — Bersihkan semua log audit pada pura
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json(
      { error: "Akses ditolak: Hanya untuk Administrator" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("id");
  const templeId = searchParams.get("templeId");

  try {
    if (eventId) {
      await db.delete(events).where(eq(events.id, eventId));
      return NextResponse.json({ success: true, deletedId: eventId });
    }

    if (templeId) {
      await db.delete(events).where(eq(events.templeId, templeId));
      return NextResponse.json({ success: true, clearedTempleId: templeId });
    }

    // Fallback: bersihkan semua baris events
    await db.delete(events);
    return NextResponse.json({ success: true, clearedAll: true });
  } catch (err) {
    console.error("[admin/logs] Gagal menghapus log:", err);
    return NextResponse.json(
      { error: "Gagal menghapus log dari database" },
      { status: 500 }
    );
  }
}
