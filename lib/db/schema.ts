import { pgTable, text, timestamp, integer, real } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Tabel Temples (Pura)
 * Menyimpan data pura dan sumber rujukan aturan etika busana.
 */
export const temples = pgTable("temples", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  region: text("region").notNull(), // Kabupaten/Kota di Bali, misal: "Badung", "Karangasem"
  rulesSource: text("rules_source").notNull(), // Dasar hukum, misal: "Perda Bali No. 5/2020 & Awig-awig"
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Tabel Users (Pengguna Sistem)
 * Role: officer (pecalang/petugas pintu masuk) | admin (pengelola sistem pura)
 */
export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["officer", "admin"] }).notNull().default("officer"),
  templeId: text("temple_id").references(() => temples.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Tabel Cameras (Kamera Pintu Masuk)
 * Setiap kamera terpasang memiliki token autentikasi (hash) unik untuk memanggil /api/scan.
 */
export const cameras = pgTable("cameras", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  templeId: text("temple_id")
    .references(() => temples.id, { onDelete: "cascade" })
    .notNull(),
  label: text("label").notNull(), // Contoh: "Pintu Masuk Utama (Candi Bentar)"
  apiTokenHash: text("api_token_hash").notNull(), // SHA-256 hash dari token kamera
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Tabel Rules (Aturan Busana Pura)
 * Aturan dinamis per pura yang dievaluasi oleh rule engine.
 */
export const rules = pgTable("rules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  templeId: text("temple_id")
    .references(() => temples.id, { onDelete: "cascade" })
    .notNull(),
  attribute: text("attribute").notNull(), // "lower_garment" | "sash" | "upper_body"
  requiredValue: text("required_value").notNull(), // Misal: "covers_knees:true", "present:true"
  severity: text("severity", { enum: ["violation", "warning"] })
    .notNull()
    .default("violation"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Tabel Events (Riwayat Deteksi & Vonis)
 * PRIVASI: TIDAK MENYIMPAN FOTO, FRAME, ATAU CROP APA PUN.
 * Hanya menyimpan metadata hasil analisis Vision AI dan tindakan verifikasi pecalang.
 */
export const events = pgTable("events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  templeId: text("temple_id")
    .references(() => temples.id, { onDelete: "cascade" })
    .notNull(),
  cameraId: text("camera_id")
    .references(() => cameras.id, { onDelete: "cascade" })
    .notNull(),
  trackId: integer("track_id").notNull(),
  ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),
  status: text("status", { enum: ["pending", "ok", "violation", "uncertain", "error"] }).notNull(),
  reasons: text("reasons").array().notNull().default([]),
  confidence: real("confidence").notNull(),
  officerAction: text("officer_action", {
    enum: ["allowed", "warned", "sarong_provided", "dismissed"],
  }),
  officerId: text("officer_id").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
});

// Relasi antar tabel untuk Drizzle relational queries
export const templesRelations = relations(temples, ({ many }) => ({
  users: many(users),
  cameras: many(cameras),
  rules: many(rules),
  events: many(events),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  temple: one(temples, {
    fields: [users.templeId],
    references: [temples.id],
  }),
  reviewedEvents: many(events),
}));

export const camerasRelations = relations(cameras, ({ one, many }) => ({
  temple: one(temples, {
    fields: [cameras.templeId],
    references: [temples.id],
  }),
  events: many(events),
}));

export const rulesRelations = relations(rules, ({ one }) => ({
  temple: one(temples, {
    fields: [rules.templeId],
    references: [temples.id],
  }),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  temple: one(temples, {
    fields: [events.templeId],
    references: [temples.id],
  }),
  camera: one(cameras, {
    fields: [events.cameraId],
    references: [cameras.id],
  }),
  officer: one(users, {
    fields: [events.officerId],
    references: [users.id],
  }),
}));

// Tipe TypeScript terinferensi
export type Temple = typeof temples.$inferSelect;
export type NewTemple = typeof temples.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Camera = typeof cameras.$inferSelect;
export type NewCamera = typeof cameras.$inferInsert;

export type Rule = typeof rules.$inferSelect;
export type NewRule = typeof rules.$inferInsert;

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
