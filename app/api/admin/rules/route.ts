/**
 * app/api/admin/rules/route.ts
 * POST /api/admin/rules — Tambah aturan busana baru
 * DELETE /api/admin/rules?id=... — Hapus aturan busana
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { rules } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const CreateRuleSchema = z.object({
  templeId: z.string().min(1),
  attribute: z.string().min(1).max(64),
  requiredValue: z.string().min(1).max(128),
  severity: z.enum(["violation", "warning"]).default("violation"),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Akses ditolak: Hanya untuk Administrator" }, { status: 403 });
  }

  try {
    const raw = await req.json();
    const data = CreateRuleSchema.parse(raw);

    const [newRule] = await db
      .insert(rules)
      .values({
        id: crypto.randomUUID(),
        templeId: data.templeId,
        attribute: data.attribute,
        requiredValue: data.requiredValue,
        severity: data.severity,
      })
      .returning();

    return NextResponse.json({ success: true, rule: newRule });
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0]?.message : "Gagal menyimpan aturan baru";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Akses ditolak: Hanya untuk Administrator" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const ruleId = searchParams.get("id");

  if (!ruleId) {
    return NextResponse.json({ error: "ID aturan wajib disertakan" }, { status: 400 });
  }

  try {
    await db.delete(rules).where(eq(rules.id, ruleId));
    return NextResponse.json({ success: true, deletedId: ruleId });
  } catch {
    return NextResponse.json({ error: "Gagal menghapus aturan dari database" }, { status: 500 });
  }
}
