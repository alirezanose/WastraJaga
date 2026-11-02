import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-zinc-900 flex flex-col items-center justify-between p-8 sm:p-16 selection:bg-zinc-200">
      {/* Top minimalistic brand stamp */}
      <header className="w-full max-w-4xl flex items-center justify-between text-xs tracking-widest uppercase text-zinc-600 font-mono">
        <span>Kori Agung AI</span>
        <span>Bali DigiFest 2026</span>
      </header>

      {/* Hero Content - The White Album style */}
      <div className="max-w-3xl w-full my-auto text-left space-y-8 py-16">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-widest text-zinc-600 font-mono">
            Sistem Pemantauan Etika & Tata Krama
          </p>
          <h1 className="text-5xl sm:text-7xl font-light tracking-tight text-zinc-950 font-serif">
            WastraJaga.
          </h1>
        </div>

        <p className="text-base sm:text-lg text-zinc-600 font-light max-w-xl leading-relaxed">
          Pemantauan keselarasan busana adat pura di pintu masuk berbasis Vision AI on-device. Mengutamakan privasi tanpa pengenalan wajah. AI menandai, pecalang memutuskan.
        </p>

        <div className="pt-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Link
            href="/camera"
            className="inline-flex items-center justify-center rounded-none border border-zinc-900 bg-zinc-950 px-8 py-3.5 text-sm font-medium tracking-wide text-white hover:bg-white hover:text-zinc-950 transition-colors duration-200 shadow-sm"
          >
            Buka Kamera Deteksi &rarr;
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-none border border-zinc-300 bg-white px-6 py-3.5 text-sm font-medium tracking-wide text-zinc-900 hover:border-zinc-950 transition-colors duration-200"
          >
            Masuk Petugas &rarr;
          </Link>
          <span className="text-xs text-zinc-600 font-mono">
            Mode On-Device &bull; Standalone
          </span>
        </div>
      </div>

      {/* Minimal Footer */}
      <footer className="w-full max-w-4xl pt-8 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-600 font-mono gap-2">
        <div>WastraJaga &copy; 2026</div>
        <div>Privasi Terjamin &bull; 0% Penyimpanan Foto Mentah</div>
      </footer>
    </main>
  );
}
