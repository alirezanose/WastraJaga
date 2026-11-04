# WastraJaga

> **Sistem Pemantauan Busana Adat Pura di Pintu Masuk Berbasis Vision AI On-Device**  
> Entri Resmi **Tim Drogon** untuk **AI Web Innovation Challenge – Bali DigiFest 2026** (*Kategori: Bali Smart Society*).

---

## Description

**WastraJaga** adalah aplikasi web cerdas yang membantu petugas keamanan adat Bali (**Pecalang**) dan pengelola pura dalam memantau keselarasan busana adat pengunjung di pintu masuk pura (*Candi Bentar / Kori Agung*) secara *real-time*.

Sistem ini menggabungkan **Computer Vision On-Device** (MediaPipe `EfficientDet-Lite0` & `BlazeFace Short-Range` langsung di browser kamera gerbang) dengan **Vision Large Language Model (LLM)** dan **Rule Engine** di sisi server. Berbeda dari CCTV konvensional, **WastraJaga** dirancang dengan prinsip **Privacy by Design**: area wajah pengunjung otomatis dipikselasi/di-blur di perangkat browser sebelum potongan (*crop*) pakaian dikirim ke server, dan server **tidak menyimpan foto atau video mentah sama sekali (0% Raw Image Storage)**. AI hanya bertugas menandai atribut pakaian, sedangkan keputusan akhir tetap sepenuhnya berada di tangan Pecalang.

---

## Problem & Target User

### Masalah Nyata di Lapangan
1. **Lonjakan Wisatawan & Keterbatasan Pecalang:** Pura-pura besar di Bali (seperti Pura Agung Besakih, Pura Tirta Empul, Pura Ulun Danu, dan Pura Lempuyang) menerima ratusan hingga ribuan pengunjung setiap hari. Pecalang di gerbang masuk sering kewalahan mengawasi kelengkapan busana adat secara manual satu per satu.
2. **Ketidaktahuan Pengunjung atas Pakem Busana Pura:** Sesuai *Awig-awig Desa Adat* dan SE Gubernur Bali / Perda Provinsi Bali No. 5 Tahun 2020, memasuki kawasan suci pura mewajibkan:
   - Bawahan menggunakan **kamen/sarung** yang menutupi lutut.
   - Mengikatkan **selendang/senteng** di pinggang.
   - Mengenakan **pakaian atasan yang sopan dengan bahu tertutup** (bukan tanpa baju/tanktop/bahu terbuka).
3. **Sensitivitas Privasi di Kawasan Suci:** Kamera pengawas biasa yang merekam wajah pengunjung ke server berisiko melanggar privasi dan Undang-Undang Perlindungan Data Pribadi (UU PDP).

### Target Pengguna (Target User)
1. **Pecalang (Petugas Keamanan Adat):** Membutuhkan notifikasi instan (*real-time alert*) di tablet/HP pos jaga ketika ada pengunjung yang memerlukan bantuan peminjaman kain kamen/selendang atau teguran santun.
2. **Pengelola Pura / Prajuru Desa Adat (Administrator):** Membutuhkan panel untuk mengatur aturan busana spesifik tiap pura, mengelola kamera gerbang, dan memantau log audit kepatuhan harian tanpa melanggar privasi pengunjung.

---

## Key Features

1. **CCTV Matrix Multi-Channel (`2x2 Grid` & `1x1 Focus`) dengan Dual On-Device AI (`/camera`):**
   - Mendeteksi tubuh pengunjung (`ObjectDetector`) dan titik koordinat wajah (`FaceDetector` BlazeFace) secara simultan di browser pada 25–30 FPS.
   - Mendukung konektor multi-sumber: **USB Webcam / Capture Card (UVC)**, **IP Camera (HTTP MJPEG / HLS `.m3u8`)**, dan gateway **RTSP-to-WebRTC**.
   - **Auto Re-Scan Tiap 5 Detik** + tombol **Scan Sekarang** untuk pengujian responsif.
2. **On-Device Face Blur & Panel Bukti Privasi (*Zero-Face & Zero-Image Storage*):**
   - Piksel wajah otomatis dimozaik/di-blur di browser sebelum meninggalkan perangkat kamera.
   - Menyediakan **Panel Bukti Privasi Live** di samping layar CCTV yang memperlihatkan potongan gambar ~256px yang dikirim ke AI beserta hasil ekstraksi atributnya.
