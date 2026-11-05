# PROPOSAL SOLUSI & MVP AI WEB — BALI DIGIFEST 2026

---

## COVER
- **Nama Produk:** **WastraJaga** — Sistem Pemantauan Busana Adat Pura di Pintu Masuk Berbasis Vision AI On-Device
- **Tema / Ruang Lingkup:** *Build with AI, Solve for Bali* — **Bali Smart Society** (Budaya, Pariwisata Berkelanjutan, & Layanan Komunitas Adat)
- **Nama Tim:** **Drogon**
- **Susunan Anggota Tim:**
  1. **Ahmad Ali Reza** (Ketua Tim / Lead Full-Stack & AI Engineer)
  2. **Muhammad Saifuddin Zuhri** (Anggota / Backend & Data Engineer)
  3. **Muhammad Sofyan** (Anggota / Frontend & UI/UX Engineer)
- **Tautan MVP Live (Azure):** `https://wastrajaga.ahmadalireza.site`

---

## 1. Problem & Background
Pura di Bali merupakan kawasan suci persembahyangan umat Hindu yang sekaligus menjadi daya tarik utama budaya dunia. Berdasarkan *Awig-awig Desa Adat* serta Surat Edaran Gubernur Bali dan Perda Provinsi Bali No. 5 Tahun 2020, setiap orang yang memasuki kawasan pura wajib mengenakan busana adat yang sopan: menggunakan kain **kamen/sarung** di bawah lutut, mengikatkan **selendang (senteng)** di pinggang, dan mengenakan **baju atasan dengan bahu tertutup**.

Namun di lapangan, petugas keamanan adat (**Pecalang**) menghadapi tiga kendala nyata:
1. **Rasio Pengunjung vs Petugas yang Tidak Seimbang:** Pada jam ramai atau hari raya, ratusan pengunjung dan wisatawan masuk bersamaan melalui gerbang (*Candi Bentar*), sehingga pengawasan visual manual rawan terlewat.
2. **Kurangnya Pemahaman Wisatawan:** Banyak wisatawan domestik maupun mancanegara yang belum memahami standar kelengkapan busana pura (misalnya memakai kamen tetapi tidak mengikat selendang, atau memakai atasan tanpa lengan/bahu terbuka).
3. **Risiko Pelanggaran Privasi pada CCTV Biasa:** Pemasangan kamera cerdas yang merekam wajah pengunjung ke server cloud menimbulkan kekhawatiran privasi dan kepatuhan terhadap UU Perlindungan Data Pribadi (UU No. 27 Tahun 2022).

---

## 2. Target User
1. **Pecalang (Petugas Keamanan Adat di Gerbang Pura):**
   - *Konteks Penggunaan:* Berjaga di pos pintu masuk pura menggunakan tablet, smartphone, atau layar monitor.
   - *Pain Point:* Lelah memantau kerumunan secara terus-menerus dan membutuhkan asisten penanda objektif agar dapat menyapa pengunjung secara santun (misalnya menawarkan peminjaman kain sarung/selendang).
2. **Pengelola Pura / Prajuru Desa Adat (Administrator):**
   - *Konteks Penggunaan:* Mengatur kebijakan tata tertib pura dan mengevaluasi tingkat kepatuhan pengunjung.
   - *Pain Point:* Tidak memiliki data statistik kepatuhan harian dan membutuhkan sistem pencatatan (audit log) yang bebas dari risiko penyimpanan foto wajah pengunjung.

---

## 3. Proposed Solution
**WastraJaga** adalah aplikasi web pemantauan busana adat pura yang menerapkan prinsip **"AI Menandai, Pecalang yang Memutuskan"** serta **"100% Privasi On-Device"**.

