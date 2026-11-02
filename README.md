# WastraJaga - Monitoring Busana Adat Pura Berbasis Vision AI

Sistem cerdas pemantauan kepatuhan busana adat pura di pintu masuk (*kori agung / candi bentar*) berbasis Vision AI. Dirancang untuk membantu petugas pecalang menjaga kesucian dan tata krama pura secara etis, menjaga privasi umat/pengunjung, serta memberikan keputusan transparan.

Proyek ini diajukan untuk **AI Web Innovation Challenge – Bali DigiFest 2026**.

---

## Prinsip Desain & Privasi

1. **AI Menandai, Pecalang Memutuskan**: Sistem AI bertindak sebagai asisten pemantau yang mendeteksi atribut busana. Keputusan akhir teguran atau izin masuk tetap berada di tangan petugas pecalang.
2. **Privasi Tanpa Pengenalan Wajah**:
   - Pemrosesan video berjalan **100% di browser lokal** laptop pintu masuk menggunakan Google MediaPipe. Frame video mentah **tidak pernah** dikirim ke server.
   - Deteksi kepala di-blur sebelum pengiriman crop atribut busana ke server (pada fase berikutnya).
   - Server tidak pernah menyimpan berkas foto atau frame video ke dalam disk/database.
3. **Mandiri Tanpa Ketergantungan CDN Eksternal**:
   - Seluruh modul WebAssembly (WASM) dan bobot model `.tflite` di-host secara mandiri di repositori (`public/mediapipe` dan `public/models`).

---

## Tech Stack

- **Frontend & Fullstack Framework**: Next.js 15 (App Router, Server Actions & Standalone Output), React 19, TypeScript, Tailwind CSS.
- **On-Device Vision**: Google MediaPipe Tasks Vision (`ObjectDetector`, kategori `person`), WebAssembly (WASM), WebGL.
- **Tracking Algorithm**: IoU Tracker dengan fallback jarak Euclidean centroid (`lib/tracker.ts`).
- **Database**: PostgreSQL 16 Alpine via Docker.
- **Testing**: Vitest untuk unit test tracker.
- **Deployment & Infrastruktur**: Multi-stage Dockerfile, Docker Compose, Cloudflare Tunnel (`cloudflared`).

---

## Struktur Folder

```text
├── app/
│   ├── camera/
│   │   └── page.tsx        # Antarmuka kamera pintu masuk + canvas overlay + tracking
│   ├── globals.css         # Styling global Tailwind
│   ├── layout.tsx          # Root layout Next.js
│   └── page.tsx            # Halaman beranda navigasi sistem
├── docs/
│   └── third-party.md      # Disclosure lisensi & pustaka pihak ketiga
├── lib/
│   ├── detector.ts         # Singleton loader MediaPipe ObjectDetector lokal
│   └── tracker.ts          # Algoritma tracking multiobjek (IoU + Centroid)
├── public/
│   ├── mediapipe/          # Modul WASM runtime MediaPipe (diisi otomatis oleh postinstall)
│   └── models/
│       └── efficientdet_lite0.tflite # Model tflite untuk deteksi orang
├── scripts/
│   └── copy-mediapipe.mjs  # Skrip salin otomatis binary WASM dari node_modules
├── tests/
│   └── tracker.test.ts     # Unit testing komprehensif untuk ObjectTracker
├── docker-compose.yml      # Orkestrasi container PostgreSQL, App Next.js, dan Cloudflared
├── Dockerfile              # Multi-stage build Next.js standalone
├── .env.example            # Templat variabel lingkungan tanpa secret
└── vitest.config.mts       # Konfigurasi pengujian Vitest
```

---

## Cara Menjalankan

### 1. Menjalankan di Lingkungan Pengembangan Lokal (Dev)

**Prasyarat**: Node.js v20+ atau v22 LTS terpasang.

1. Pasang dependensi dan salin aset WASM MediaPipe:
   ```bash
   npm install
   ```
2. Jalankan server pengembangan Next.js:
   ```bash
   npm run dev
   ```
3. Buka peramban di [http://localhost:3000](http://localhost:3000) dan navigasikan ke menu **Kamera Deteksi** ([http://localhost:3000/camera](http://localhost:3000/camera)).

### 2. Menjalankan Unit Test

Uji algoritma pelacakan objek (IoU & centroid matching):
```bash
npm test
```

### 3. Menjalankan via Docker Compose (Produksi)

1. Salin templat file lingkungan:
   ```bash
   cp .env.example .env
   ```
2. Jalankan build dan aktifkan container:
   ```bash
   docker compose up -d --build
   ```
3. Buka [http://127.0.0.1:3000](http://127.0.0.1:3000) pada browser lokal.
4. (*Opsional*) Untuk mengaktifkan tunnel publik Cloudflare, isi `TUNNEL_TOKEN` di `.env` dan jalankan:
   ```bash
   docker compose --profile tunnel up -d
   ```

---

## Status Per Orang (Sistem Indikator)

| Status | Tampilan Visual | Makna |
| :--- | :--- | :--- |
| **Pending** | Kotak **ABU** | Orang baru masuk frame / sedang dianalisis model |
| **OK** | Kotak **HIJAU** (✓) | Busana adat sesuai pakem pura |
| **Violation**| Kotak **MERAH** (✗) | Ditemukan indikasi ketidaksesuaian busana (mis. bahu terbuka) |
| **Uncertain** | Kotak **KUNING** (?) | Kepercayaan model rendah / bagian tubuh terhalang |
| **Error** | Kotak **ABU BERGARIS** | Gagal memproses data atau koneksi timeout |

---

## Known Limitations (Batasan Sistem Saat Ini)

1. **Oklusi Berat Antar Umat**: Jika dua orang saling menutupi tubuh secara ekstrem saat berjalan beriringan rapat di pintu, tracker dapat kehilangan jejak sementara hingga tubuh mereka terpisah kembali.
2. **Kondisi Pencahayaan Ekstrem**: Deteksi bounding box bergantung pada kejernihan sensor kamera; kondisi pencahayaan malam hari yang sangat gelap tanpa lampu penerangan di area pintu masuk pura dapat menurunkan skor akurasi deteksi orang MediaPipe.
3. **Cakupan Fase 1**: Pada Fase 1, status yang ditampilkan adalah status dasar `pending (abu)` dengan ID pelacakan stabil. Analisis inferensi LLM atribut pakaian, rule engine di server, dashboard pecalang, dan integrasi SSE akan dihubungkan pada fase pengerjaan berikutnya.
