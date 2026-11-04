# AI & Technology Disclosure — WastraJaga (Tim Drogon)

Dokumen ini memuat **Tabel Resmi Lampiran C (AI & Technology Disclosure)** serta rincian pustaka pihak ketiga yang digunakan dalam pengembangan **WastraJaga** untuk kompetisi **AI Web Innovation Challenge – Bali DigiFest 2026**.

---

## Lampiran C - AI & Technology Disclosure

| Komponen | Isi Peserta |
| :--- | :--- |
| **Nama Produk** | **WastraJaga** — Sistem Pemantauan Busana Adat Pura di Pintu Masuk Berbasis Vision AI On-Device |
| **Framework / Frontend** | Next.js 15 (`^15.5.28`, App Router), React 19 (`^19.0.0`), TypeScript (`^5.7.2`), Tailwind CSS (`^3.4.16`) |
| **Backend / Runtime** | Node.js 22 Alpine (Next.js Standalone Server & Route Handlers), Server-Sent Events (SSE) via Node `EventEmitter` |
| **Database / Storage** | PostgreSQL 16 (`postgres:16-alpine`) dengan Drizzle ORM (`^0.45.4`) — **0% penyimpanan foto/gambar mentah** (hanya menyimpan metadata waktu, status, alasan, dan tindakan petugas; dilengkapi *auto-prune* maks. 100 log terbaru) |
| **Hosting / Deployment** | Microsoft Azure (Docker Compose: Container App + PostgreSQL) pada domain kustom `https://wastrajaga.ahmadalireza.site` |
| **AI Model / API / Method** | 1. **On-Device Edge Vision (Browser):** Google MediaPipe `EfficientDet-Lite0` (`.tflite`, deteksi tubuh `person`) & `BlazeFace Short-Range` (`.tflite`, deteksi wajah untuk privasi *face blur/pixelation* otomatis) + algoritma *IoU & Centroid Object Tracker*.<br>2. **Cloud Vision LLM (Server):** Google Gemini Vision API (`gemini-3.1-flash-lite` / `gemini-2.5-flash`) melalui multi-provider adapter (`gemini` \| `openai` \| `anthropic` \| `mock`) + *Deterministic Rule Engine* (`lib/rules.ts`). |
| **Peran AI dalam Produk** | AI menjadi komponen inti (*material*) dari fungsi utama produk: mendeteksi kedatangan pengunjung secara real-time di kamera gerbang, mengaburkan wajah secara otomatis di sisi browser demi privasi, mengekstraksi atribut kelengkapan busana adat Bali (baju atasan/bahu, ikatan selendang/senteng, dan kain bawah/kamen), serta memicu notifikasi real-time ke Dashboard Pecalang. |
| **Dataset / Data Source** | Tidak menggunakan dataset pribadi eksternal. Model deteksi objek dan wajah menggunakan *pre-trained weights* resmi MediaPipe (COCO & BlazeFace), sedangkan aturan kepatuhan busana merujuk pada Perda Provinsi Bali No. 5 Tahun 2020 & pedoman umum tata busana memasuki kawasan suci pura. |
| **Open-source Libraries** | `@mediapipe/tasks-vision`, `@google/generative-ai`, `drizzle-orm`, `postgres`, `next-auth` (Auth.js v5), `argon2`, `zod`, `vitest`, `tailwindcss` |
| **Template / Boilerplate** | Inisialisasi dasar menggunakan struktur standar Next.js App Router TypeScript; seluruh desain antarmuka bertema minimalis monokromatik (*The White Album*), modul *tracker*, *face blur*, *LLM adapter*, *rule engine*, dan *CCTV Matrix* dibangun khusus dari nol untuk proyek ini. |
| **AI Coding Assistant** | Menggunakan bantuan AI Coding Assistant (Google Gemini / Antigravity IDE) untuk percepatan penulisan boilerplate kode, pembuatan unit test, dan perapian dokumentasi. Seluruh arsitektur, logika sistem, pengujian, dan verifikasi kode dipahami dan dipertanggungjawabkan sepenuhnya oleh **Tim Drogon**. |
| **Pre-existing Components** | **Tidak ada (*100% Fresh Build*).** Seluruh kode aplikasi WastraJaga dikembangkan khusus untuk kompetisi **AI Web Innovation Challenge – Bali DigiFest 2026** dan belum pernah dikomersialisasikan. |
| **Third-party Assets / Credits** | Binary WebAssembly MediaPipe (`vision_wasm_internal.wasm`), model `efficientdet_lite0.tflite`, dan model `blaze_face_short_range.tflite` dari Google MediaPipe (Lisensi Apache-2.0), di-host secara mandiri di dalam folder `public/` aplikasi. |