### Alur Perjalanan Pengguna (*User Journey* Utama):
1. **Deteksi & Blur Wajah di Gerbang (`/camera`):** Kamera tetap di pintu masuk mendeteksi pengunjung yang lewat dan langsung mengaburkan (*pixelate*) area wajah di dalam browser perangkat itu sendiri.
2. **Analisis Atribut Busana (`/api/scan`):** Hanya potongan gambar tubuh berukuran kecil (~256px) yang wajahnya sudah di-blur yang dikirim ke server untuk dianalisis atribut pakaiannya oleh Vision AI dan *Rule Engine*.
3. **Indikator Visual & Alert Real-Time (`/dashboard`):**
   - **Hijau (`✓ OK`):** Busana lengkap sesuai aturan.
   - **Merah (`✗ VIOLATION`):** Terdeteksi atribut kurang (mis. *"perlu dicek: bahu terbuka / tidak berbaju atasan"* atau *"selendang tidak terlihat"*).
   - **Kuning (`? UNCERTAIN`):** Keyakinan AI rendah / tubuh terhalang; meminta verifikasi manual Pecalang.
4. **Tindakan Kearifan Pecalang:** Pecalang melihat notifikasi real-time di Dashboard dan menekan tombol keputusan (*Izinkan Masuk*, *Pinjamkan Sarung/Selendang*, *Beri Teguran*, atau *Abaikan*).

---

## 4. AI Implementation
WastraJaga mengintegrasikan **dua lapis teknologi AI** yang bekerja saling melengkapi:

| Lapisan AI | Model / Metode | Input | Output | Alasan AI Diperlukan |
| :--- | :--- | :--- | :--- | :--- |
| **1. Edge Computer Vision (Browser)** | MediaPipe `EfficientDet-Lite0` + `BlazeFace Short-Range` (`.tflite` via WASM) + *IoU Tracker* | Frame video live dari kamera gerbang | Koordinat *bounding box* tubuh (`person`) & koordinat presisi wajah (`face`) @ 25–30 FPS | Memungkinkan deteksi manusia dan pemburaman wajah dilakukan 100% di sisi klien sebelum data menyentuh jaringan internet. |
| **2. Cloud Vision LLM (Server)** | Google Gemini Vision (`gemini-3.1-flash-lite` / `gemini-2.5-flash`) + *Zod Validation* + *Rule Engine* | Crop JPEG Base64 (~256px, wajah sudah di-blur) + *System Prompt* | JSON terstruktur atribut pakaian (`upper_body`, `sash`, `lower_garment`, `full_body_visible`) + nilai *confidence* | Busana adat Bali memiliki variasi corak kain, kebaya, dan ikatan senteng yang sangat beragam sehingga membutuhkan *Visual Reasoning* dari Vision LLM. |

**Penanganan Kegagalan (*Fallback*):** Jika API LLM mengalami gangguan/timeout atau pengguna menjalankan aplikasi tanpa API key, adapter otomatis beralih ke fallback aman (`uncertain`) atau mode `mock` deterministik sehingga aplikasi tidak pernah berhenti beroperasi.

---

## 5. MVP & Key Features
Seluruh fitur berikut **sudah berfungsi penuh dan dapat diuji langsung oleh Dewan Juri**:
- **Core Features (Fitur Inti):**
  1. **Real-Time Dual Detection & Face Blur (`/camera`):** Deteksi orang + mozaik wajah otomatis di layar kamera dan pada gambar crop.
  2. **Vision AI Scan & Rule Engine (`/api/scan`):** Penilaian kelengkapan baju atasan/bahu, selendang/senteng, dan kain bawah/kamen dalam ~1 detik.
  3. **Live Privacy Proof Inspector:** Panel pembuktian real-time di halaman kamera yang menampilkan hasil crop ~256px (wajah ter-blur) yang dikirim ke AI.
  4. **Real-Time Pecalang Dashboard via SSE (`/dashboard`):** Stream notifikasi langsung dengan filter status, ringkasan statistik harian, dan tombol pencatatan tindakan Pecalang.
- **Additional Features (Fitur Pendukung):**
  5. **Multi-Channel CCTV Matrix (`2x2 Grid` & `1x1 Focus`):** Konektor untuk kamera USB tambahan maupun stream IP Camera (HTTP MJPEG / HLS).
  6. **Role-Based Admin Panel & Auto-Prune Log (`/admin`):** Manajemen aturan busana per pura, inventaris kamera, dan log audit otomatis (dibatasi maks. 100 log terbaru agar database tetap ringan).

---

## 6. Technical Architecture

