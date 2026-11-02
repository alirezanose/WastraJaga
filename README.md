# WastraJaga — Monitoring Busana Adat Pura Berbasis Vision AI

> **Sistem Pemantauan Etika & Tata Krama Busana Adat Pura di Pintu Masuk (*Kori Agung / Candi Bentar*) Berbasis Vision AI On-Device.**  
> Entri Resmi untuk **AI Web Innovation Challenge – Bali DigiFest 2026**.

---

## 🏛️ Latar Belakang & Filosofi Desain

Pura di Bali adalah tempat suci (*kawasan suci*) yang memiliki ketentuan tata krama (*awig-awig* dan Perda Bali No. 5/2020) mengenai kelayakan busana adat persembahyangan:
1. Menggunakan kain kamen yang menutupi bagian bawah (minimal di bawah lutut).
2. Mengenakan selendang/senteng yang terikat rapi di pinggang sebagai simbol pengendalian diri.
3. Mengenakan baju yang sopan dengan bahu tertutup.

**WastraJaga** hadir sebagai asisten digital bagi petugas **Pecalang** di pintu masuk pura dengan prinsip:
- **AI Menandai, Pecalang yang Memutuskan:** Sistem AI tidak menghakimi atau melarang seseorang secara sepihak. AI bertindak sebagai pemantau objektif atribut busana, sedangkan keputusan akhir tetap sepenuhnya di tangan kearifan petugas pecalang.
- **Privasi Mutlak (*Privacy by Design*):** 
  - Tidak ada pengenalan wajah (*no face recognition*).
  - Wajah dan kepala **otomatis di-blur langsung di browser** sebelum crop atribut busana dikirim ke server.
  - Server memproses data di memori — **0% penyimpanan foto/video mentah di disk atau database**.
  - Teks alert netral dan santun: *"Perlu dicek: bahu terbuka"*, bukan *"pelanggar"*.
- **Estetika Minimalis *"The White Album"* (The Beatles, 1968):**
  - Antarmuka monokromatik bersih dengan kontras tinggi teks hitam arang (`#09090b`) di atas kanvas putih (`#ffffff`), tipografi editorial berwibawa, dan sudut presisi yang mencerminkan ketenangan sakral pura.

---

## ⚡ Arsitektur Sistem

```
┌────────────────────────────────────────────────────────────────────────┐
│ BROWSER LAPTOP / HP DI PINTU MASUK (Client-Side)                       │
│                                                                        │
│  [Webcam Stream]                                                       │
│        │                                                               │
│        ▼                                                               │
│  [lib/detector.ts]   --> MediaPipe Tasks Vision on-device (.tflite)    │
│        │                 (Mendeteksi kategori "person" @ 25-30 FPS)    │
│        ▼                                                               │
│  [lib/tracker.ts]    --> IoU Tracker + Fallback Centroid               │
│        │                 (Menjaga kestabilan ID orang)                 │
│        ▼                                                               │
│  [lib/crop.ts]       --> cropAndBlurHead()                             │
│                          (Crop tubuh ~256px + blur area kepala)        │
└────────┬───────────────────────────────────────────────────────────────┘
         │ POST /api/scan (Base64 JPEG ~256px ter-blur, 1x per ID)
┌────────▼───────────────────────────────────────────────────────────────┐
│ BACKEND SERVER (Next.js App Router + Node.js)                          │
│                                                                        │
│  [app/api/scan]      --> Rate Limiting (10 req/30s) + Validasi Zod     │
│        │                                                               │
│        ▼                                                               │
│  [lib/llm/adapter]   --> Multi-Provider Vision AI                      │
│        │                 (Mock | Gemini 1.5 | OpenAI | Anthropic)      │
│        │                 Output: Atribut busana (Bukan vonis)          │
│        ▼                                                               │
│  [lib/rules.ts]      --> Rule Engine Dinamis Berdasarkan Aturan DB    │
│        │                 Vonis: ok | violation | uncertain             │
│        ├────────────────────────────────┬──────────────────────────────┤
│        ▼                                ▼                              │
│  [PostgreSQL 16] (Drizzle ORM)    [lib/events.ts]                      │
│  Tabel `events`                   In-Memory Event Bus                  │
│  (Hanya simpan metadata waktu,           │                             │
│   status, keyakinan, TANPA FOTO)         ▼                             │
│                                   [GET /api/events] (SSE Stream)       │
└──────────────────────────────────────────┬─────────────────────────────┘
                                           │ Push Event Real-Time
┌──────────────────────────────────────────▼─────────────────────────────┐
│ DASHBOARD PECALANG (/dashboard) & PANEL ADMIN (/admin)                 │
│                                                                        │
│  - Alert Deteksi Real-Time (🟢 Hijau / 🔴 Merah / 🟡 Kuning)           │
│  - Tombol Tindakan Cepat Pecalang:                                     │
│    [Izinkan Masuk ✓]  [Beri Kain/Kamen 🥋]  [Tegur ⚠️]  [Abaikan ✕]    │
│  - Manajemen Aturan Pura & Log Audit Lengkap                           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Panduan Menjalankan Sistem

### 1. Menjalankan via Docker Compose (Rekomendasi untuk Juri)

Sistem sudah dilengkapi container multi-stage Next.js dan PostgreSQL 16 yang siap dijalankan dengan satu perintah:

```bash
# 1. Salin template environment
cp .env.example .env