3. **Multi-Provider Vision AI & Rule Engine Etika Busana (`/api/scan`):**
   - Mengekstrak atribut terstruktur JSON (`upper_body.shoulders_covered`, `sash.present`, `lower_garment.type`, `lower_garment.covers_knees`, `full_body_visible`).
   - Menghasilkan status objektif: **`ok` (Hijau ✓)**, **`violation` (Merah ✗)**, atau **`uncertain` (Kuning ?)** dalam bahasa netral (*"perlu dicek: bahu terbuka / tidak berbaju atasan"*).
4. **Dashboard Pecalang Real-Time Berbasis SSE (`/dashboard`):**
   - Menggunakan **Server-Sent Events (SSE)** untuk mendorong alert deteksi ke layar Pecalang dalam hitungan milidetik tanpa *polling*.
   - Dilengkapi tombol keputusan 1-klik: **Izinkan Masuk**, **Pinjamkan Kamen/Selendang**, **Beri Teguran**, atau **Abaikan**.
5. **Panel Administrasi Pura & Auto-Prune Audit Log (`/admin`):**
   - Mengelola aturan busana per pura, inventaris kamera gerbang, serta **Log Audit Pemeriksaan** lengkap dengan tanggal & waktu WITA dan fitur **Auto-Prune (otomatis menjaga maksimal 100 log terbaru)** agar basis data selalu ringan.

---

## Tech Stack

| Lapisan | Teknologi yang Digunakan |
| :--- | :--- |
| **Frontend** | Next.js 15 (App Router), React 19, TypeScript 5.7, Tailwind CSS 3.4 |
| **On-Device Edge AI (Browser)** | `@mediapipe/tasks-vision` (WebAssembly + `efficientdet_lite0.tflite` & `blaze_face_short_range.tflite` di-host lokal) |
| **Backend & API** | Next.js Route Handlers (Node.js 22 Runtime), Server-Sent Events (SSE) via In-Memory `EventEmitter`, Zod Schema Validation |
| **Cloud Vision AI** | Google Gemini Vision API (`gemini-3.1-flash-lite` / `gemini-2.5-flash`) via adapter multi-provider (`gemini` \| `openai` \| `anthropic` \| `mock`) |
| **Database & ORM** | PostgreSQL 16 Alpine, Drizzle ORM, Drizzle Kit |
| **Authentication & Security** | Auth.js v5 (NextAuth), Argon2id Password Hashing, Role-Based Middleware (`officer` & `admin`), Rate Limiting & Camera API Token |
| **Hosting & Deployment** | Microsoft Azure (Docker Compose: Container App + PostgreSQL 16) dengan domain kustom `ahmadalireza.site` |

---

## AI Implementation

Sistem menerapkan arsitektur **Hybrid Two-Stage AI** agar hemat bandwidth, cepat, dan menjaga privasi:

1. **Tahap 1 — Edge Computer Vision di Browser (`lib/detector.ts`, `lib/tracker.ts`, `lib/crop.ts`):**
   - **Model:** MediaPipe `EfficientDet-Lite0` (deteksi badan `person`) + `BlazeFace Short-Range` (deteksi titik wajah) yang dijalankan via WebAssembly di browser.
   - **Metode:** Tracking posisi orang lintas frame menggunakan *Intersection over Union (IoU)* dan jarak *centroid*. Setelah terdeteksi stabil, fungsi `cropAndBlurHead()` memotong area tubuh menjadi resolusi kecil (~256px) dan mem-pixelate area wajah.
