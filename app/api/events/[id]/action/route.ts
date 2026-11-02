/**
 * app/api/events/[id]/action/route.ts
 * POST /api/events/[id]/action — Pencatatan keputusan/tindakan pecalang.
 *
 * Sesuai prinsip AGENTS.md:
 * "AI hanya MENANDAI; petugas yang memutuskan."
 * Aksi: allowed (izinkan) | warned (tegur) | sarong_provided (diberi kamen/selendang) | dismissed (abaikan)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { broadcastAction } from "@/lib/events";
import { eq } from "drizzle-orm";
import { z } from "zod";

const ActionSchema = z.object({
  action: z.enum(["allowed", "warned", "sarong_provided", "dismissed"]),
  notes: z.string().max(255).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Verifikasi sesi petugas (Auth.js)
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Harap masuk sebagai petugas/admin terlebih dahulu" },
      { status: 401 }
    );
  }

  const { id: eventId } = await params;

  // 2. Validasi body input
  let parsedData: z.infer<typeof ActionSchema>;
  try {
    const raw = await req.json();
    parsedData = ActionSchema.parse(raw);
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : "Format input tidak valid";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // 3. Update status tindakan di database
  try {
    const [updated] = await db
      .update(events)
      .set({
        officerAction: parsedData.action,
        officerId: session.user.id,
        notes: parsedData.notes ?? null,
      })
      .where(eq(events.id, eventId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Event deteksi tidak ditemukan" }, { status: 404 });
    }

    // 4. Broadcast perubahan ke seluruh dashboard pecalang terhubung
    broadcastAction({
      eventId: updated.id,
      officerAction: parsedData.action,
      officerId: session.user.id,
      officerName: session.user.name || "Pecalang",
      ts: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      event: {
        id: updated.id,
        officerAction: updated.officerAction,
        officerId: updated.officerId,
      },
    });
  } catch (err) {
    console.error("[action] Gagal menyimpan tindakan petugas:", err);
    return NextResponse.json(
      { error: "Gagal memperbarui status di database" },
      { status: 500 }
    );
  }
}
