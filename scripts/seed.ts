import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as argon2 from "argon2";
import * as crypto from "crypto";
import { temples, users, cameras, rules } from "../lib/db/schema";
import { eq } from "drizzle-orm";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres_password_dev@localhost:5432/wastrajaga";

const sql = postgres(connectionString, { max: 1 });
const db = drizzle(sql);

async function seed() {
  console.log("🌱 Menjalankan database seed untuk WastraJaga...");

  // 1. Seed Pura Default
  const defaultTemple = {
    id: "temple-besakih-01",
    name: "Pura Agung Besakih",
    region: "Karangasem",
    rulesSource: "Perda Provinsi Bali No. 5/2020 & Awig-awig Desa Adat Besakih",
  };

  const existingTemple = await db
    .select()
    .from(temples)
    .where(eq(temples.id, defaultTemple.id));

  if (existingTemple.length === 0) {
    await db.insert(temples).values(defaultTemple);
    console.log("✅ Pura default dibuat:", defaultTemple.name);
  } else {
    console.log("ℹ️ Pura default sudah ada:", defaultTemple.name);
  }

  // 2. Seed Pengguna Default (Admin & Pecalang/Officer)
  const adminPasswordHash = await argon2.hash("adminpassword123");
  const officerPasswordHash = await argon2.hash("pecalangpassword123");

  const defaultUsers = [
    {
      id: "user-admin-01",
      email: "admin@wastrajaga.id",
      name: "Pengelola Sistem Pura",
      passwordHash: adminPasswordHash,
      role: "admin" as const,
      templeId: defaultTemple.id,
    },
    {
      id: "user-officer-01",
      email: "pecalang@wastrajaga.id",
      name: "I Made Pecalang",
      passwordHash: officerPasswordHash,
      role: "officer" as const,
      templeId: defaultTemple.id,
    },
  ];

  for (const u of defaultUsers) {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, u.email));

    if (existing.length === 0) {
      await db.insert(users).values(u);
      console.log(`✅ User ${u.role} dibuat: ${u.email}`);
    } else {
      console.log(`ℹ️ User ${u.role} sudah ada: ${u.email}`);
    }
  }

  // 3. Seed Kamera Pintu Masuk Default
  // Token plain kamera dev: dev-camera-token-12345
  const rawToken = "dev-camera-token-12345";
  const apiTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const defaultCamera = {
    id: "camera-candi-bentar-01",
    templeId: defaultTemple.id,
    label: "Pintu Masuk Utama (Candi Bentar)",
    apiTokenHash: apiTokenHash,
  };

  const existingCamera = await db
    .select()
    .from(cameras)
    .where(eq(cameras.id, defaultCamera.id));

  if (existingCamera.length === 0) {
    await db.insert(cameras).values(defaultCamera);
    console.log("✅ Kamera default dibuat:", defaultCamera.label);
    console.log("   🔑 Token Kamera Dev:", rawToken);
  } else {
    console.log("ℹ️ Kamera default sudah ada:", defaultCamera.label);
  }

  // 4. Seed Aturan Standar Busana Pura
  const defaultRules = [
    {
      id: "rule-lower-garment-01",
      templeId: defaultTemple.id,
      attribute: "lower_garment",
      requiredValue: "covers_knees:true",
      severity: "violation" as const,
    },
    {
      id: "rule-sash-01",
      templeId: defaultTemple.id,
      attribute: "sash",
      requiredValue: "present:true",
      severity: "violation" as const,
    },
    {
      id: "rule-upper-body-01",
      templeId: defaultTemple.id,
      attribute: "upper_body",
      requiredValue: "shoulders_covered:true",
      severity: "violation" as const,
    },
  ];

  for (const r of defaultRules) {
    const existing = await db
      .select()
      .from(rules)
      .where(eq(rules.id, r.id));

    if (existing.length === 0) {
      await db.insert(rules).values(r);
      console.log(`✅ Aturan dibuat: ${r.attribute} -> ${r.requiredValue}`);
    } else {
      console.log(`ℹ️ Aturan sudah ada: ${r.attribute}`);
    }
  }

  console.log("🎉 Seed database selesai dengan sukses!");
  await sql.end();
}

seed().catch((err) => {
  console.error("❌ Gagal menjalankan seed:", err);
  process.exit(1);
});