> **Pernyataan:**  
> Kami (**Tim Drogon**: Ahmad Ali Reza, Muhammad Saifuddin Zuhri, Muhammad Sofyan) menyatakan bahwa informasi di atas benar dan lengkap. Kami bertanggung jawab atas penggunaan teknologi, source code, data, library, API, model AI, dan aset yang digunakan pada produk.

---

## Rincian Pustaka & Lisensi Pihak Ketiga

### 1. Vision & Machine Learning

| Pustaka / Aset | Versi | Lisensi | Sumber Resmi | Kegunaan dalam Proyek |
| :--- | :--- | :--- | :--- | :--- |
| **@mediapipe/tasks-vision** | `^0.10.22` | Apache-2.0 | [Google MediaPipe](https://developers.google.com/mediapipe) | Deteksi objek dan wajah real-time langsung di browser client tanpa mengirimkan video mentah ke server. |
| **EfficientDet-Lite0 (.tflite)** | Float32 v1 | Apache-2.0 | [MediaPipe Models](https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite) | Model inferensi on-device untuk mendeteksi kategori `person` secara cepat. |
| **BlazeFace Short-Range (.tflite)** | Float16 v1 | Apache-2.0 | [MediaPipe Models](https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite) | Model deteksi koordinat wajah (~225KB) di browser untuk memastikan privasi *face blur/pixelation* 100% akurat sebelum gambar dikirim ke server. |
| **MediaPipe WASM Binaries** | `0.10.x` | Apache-2.0 | `@mediapipe/tasks-vision/wasm` | Modul WebAssembly di `public/mediapipe/` agar berjalan tanpa dependensi CDN runtime. |
| **@google/generative-ai** | `^0.24.1` | Apache-2.0 | [Google Generative AI](https://github.com/google-gemini/generative-ai-js) | SDK resmi Google Gemini Vision API untuk menganalisis atribut pakaian adat Bali pada crop gambar ter-blur. |
| **Zod** | `^3.24.1` | MIT | [Zod](https://zod.dev/) | Validasi skema runtime TypeScript untuk memverifikasi payload `/api/scan` dan output JSON Vision LLM. |

### 2. Web Framework, Keamanan, & Database

| Pustaka | Versi | Lisensi | Sumber Resmi | Kegunaan dalam Proyek |
| :--- | :--- | :--- | :--- | :--- |
| **Next.js** | `^15.5.28` | MIT | [Next.js](https://nextjs.org/) | Framework full-stack berbasis App Router dengan mode `output: "standalone"`. |
| **React & React DOM** | `^19.0.0` | MIT | [React](https://react.dev/) | Library UI deklaratif untuk mengelola CCTV Matrix, overlay deteksi, dan dashboard SSE. |
| **Tailwind CSS** | `^3.4.16` | MIT | [Tailwind CSS](https://tailwindcss.com/) | Styling antarmuka web minimalis monokromatik. |
| **NextAuth.js (Auth.js v5)** | `^5.0.0-beta.30` | ISC | [Auth.js](https://authjs.dev/) | Sistem autentikasi kredensial berbasis role (`officer` & `admin`). |
| **Argon2** | `^0.44.0` | MIT | [Argon2 Node](https://github.com/ranisalt/node-argon2) | Algoritma hashing password untuk menyimpan kredensial petugas dan admin secara aman. |
| **Drizzle ORM & Drizzle Kit** | `^0.45.4` | Apache-2.0 | [Drizzle ORM](https://orm.drizzle.team/) | Type-safe ORM dan migrasi skema untuk PostgreSQL 16. |
| **Postgres.js** | `^3.4.5` | PostgreSQL | [Postgres.js](https://github.com/porsager/postgres) | Driver PostgreSQL native untuk Node.js/TypeScript. |
| **Vitest** | `^5.0.5` | MIT | [Vitest](https://vitest.dev/) | Framework unit testing untuk memverifikasi *Rule Engine* (8 test) dan *Object Tracker* (4 test). |
