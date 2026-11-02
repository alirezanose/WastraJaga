# Proyek: Monitoring Busana Adat Pura berbasis Vision AI

## Tujuan
Web app untuk petugas/pecalang di pintu masuk pura. Kamera tetap (laptop/HP di pintu)
mendeteksi orang yang masuk, AI menilai kelayakan busana adat, dan hasilnya tampil
real-time: kotak HIJAU + ✓ jika sesuai, MERAH + ✗ jika melanggar, KUNING + ? jika
tidak yakin. Petugas melihat alert di dashboard. AI hanya MENANDAI; petugas yang memutuskan.

Ini entri lomba "AI Web Innovation Challenge – Bali DigiFest 2026". Syarat penting:
- MVP web harus benar-benar berfungsi dan bisa diuji juri; AI harus material di fungsi utama.
- Repo wajib: README.md lengkap, .env.example (TANPA secret asli), riwayat commit yang jelas.
- Jangan pernah commit API key, password, token. Gunakan environment variable.
- Tim harus bisa menjelaskan semua kode saat technical verification -> tulis kode
  sederhana, jelas, dengan komentar singkat pada bagian AI/logika penting.
- Semua library/aset pihak ketiga harus tercatat (untuk AI & Technology Disclosure).

## Keputusan arsitektur (sudah final, jangan diubah tanpa bertanya)
- Next.js (App Router) + TypeScript + Tailwind. Satu repo untuk UI + API.
- Deteksi orang + tracking berjalan DI BROWSER laptop pintu (MediaPipe Tasks Vision
  ObjectDetector, kategori "person"). Frame video TIDAK dikirim ke server.
- Hanya CROP kecil (~256px, area kepala di-blur) dikirim ke server, SATU KALI per ID tracking.
- Server: /api/scan -> Vision LLM (output JSON atribut pakaian) -> Zod validasi ->
  rule engine (aturan dari DB) -> verdict -> simpan event -> broadcast SSE ke dashboard.
- LLM lewat adapter (lib/llm/adapter.ts) dengan provider: gemini | openai | anthropic | mock.
  Mode `mock` wajib ada agar repo bisa dijalankan tanpa API key.
- Database: PostgreSQL 16 di Docker, ORM Drizzle, migrasi disimpan di repo.
- Auth: Auth.js (credentials), role: officer | admin, password di-hash (argon2/bcrypt).
- Realtime dashboard: SSE (bukan Supabase). Heartbeat ~20 detik. EventEmitter di memori.
- Deploy: VPS + docker-compose (db, app, cloudflared tunnel). Port app hanya 127.0.0.1.
- Aset MediaPipe (wasm + model .tflite) di-host sendiri di public/, bukan dari CDN.

## Status per orang (konsisten di seluruh kode)
pending (abu) | ok (hijau ✓) | violation (merah ✗) | uncertain (kuning ?) | error (abu bergaris)

## Kontrak API
POST /api/scan
  in : { temple_id, camera_id, track_id, image (jpeg base64) }  + header token kamera
  out: { status: "ok"|"violation"|"uncertain", reasons: string[], confidence: number, latency_ms: number }

Output LLM (minta ATRIBUT saja, bukan keputusan):
{ full_body_visible, lower_garment:{type,covers_knees,confidence},
  sash:{present,confidence}, upper_body:{shoulders_covered,confidence} }
Rule engine: violation jika atribut yakin (>=0.6) melanggar; uncertain jika confidence <0.6
atau full_body_visible=false; ok jika semua atribut wajib terpenuhi.
Penutup kepala (udeng) TIDAK dinilai di MVP karena kepala di-blur.

## Skema DB
users(id,email,password_hash,role,temple_id) | temples(id,name,region,rules_source)
cameras(id,temple_id,label,api_token_hash) | rules(id,temple_id,attribute,required_value,severity)
events(id,temple_id,camera_id,track_id,ts,status,reasons[],confidence,officer_action,officer_id)
TIDAK menyimpan foto/frame/crop apa pun.

## Privasi & keamanan (wajib)
- Tidak ada pengenalan wajah. Blur area kepala di browser sebelum crop dikirim.
- Server memproses crop di memori, tidak menulis ke disk.
- Teks alert netral: "perlu dicek: bahu terbuka", bukan "pelanggar".
- Rate limit /api/scan per kamera; validasi ukuran & tipe gambar; token per kamera.
- Semua kegagalan (LLM timeout, JSON invalid, kamera ditolak, offline) harus ditangani
  dengan pesan jelas dan fallback, bukan layar kosong/crash.

## Struktur repo
app/camera/page.tsx, app/dashboard/page.tsx, app/admin/page.tsx, app/api/scan/route.ts
lib/detector.ts, lib/tracker.ts, lib/crop.ts, lib/llm/{adapter,prompt,schema}.ts,
lib/rules.ts, lib/db/, docs/, .env.example, docker-compose.yml, Dockerfile, README.md

## Cara kerja yang diminta
1. Sebelum menulis kode, tulis rencana singkat (file yang dibuat/diubah) dan tunggu persetujuan.
2. Kerjakan SATU tugas kecil per langkah; jangan menambah fitur di luar tugas.
3. Jalankan lint, typecheck, dan build setelah perubahan; laporkan hasilnya.
4. Commit kecil dengan pesan jelas (feat:, fix:, chore:, docs:).
5. Verifikasi API library terbaru lewat dokumentasi resmi sebelum memakainya
   (jangan menebak nama fungsi/versi); catat versi yang dipakai.
6. Jika ada ambiguitas atau keputusan arsitektur baru, TANYA, jangan mengarang.
7. Setelah selesai, jelaskan singkat cara kerja kode utama agar tim bisa memahaminya.
8. Catat semua library & aset pihak ketiga di docs/third-party.md.