2. **Tahap 2 — Vision LLM Attribute Extraction & Rule Engine di Server (`lib/llm/adapter.ts`, `lib/rules.ts`):**
   - **Model:** Google Gemini (`gemini-3.1-flash-lite` dengan auto-fallback ke `gemini-2.5-flash-lite` / `gemini-2.5-flash`, serta mode `mock` deterministik untuk pengujian tanpa API key).
   - **Input ke Model:** Potongan gambar JPEG Base64 (~15–30 KB, kepala sudah ter-blur) + *System Prompt* ketat (`lib/llm/prompt.ts`).
   - **Output dari Model (JSON Tervalidasi Zod):**
     ```json
     {
       "full_body_visible": true,
       "lower_garment": { "type": "kamen", "covers_knees": true, "confidence": 0.92 },
       "sash": { "present": true, "confidence": 0.88 },
       "upper_body": { "shoulders_covered": true, "confidence": 0.95 }
     }
     ```
   - **Alasan AI Diperlukan:** Aturan busana adat Bali memiliki variasi warna, corak kain kamen, kebaya, baju safari, dan ikatan senteng yang sangat beragam sehingga tidak dapat diselesaikan dengan sensor biasa, namun membutuhkan pemahaman konteks visual dari Vision AI yang dipadukan dengan *Rule Engine* deterministik.

---

## Architecture / Data Flow

```text
[Pengunjung di Gerbang Pura]
        │
        ▼
[1. Browser Kamera (/camera)]
   ├─ MediaPipe ObjectDetector (Deteksi Badan) + FaceDetector (Deteksi Wajah)
   ├─ IoU Object Tracker (Penomoran Track ID #1, #2, ...)
   └─ cropAndBlurHead() ──► Potong Tubuh ~256px + Mozaik/Blur Wajah di Browser
        │
        │ POST /api/scan (JSON: track_id + Base64 JPEG ~25KB tanpa wajah)
        ▼
[2. Backend Next.js (/api/scan)]
   ├─ Validasi Token Kamera, Ukuran Gambar (<150KB), & Rate Limit
   ├─ Vision LLM Adapter (Gemini / OpenAI / Anthropic / Mock) ──► JSON Atribut Pakaian
   ├─ Zod Schema Validation + Rule Engine (lib/rules.ts) ──► Status: ok | violation | uncertain
   ├─ Simpan Metadata ke PostgreSQL 16 (Tabel `events` — 0% Foto, Auto-Prune maks 100 baris)
   └─ Broadcast Event ke In-Memory Event Bus (lib/events.ts)
        │
        │ Push Real-Time via Server-Sent Events (GET /api/events)
        ▼
[3. Dashboard Pecalang (/dashboard) & Panel Admin (/admin)]
   ├─ Pecalang menerima alert warna (Hijau ✓ / Merah ✗ / Kuning ?) detik itu juga
   └─ Pecalang menekan tombol keputusan (Izinkan / Beri Pinjaman Kain / Tegur) ──► Tersimpan di DB
```

---

## Installation / Run Instructions

### Opsi A — Menjalankan dengan Docker Compose (Direkomendasikan)

```bash
# 1. Clone repository
git clone <URL_REPO_GITHUB_ANDA>
cd bali-contest

# 2. Salin konfigurasi environment contoh
cp .env.example .env

# 3. Jalankan PostgreSQL 16 + Aplikasi Next.js
docker compose up -d --build

# 4. (Opsional jika DB baru pertama kali dibuat) Jalankan migrasi & seed data awal
docker run --rm --network bali-contest_default \
  -e DATABASE_URL="postgresql://postgres:postgres_password_dev@db:5432/wastrajaga" \
  -v $(pwd):/app -w /app node:22-alpine sh -c "npx drizzle-kit push && npx tsx scripts/seed.ts"
```

Buka aplikasi di browser:
- **Beranda:** `http://localhost:3000`
- **CCTV Matrix Kamera:** `http://localhost:3000/camera`
- **Login Petugas / Admin:** `http://localhost:3000/login`
- **Dashboard Pecalang:** `http://localhost:3000/dashboard`
- **Panel Admin Pura:** `http://localhost:3000/admin`

### Opsi B — Perintah Verifikasi Kualitas Kode (Test, Lint, Build)

```bash
npm test          # Menjalankan 12 unit test (Vitest: Rule Engine & Object Tracker)
npm run lint      # Pemeriksaan ESLint (0 error, 0 warning)
npm run build     # Build produksi Next.js
```

---

## Deployment URL

