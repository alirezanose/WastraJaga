# Third-Party Libraries & Assets Disclosure

Dokumen ini mencatat seluruh pustaka perangkat lunak (libraries), model kecerdasan buatan, dan aset pihak ketiga yang digunakan dalam sistem **WastraJaga**, sebagai bagian dari pemenuhan *AI & Technology Disclosure* pada kompetisi **AI Web Innovation Challenge – Bali DigiFest 2026**.

---

## 1. Vision & Machine Learning

| Pustaka / Aset | Versi | Lisensi | Sumber Resmi | Kegunaan dalam Proyek |
| :--- | :--- | :--- | :--- | :--- |
| **@mediapipe/tasks-vision** | `^0.10.22` | Apache-2.0 | [Google MediaPipe](https://developers.google.com/mediapipe) | Deteksi objek real-time langsung di browser client (pintu masuk pura) tanpa mengirimkan video mentah ke server. |
| **EfficientDet-Lite0 (.tflite)** | Float32 v1 | Apache-2.0 | [MediaPipe Models](https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite) | Model inferensi on-device untuk mendeteksi kategori `person` secara cepat dan akurat. |
| **MediaPipe WASM Binaries** | `0.10.x` | Apache-2.0 | `@mediapipe/tasks-vision/wasm` | Modul WebAssembly yang disalin otomatis ke `public/mediapipe/` via script `postinstall` agar berjalan tanpa dependensi CDN runtime. |

---

## 2. Web Framework & Antarmuka (Frontend / Backend)

| Pustaka | Versi | Lisensi | Sumber Resmi | Kegunaan dalam Proyek |
| :--- | :--- | :--- | :--- | :--- |
| **Next.js** | `^15.1.0` | MIT | [Next.js](https://nextjs.org/) | Framework full-stack berbasis App Router dengan mode `output: "standalone"` untuk kemudahan deployment container. |
| **React** | `^19.0.0` | MIT | [React](https://react.dev/) | Library UI deklaratif berbasis komponen untuk mengelola status kamera, overlay deteksi, dan antarmuka pecalang. |
| **React DOM** | `^19.0.0` | MIT | [React DOM](https://react.dev/) | DOM renderer untuk React. |
| **Tailwind CSS** | `^3.4.16` | MIT | [Tailwind CSS](https://tailwindcss.com/) | Styling antarmuka web modern dengan performa tinggi dan konsisten. |
| **PostCSS** | `^8.4.49` | MIT | [PostCSS](https://postcss.org/) | Preprocessor styling CSS. |
| **Autoprefixer** | `^10.4.20` | MIT | [Autoprefixer](https://github.com/postcss/autoprefixer) | Penambahan vendor-prefix CSS secara otomatis untuk kompatibilitas peramban. |

---

## 3. Testing & Tooling

| Pustaka | Versi | Lisensi | Sumber Resmi | Kegunaan dalam Proyek |
| :--- | :--- | :--- | :--- | :--- |
| **Vitest** | `^3.0.0` | MIT | [Vitest](https://vitest.dev/) | Framework unit testing ultra-cepat untuk memverifikasi keakuratan algoritma *Object Tracker* (IoU & centroid). |
| **TypeScript** | `^5.7.2` | Apache-2.0 | [TypeScript](https://www.typescriptlang.org/) | Memberikan pengetikan statis ketat (type safety) di seluruh arsitektur sistem. |
| **ESLint** | `^9.17.0` | MIT | [ESLint](https://eslint.org/) | Static code analysis untuk menjaga kualitas dan kepatuhan standar kode. |
| **Prettier** | `^3.4.2` | MIT | [Prettier](https://prettier.io/) | Code formatter otomatis untuk menjaga konsistensi gaya kode tim. |

---

## 4. Container & Infrastruktur

| Komponen / Image | Versi Tag | Lisensi | Sumber Resmi | Kegunaan dalam Proyek |
| :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL** | `16-alpine` | PostgreSQL License | [Docker Hub](https://hub.docker.com/_/postgres) | Database relasional untuk menyimpan konfigurasi aturan busana pura, data kamera, dan log audit perizinan tanpa menyimpan gambar mentah. |
| **Cloudflared** | `latest` | Apache-2.0 | [Cloudflare](https://github.com/cloudflare/cloudflared) | Manajemen tunnel aman untuk mengekspos aplikasi internal ke internet publik untuk pengujian juri tanpa membuka port router sembarangan. |
| **Node.js Alpine** | `22-alpine` | MIT | [Docker Hub](https://hub.docker.com/_/node) | Base image runtime multi-stage container Next.js yang ringan dan aman. |
