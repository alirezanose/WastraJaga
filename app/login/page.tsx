"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setIsLoading(true);

    try {
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (res?.error) {
        setErrorMessage("Email atau kata sandi tidak valid. Silakan periksa kembali.");
        setIsLoading(false);
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setErrorMessage("Terjadi kesalahan sistem saat menghubungi server autentikasi.");
      setIsLoading(false);
    }
  };

  const handleQuickFill = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setErrorMessage("");
  };

  return (
    <div className="w-full max-w-md space-y-8">
      {/* Editorial Title */}
      <div className="space-y-2 text-left">
        <p className="text-xs uppercase tracking-widest text-zinc-500 font-mono">
          Otoritas &amp; Pengawasan Masuk
        </p>
        <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-zinc-950 font-serif">
          Masuk Petugas.
        </h1>
        <p className="text-sm text-zinc-600 font-light leading-relaxed">
          Silakan autentikasi identitas pecalang atau pengelola pura sebelum mengakses sistem kendali.
        </p>
      </div>

      {/* Error Message Alert */}
      {errorMessage && (
        <div className="border border-red-200 bg-red-50/50 p-3.5 text-xs text-red-800 font-mono flex items-start gap-2">
          <span className="font-bold">✗</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Login Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="block text-xs uppercase tracking-wider text-zinc-600 font-mono"
          >
            Alamat Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@wastrajaga.id"
            className="w-full rounded-none border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-950 focus:outline-none transition-colors font-mono"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="block text-xs uppercase tracking-wider text-zinc-600 font-mono"
          >
            Kata Sandi
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            className="w-full rounded-none border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-950 focus:outline-none transition-colors font-mono"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-none border border-zinc-950 bg-zinc-950 px-6 py-3.5 text-xs font-mono uppercase tracking-widest text-white hover:bg-white hover:text-zinc-950 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {isLoading ? "Memverifikasi..." : "Masuk Sistem →"}
        </button>
      </form>

      {/* Demo Credentials Box for Judges */}
      <div className="border-t border-zinc-200 pt-6 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-zinc-500 font-mono">
            Akses Cepat Pengujian (Juri)
          </span>
          <span className="text-[10px] font-mono text-zinc-400">Klik untuk isi otomatis</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-left">
          <button
            type="button"
            onClick={() => handleQuickFill("pecalang@wastrajaga.id", "pecalangpassword123")}
            className="border border-zinc-200 bg-zinc-50/50 p-2.5 text-left hover:border-zinc-900 transition-colors text-xs font-mono space-y-1"
          >
            <div className="text-[10px] uppercase text-zinc-500">Pecalang / Officer</div>
            <div className="font-semibold text-zinc-900 truncate">pecalang@...</div>
          </button>

          <button
            type="button"
            onClick={() => handleQuickFill("admin@wastrajaga.id", "adminpassword123")}
            className="border border-zinc-200 bg-zinc-50/50 p-2.5 text-left hover:border-zinc-900 transition-colors text-xs font-mono space-y-1"
          >
            <div className="text-[10px] uppercase text-zinc-500">Administrator</div>
            <div className="font-semibold text-zinc-900 truncate">admin@...</div>
          </button>
        </div>
      </div>

      {/* Back to Home Navigation */}
      <div className="text-center pt-2">
        <Link
          href="/"
          className="text-xs font-mono text-zinc-500 hover:text-zinc-950 transition-colors tracking-wide"
        >
          &larr; Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-white text-zinc-900 flex flex-col items-center justify-between p-6 sm:p-12 selection:bg-zinc-200">
      {/* Top minimalistic brand stamp */}
      <header className="w-full max-w-4xl flex items-center justify-between text-xs tracking-widest uppercase text-zinc-500 font-mono">
        <span>WastraJaga &bull; Vision AI</span>
        <span>Bali DigiFest 2026</span>
      </header>

      {/* Center content */}
      <div className="w-full flex justify-center py-12">
        <Suspense fallback={<div className="font-mono text-xs text-zinc-500">Memuat formulir...</div>}>
          <LoginForm />
        </Suspense>
      </div>

      {/* Minimal Footer */}
      <footer className="w-full max-w-4xl pt-6 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 font-mono gap-2">
        <div>WastraJaga &copy; 2026</div>
        <div>Keamanan Data &bull; Enkripsi Argon2id</div>
      </footer>
    </main>
  );
}