- **Production / Live MVP URL (Microsoft Azure):** [https://wastrajaga.ahmadalireza.site](https://wastrajaga.ahmadalireza.site) *(Subdomain resmi pada `ahmadalireza.site`)*

---

## Demo Account

Sesuai dengan ketentuan keamanan **Panduan Peserta Bali DigiFest 2026 (Bab 7 & Lampiran B: *"Credential demo dikirim melalui kanal/form panitia, bukan public repository"* )**:
- Kredensial akun demo untuk **Pecalang (`officer`)** dan **Pengelola Pura (`admin`)** pada deployment aktif telah disertakan secara privat pada **Formulir Submission Resmi Panitia** dan dokumen **Proposal PDF**.
- Untuk pengujian lokal di mesin sendiri menggunakan `scripts/seed.ts`, Anda dapat mengatur variabel `SEED_ADMIN_PASSWORD` dan `SEED_OFFICER_PASSWORD` pada file `.env` lokal Anda.

---

## Known Limitations

Sebagai produk tahap **Minimum Viable Product (MVP)**, sistem memiliki beberapa batasan saat ini yang menjadi fokus pengembangan berikutnya:
1. **Penutup Kepala (Udeng) Belum Dinilai:** Demi menjaga privasi wajah pengunjung (*Privacy by Design*), seluruh area kepala dan wajah di-blur di browser sebelum dikirim ke AI, sehingga atribut penutup kepala pria (*udeng*) sengaja tidak dinilai pada versi MVP.
2. **Ketergantungan Sudut Kamera untuk Kain Bawah:** Jika pengunjung berdiri terlalu dekat dengan webcam laptop sehingga hanya tubuh bagian atas (dada dan bahu) yang masuk ke dalam frame, AI tetap dapat mendeteksi pelanggaran baju atasan/bahu terbuka dengan akurat, namun akan menandai kain bawah sebagai `uncertain` (*tubuh tidak terlihat penuh*) untuk diverifikasi langsung oleh Pecalang.
3. **Koneksi RTSP CCTV Industri Membutuhkan Gateway:** Browser modern tidak mendukung protokol `rtsp://` secara langsung; untuk menghubungkan kamera CCTV RTSP diperlukan container gateway pendamping (seperti MediaMTX / go2rtc) untuk mengubah RTSP menjadi HLS (`.m3u8`) atau WebRTC, sedangkan kamera USB (UVC) dan IP Camera HTTP MJPEG dapat langsung dihubungkan dari antarmuka `/camera`.
4. **In-Memory Event Bus SSE:** Distribusi notifikasi real-time SSE saat ini berjalan menggunakan *in-memory singleton* pada satu instance server Node.js (cukup untuk satu kompleks pura, namun membutuhkan Redis Pub/Sub jika di-scale ke banyak server horizontal).

---

## Third-party Resources / Credits

Seluruh penggunaan model AI, pustaka *open-source*, lisensi, serta **Tabel Resmi Lampiran C — AI & Technology Disclosure** didokumentasikan secara lengkap pada:
👉 **[`docs/third-party.md`](./docs/third-party.md)**

Ringkasan kredit utama:
- **MediaPipe Tasks Vision (`EfficientDet-Lite0` & `BlazeFace Short-Range`)** oleh Google (Apache-2.0) — di-host mandiri di `public/mediapipe/` dan `public/models/`.
- **Google Gemini API (`@google/generative-ai`)** oleh Google (Apache-2.0).
- **Next.js, React, Tailwind CSS, Drizzle ORM, Auth.js v5, Argon2, Vitest, Zod** (MIT / Apache-2.0 / ISC).

---

## Team Members

**Nama Tim:** **Drogon**

| Nama Lengkap | Peran dalam Tim | Tanggung Jawab Utama |
| :--- | :--- | :--- |
| **Ahmad Ali Reza** | Ketua Tim / Lead Full-Stack & AI Engineer | Arsitektur sistem, integrasi MediaPipe & Vision LLM, deployment Azure (`ahmadalireza.site`) |
| **Muhammad Saifuddin Zuhri** | Backend & Data Engineer | Skema PostgreSQL & Drizzle ORM, Rule Engine, autentikasi Auth.js, & SSE real-time stream |
| **Muhammad Sofyan** | Frontend & UI/UX Engineer | Desain antarmuka *The White Album*, CCTV Matrix `/camera`, Dashboard Pecalang, & pengujian |
