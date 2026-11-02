import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-slate-950 text-slate-100">
      <div className="max-w-2xl w-full text-center space-y-6">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl text-emerald-400">
          WastraJaga
        </h1>
        <p className="text-lg text-slate-300">
          Monitoring Busana Adat Pura Berbasis Vision AI di Pintu Masuk
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
          <Link
            href="/camera"
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-500 transition-colors shadow-lg"
          >
            Buka Kamera Deteksi
          </Link>
        </div>
      </div>
    </main>
  );
}