# 2. Jalankan docker-compose (Database PostgreSQL + Next.js App)
docker compose up -d --build
```

Aplikasi dapat langsung diakses di:
- **Beranda:** [http://127.0.0.1:3000](http://127.0.0.1:3000)
- **Kamera Deteksi:** [http://127.0.0.1:3000/camera](http://127.0.0.1:3000/camera)
- **Login Petugas:** [http://127.0.0.1:3000/login](http://127.0.0.1:3000/login)
- **Dashboard Pecalang:** [http://127.0.0.1:3000/dashboard](http://127.0.0.1:3000/dashboard)
- **Panel Admin:** [http://127.0.0.1:3000/admin](http://127.0.0.1:3000/admin)

---

### 2. Akun Pengujian Juri (*Demo Credentials*)

Pada halaman login (`/login`), tersedia tombol **1-Klik Isi Otomatis** khusus untuk pengujian juri:

| Role | Email | Password | Hak Akses |
| :--- | :--- | :--- | :--- |
| **Pecalang / Officer** | `pecalang@wastrajaga.id` | `pecalangpassword123` | Mengakses `/dashboard` & memverifikasi tindakan |
| **Administrator** | `admin@wastrajaga.id` | `adminpassword123` | Mengakses `/dashboard` dan panel konfigurasi `/admin` |

---

### 3. Pengujian Skenario Juri (Mode Mock vs Mode Live)

Aplikasi dirancang agar **dapat diuji 100% secara offline** tanpa memerlukan API key eksternal berbayar:

#### A. Mode Mock (Default — Tanpa API Key)
Secara default, `.env.example` diset ke `LLM_PROVIDER=mock`.
- Adapter akan mensimulasikan inferensi Vision AI secara cerdas berdasarkan variasi frame.
- Juri dapat langsung menguji alur deteksi, overlay kamera, penerimaan stream SSE, dan pengambilan tindakan pecalang tanpa konfigurasi tambahan.

#### B. Mode Live Vision AI (Online)
Jika ingin menguji menggunakan LLM Vision asli, ubah file `.env`:
```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=AIzaSy...
```
*(Mendukung provider `gemini`, `openai`, dan `anthropic` melalui adapter terpadu `lib/llm/adapter.ts`)*.

---

## 🧪 Verifikasi Kode & Pengujian Teknis

Proyek ini mempertahankan standar kualitas kode yang ketat (*zero error, zero warning*):

```bash
# 1. Menjalankan Unit Test (12 unit test lulus)
npm test

