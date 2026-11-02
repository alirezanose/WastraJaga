# Progress Status Proyek WastraJaga
> **Catatan untuk Agen AI / Model Selanjutnya:**
> File ini adalah *Single Source of Truth* status pengerjaan proyek. Baca file ini terlebih dahulu jika sesi terputus atau berganti model.

---

## 📌 Status Terakhir: FASE 4 Selesai, Menuju FASE 5
- **Fase Selesai:** FASE 1, FASE 2, FASE 3, FASE 4
- **Fase Aktif:** FASE 5 — Panel Admin (Pengaturan Aturan Pura & Log Audit)
- **Fase Selanjutnya:** FASE 6 (Final Polish & Panduan Juri)

---

## 🏗️ Ringkasan yang Telah Selesai (Diverifikasi)

### ✅ FASE 1 — Fondasi & Deteksi On-Device
- Next.js 15 (App Router, Tailwind CSS, TypeScript)
- MediaPipe Tasks Vision (`efficientdet_lite0_v1.tflite` di `public/mediapipe/`)
- Object Tracker IoU + Centroid (`lib/tracker.ts`, test lulus)
- Privacy module `cropAndBlurHead` (`lib/crop.ts`): blur kepala di browser sebelum gambar dikirim
- Halaman kamera (`app/camera/page.tsx`) & Beranda (`app/page.tsx`) dengan tema *The White Album*

### ✅ FASE 2 — Vision AI Pipeline & Rule Engine
- LLM Adapter multi-provider (`lib/llm/adapter.ts`): `mock` (demo juri tanpa API key), `gemini`, `openai`, `anthropic`
- Zod schema atribut busana (`lib/llm/schema.ts`) & System prompt ketat (`lib/llm/prompt.ts`)
- Rule engine etika pura (`lib/rules.ts`, 8 unit test lulus)
- Endpoint `POST /api/scan`: rate limiter, pemrosesan base64 di memori, zero image storage

### ✅ FASE 3 — Database & Autentikasi
- PostgreSQL 16 (Docker) + Drizzle ORM (`lib/db/schema.ts`, `lib/db/index.ts`)
- 5 Tabel: `temples`, `users`, `cameras`, `rules`, `events` (tanpa foto)
- Migrasi ter-generate (`drizzle/`) & seed data awal (`scripts/seed.ts`):
  - Admin: `admin@wastrajaga.id` / `adminpassword123`
  - Pecalang: `pecalang@wastrajaga.id` / `pecalangpassword123`
  - Token kamera dev: `dev-camera-token-12345`
- Auth.js v5 credentials + Argon2id (`auth.config.ts`, `lib/auth.ts`, `middleware.ts`, `app/api/auth/[...nextauth]/route.ts`)
- Halaman Login (*The White Album*): `app/login/page.tsx` dengan quick-fill akses juri

### ✅ FASE 4 — Dashboard Pecalang Real-time (Selesai)
- `lib/events.ts`: Event emitter singleton in-memory untuk saluran `detection:new` dan `officer:action`.
- `app/api/events/route.ts`: Endpoint SSE (`text/event-stream`, snapshot riwayat awal 25 event, heartbeat ~20s).
- `app/api/scan/route.ts`: Integrasi simpan event ke DB `events` (zero photo) + broadcast otomatis ke SSE Dashboard.
- `app/api/events/[id]/action/route.ts`: Endpoint respon aksi pecalang (`allowed`, `sarong_provided`, `warned`, `dismissed`) + broadcast real-time ke semua dashboard.
- `app/dashboard/page.tsx` & `DashboardClient.tsx`: Dashboard pecalang *The White Album* dengan indikator Live SSE, ringkasan metrik statistik hari ini, filter status antrean, dan tombol keputusan pecalang instan.

---

## ⏳ FASE 5 — Panel Admin (Target Selanjutnya)
1. `app/admin/page.tsx`: Halaman kelola aturan pura per pura (`rules`), kelola kamera & token (`cameras`), dan audit log riwayat event deteksi & tindakan petugas.
2. Proteksi rute `/admin` (hanya role `admin`).

---

## 🛠️ Perintah Verifikasi Standar (Menggunakan Docker)
- Unit Tests: `docker run --rm -v $(pwd):/app -w /app node:22-alpine npm test`
- Lint: `docker run --rm -v $(pwd):/app -w /app node:22-alpine npm run lint`
- Build: `docker run --rm -e AUTH_SECRET="dev-secret-super-safe-32-chars-long!" -v $(pwd):/app -w /app node:22-alpine npm run build`
