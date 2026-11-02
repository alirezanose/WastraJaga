import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { temples, rules, cameras, events, users } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import AdminClient from "./AdminClient";

export const metadata = {
  title: "Panel Admin — WastraJaga",
  description: "Pengaturan aturan busana adat pura, kamera pintu masuk, dan audit log kepatuhan.",
};

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/admin");
  }

  // Hanya role admin yang boleh mengakses
  if (session.user.role !== "admin") {
    redirect("/dashboard");
  }

  // 1. Ambil data pura pengguna atau pura pertama
  let templeRecord = null;
  if (session.user.templeId) {
    const res = await db
      .select()
      .from(temples)
      .where(eq(temples.id, session.user.templeId))
      .limit(1);
    if (res.length > 0) templeRecord = res[0];
  }

  if (!templeRecord) {
    const allTemples = await db.select().from(temples).limit(1);
    templeRecord = allTemples[0] ?? {
      id: "temple-besakih-01",
      name: "Pura Agung Besakih",
      region: "Karangasem",
      rulesSource: "Perda Provinsi Bali No. 5/2020 & Awig-awig Besakih",
      createdAt: new Date(),
    };
  }

  // 2. Ambil aturan busana pura
  const templeRules = await db
    .select()
    .from(rules)
    .where(eq(rules.templeId, templeRecord.id));

  // 3. Ambil kamera terdaftar
  const templeCameras = await db
    .select()
    .from(cameras)
    .where(eq(cameras.templeId, templeRecord.id));

  // 4. Ambil log audit 30 deteksi terakhir
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
    .where(eq(events.templeId, templeRecord.id))
    .orderBy(desc(events.ts))
    .limit(30);

  const formattedEvents = rawEvents.map((r) => ({
    id: r.id,
    templeId: r.templeId,
    cameraId: r.cameraId,
    cameraLabel: r.cameraLabel ?? undefined,
    trackId: r.trackId,
    ts: r.ts.toISOString(),
    status: r.status as "pending" | "ok" | "violation" | "uncertain" | "error",
    reasons: r.reasons,
    confidence: r.confidence,
    officerAction: r.officerAction as "allowed" | "warned" | "sarong_provided" | "dismissed" | null,
    officerId: r.officerId,
    officerName: r.officerName ?? undefined,
  }));

  return (
    <AdminClient
      user={{
        id: session.user.id,
        name: session.user.name || "Administrator",
        email: session.user.email || "",
        role: "admin",
      }}
      temple={templeRecord}
      initialRules={templeRules}
      initialCameras={templeCameras}
      initialEvents={formattedEvents}
    />
  );
}