```text
[Pengunjung] ──► [Frontend Browser: /camera]
                   │ • MediaPipe ObjectDetector + FaceDetector (WASM Lokal)
                   │ • IoU Object Tracker + cropAndBlurHead() (Wajah Di-blur)
                   ▼
             [Backend Next.js API: POST /api/scan]
                   │ • Validasi Token Kamera, Rate Limit, & Zod Schema
                   ├────► [Vision AI Adapter: Gemini 3.1 Flash Lite / Mock]
                   │        └──► Output JSON Atribut Busana
                   ├────► [Deterministic Rule Engine (lib/rules.ts)]
                   │        └──► Verdict: ok | violation | uncertain
                   ├────► [PostgreSQL 16 + Drizzle ORM] (Simpan Metadata Tanpa Foto)
                   └────► [SSE Event Stream: GET /api/events]
                            ▼
             [Dashboard Pecalang (/dashboard) & Panel Admin (/admin)]
```

---

## 7. Innovation & Differentiation
1. **Zero-Face & Zero-Image Storage (Kepatuhan UU PDP):** Berbeda dari sistem CCTV AI biasa yang mengirim video wajah ke server dan menyimpan foto pelanggar di database, WastraJaga mem-blur wajah di browser dan **tidak menyimpan file gambar apa pun di disk maupun database**.
2. **Pemisahan Ekstraksi Atribut (AI) dan Keputusan (Rule Engine & Manusia):** AI tidak diberi wewenang menghakimi secara *black-box*, melainkan hanya mendeskripsikan atribut objektif yang kemudian dievaluasi oleh *Rule Engine* sesuai aturan masing-masing pura.
3. **Arsitektur Hibrida Hemat Bandwidth:** Video 720p/1080p tidak pernah dikirim ke server; hanya crop kecil ~25 KB yang dikirim setiap pemindaian sehingga sangat hemat kuota internet di daerah pura.

---

## 8. Impact & Development Potential
- **Manfaat Nyata:** Membantu Pecalang menjaga kesucian dan ketertiban kawasan pura secara santun, edukatif, dan modern tanpa mengurangi wibawa kearifan lokal.
- **Potensi Pengembangan (*Scalability*):**
  - Integrasi pengumuman suara ramah multibahasa (*Text-to-Speech* Indonesia/Inggris/Bali) di gerbang pura ketika terdeteksi atribut busana yang belum lengkap.
  - Pelatihan model *lightweight classifier* khusus busana adat Bali (ONNX/TFLite) agar 100% inferensi atribut pakaian juga dapat berjalan *offline* di browser tanpa koneksi internet.
- **Keterbatasan MVP Saat Ini:** Penutup kepala pria (*udeng*) belum dinilai karena area kepala sengaja di-blur untuk privasi; penilaian kain bawah membutuhkan posisi kamera yang melihat tubuh secara utuh dari bahu hingga lutut.

---

## 9. Technology Disclosure
- **Framework & Bahasa:** Next.js 15 (App Router), React 19, TypeScript 5.7, Tailwind CSS 3.4
- **Database & ORM:** PostgreSQL 16 Alpine, Drizzle ORM
- **AI Model & SDK:** MediaPipe Tasks Vision (`EfficientDet-Lite0` & `BlazeFace Short-Range`), Google Gemini API (`@google/generative-ai`)
- **Keamanan & Testing:** Auth.js v5, Argon2id, Zod, Vitest (12 unit test)
- **Hosting:** Microsoft Azure (Docker Compose) pada domain `wastrajaga.ahmadalireza.site`
- **AI Coding Assistant:** Google Gemini / Antigravity IDE (digunakan sebagai asisten penulisan kode dan dokumentasi; seluruh logika diverifikasi penuh oleh Tim Drogon).

---

## 10. Submission Links
- **Nama Tim:** Drogon (Ahmad Ali Reza, Muhammad Saifuddin Zuhri, Muhammad Sofyan)
- **Deployment URL (Live MVP):** `https://wastrajaga.ahmadalireza.site`
- **GitHub Repository:** `https://github.com/alirezanose/WastraJaga`
- **Release Tag Submission:** `v1.0-submission`
- **Demo Account (Khusus Pengujian Juri di Formulir Panitia):**
  - **Akun Pecalang (`/dashboard`):** *(Sertakan email & password pecalang di form panitia)*
  - **Akun Administrator (`/admin`):** *(Sertakan email & password admin di form panitia)*