# 2. Menjalankan Static Code Analysis / Linter
npm run lint

# 3. Menjalankan Next.js Production Build
npm run build

# 4. Sinkronisasi Skema Database Drizzle
npm run db:push

# 5. Pengisian Data Awal (Seed Pura, Aturan, Akun)
npm run db:seed
```

---

## 🎨 Sistem Indikator Status (Konsisten di Seluruh Kode)

| Status | Warna Visual | Simbol | Makna & Tindakan Pecalang |
| :--- | :--- | :---: | :--- |
| **Pending** | Abu-abu Zinc | `○` | Orang baru terdeteksi / sedang dianalisis Vision AI |
| **OK** | Hijau Emerald | `✓` | Busana adat lengkap sesuai pakem pura |
| **Violation**| Merah | `✗` | Terindikasi ada atribut yang kurang (misal: kamen di atas lutut, tanpa selendang) |
| **Uncertain** | Kuning Amber | `?` | Tingkat keyakinan model rendah / tubuh terhalang; pecalang diminta cek mandiri |
| **Error** | Abu-abu Bergaris | `–` | Gangguan koneksi atau timeout pemrosesan |

---

## 📁 Struktur Kode Proyek

```text
├── app/
│   ├── admin/              # Panel pengelola pura (aturan, kamera, audit log)
│   ├── api/
│   │   ├── admin/rules/    # API CRUD aturan busana per pura
│   │   ├── auth/           # Endpoint NextAuth v5
│   │   ├── events/         # Stream Server-Sent Events (SSE) + Action handler
│   │   └── scan/           # Endpoint utama analisis Vision AI & Rule Engine
│   ├── camera/             # Antarmuka kamera browser on-device MediaPipe
│   ├── dashboard/          # Dashboard pecalang real-time dengan SSE
│   ├── login/              # Halaman login minimalis The White Album
│   ├── layout.tsx          # Layout global Next.js
│   └── page.tsx            # Beranda WastraJaga
├── drizzle/                # File migrasi SQL PostgreSQL
├── lib/
│   ├── db/                 # Skema Drizzle ORM (5 tabel) & client database
│   ├── llm/                # Adapter multi-provider (mock, gemini, openai, anthropic), schema, prompt
│   ├── crop.ts             # Modul privasi: crop tubuh + blur kepala di browser
│   ├── detector.ts         # Wrapper MediaPipe Tasks Vision on-device
│   ├── events.ts           # Event emitter singleton in-memory untuk SSE
│   ├── rules.ts            # Rule engine evaluasi busana pura
│   └── tracker.ts          # Algoritma tracking objek IoU + Centroid
├── docs/
│   └── third-party.md      # AI & Technology Disclosure lengkap
├── scripts/
│   ├── copy-mediapipe.mjs  # Otomasi penyalinan binary WASM & model MediaPipe
│   └── seed.ts             # Script seed data awal pura, aturan, dan pengguna
├── tests/
│   ├── rules.test.ts       # 8 unit test untuk rule engine busana adat
│   └── tracker.test.ts     # 4 unit test untuk IoU object tracking
├── PROGRESS.md             # Dokumen status pengerjaan (Single Source of Truth)
├── docker-compose.yml      # Orkestrasi Docker (App Next.js, PostgreSQL 16, Tunnel)
├── Dockerfile              # Multi-stage production build Next.js standalone
└── package.json            # Konfigurasi dependensi dan scripts npm
```

---

## 📜 AI & Technology Disclosure

Seluruh daftar pustaka, model pra-latih (*pre-trained model*), dan aset pihak ketiga yang digunakan dalam sistem WastraJaga terdokumentasi secara transparan di dokumen:
👉 **[`docs/third-party.md`](file:///home/learn/contest/bali-contest/docs/third-party.md)**.

---

## 👥 Tim Pengembang

Dikembangkan dengan dedikasi untuk pelestarian etika dan budaya luhur Pura di Bali pada ajang **AI Web Innovation Challenge – Bali DigiFest 2026**.
