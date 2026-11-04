"use client";

import React, { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import type { Temple, Rule, Camera } from "@/lib/db/schema";
import type { DashboardEvent } from "@/lib/events";

interface AdminClientProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: "officer" | "admin";
  };
  temple: Temple;
  initialRules: Rule[];
  initialCameras: Camera[];
  initialEvents: DashboardEvent[];
}

export default function AdminClient({
  user,
  temple,
  initialRules,
  initialCameras,
  initialEvents,
}: AdminClientProps) {
  const [activeTab, setActiveTab] = useState<"rules" | "cameras" | "audit">("rules");
  const [rulesList, setRulesList] = useState<Rule[]>(initialRules);
  const [eventsList, setEventsList] = useState<DashboardEvent[]>(initialEvents);
  const [isClearingLogs, setIsClearingLogs] = useState(false);

  // Format Tanggal + Jam lengkap (WITA)
  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    const datePart = d.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const timePart = d.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    return `${datePart} · ${timePart} WITA`;
  };

  // Handler bersihkan semua log audit
  const handleClearAllLogs = async () => {
    if (!confirm("Bersihkan seluruh riwayat log audit pada pura ini?")) return;
    setIsClearingLogs(true);
    try {
      const res = await fetch(`/api/admin/logs?templeId=${temple.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Gagal membersihkan log");
      setEventsList([]);
    } catch {
      alert("Terjadi kesalahan saat membersihkan log audit.");
    } finally {
      setIsClearingLogs(false);
    }
  };

  // Handler hapus 1 baris log audit
  const handleDeleteSingleLog = async (eventId: string) => {
    try {
      const res = await fetch(`/api/admin/logs?id=${eventId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Gagal menghapus log");
      setEventsList((prev) => prev.filter((ev) => ev.id !== eventId));
    } catch {
      alert("Gagal menghapus baris log.");
    }
  };

  // Form tambah aturan
  const [newAttribute, setNewAttribute] = useState("lower_garment");
  const [newRequiredValue, setNewRequiredValue] = useState("covers_knees:true");
  const [newSeverity, setNewSeverity] = useState<"violation" | "warning">("violation");
  const [isSubmittingRule, setIsSubmittingRule] = useState(false);
  const [formFeedback, setFormFeedback] = useState<string | null>(null);

  // Handler tambah aturan
  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingRule(true);
    setFormFeedback(null);

    try {
      const res = await fetch("/api/admin/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templeId: temple.id,
          attribute: newAttribute.trim(),
          requiredValue: newRequiredValue.trim(),
          severity: newSeverity,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menambah aturan");

      setRulesList((prev) => [...prev, data.rule]);
      setFormFeedback("✓ Aturan baru berhasil didaftarkan ke sistem");
    } catch (err) {
      setFormFeedback(err instanceof Error ? `✗ ${err.message}` : "✗ Gagal menyimpan aturan");
    } finally {
      setIsSubmittingRule(false);
    }
  };

  // Handler hapus aturan
  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm("Hapus aturan busana ini dari basis data pura?")) return;

    try {
      const res = await fetch(`/api/admin/rules?id=${ruleId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Gagal menghapus aturan");
      setRulesList((prev) => prev.filter((r) => r.id !== ruleId));
    } catch {
      alert("Terjadi kesalahan saat menghapus aturan.");
    }
  };

  return (
    <main className="min-h-screen bg-white text-zinc-900 selection:bg-zinc-200 flex flex-col justify-between">
      {/* ── Top Header Bar ────────────────────────────────────────── */}
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-serif text-2xl font-light tracking-tight text-zinc-950">
              WastraJaga.
            </Link>
            <span className="hidden sm:inline-block border-l border-zinc-200 h-5" />
            <span className="hidden sm:inline-block text-xs font-mono uppercase tracking-widest text-zinc-500">
              Panel Pengelola Pura (Admin)
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="border border-zinc-300 px-3 py-1 text-xs font-mono uppercase tracking-wider text-zinc-800 hover:border-zinc-950 transition-colors"
            >
              Dashboard Pecalang &rarr;
            </Link>

            <Link
              href="/camera"
              className="border border-zinc-200 px-2.5 py-1 text-xs font-mono uppercase text-zinc-600 hover:text-zinc-950 transition-colors"
            >
              Kamera
            </Link>

            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="border border-zinc-200 px-2.5 py-1 text-xs font-mono uppercase text-zinc-500 hover:text-zinc-950 hover:border-zinc-950 transition-colors"
            >
              Keluar
            </button>
          </div>
        </div>
      </header>

      {/* ── Info Bar Pura & Regulasi ──────────────────────────────── */}
      <div className="border-b border-zinc-100 bg-zinc-50/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between text-xs font-mono text-zinc-600 gap-2">
          <div className="flex items-center gap-3">
            <span>
              Admin: <strong className="text-zinc-900 font-medium">{user.name}</strong> ({user.email})
            </span>
            <span>&bull;</span>
            <span>
              Pura: <strong className="text-zinc-900 font-medium">{temple.name}</strong> ({temple.region})
            </span>
          </div>
          <div className="truncate max-w-md">
            Rujukan Aturan Busana: <span className="text-zinc-900 font-medium">{temple.rulesSource}</span>
          </div>
        </div>
      </div>

      {/* ── Konten Utama ───────────────────────────────────────────── */}
      <div className="max-w-6xl w-full mx-auto px-4 sm:px-8 py-8 flex-1 space-y-8">
        {/* Editorial Heading */}
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-widest text-zinc-500 font-mono">
            Pusat Pengaturan &amp; Audit Sistem
          </p>
          <h1 className="text-3xl sm:text-4xl font-light tracking-tight text-zinc-950 font-serif">
            Tata Kelola Busana Adat Pura.
          </h1>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-zinc-200">
          <button
            onClick={() => setActiveTab("rules")}
            className={`pb-3 text-xs font-mono uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === "rules"
                ? "border-zinc-950 text-zinc-950 font-semibold"
                : "border-transparent text-zinc-400 hover:text-zinc-700"
            }`}
          >
            1. Aturan Busana ({rulesList.length})
          </button>
          <button
            onClick={() => setActiveTab("cameras")}
            className={`pb-3 text-xs font-mono uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === "cameras"
                ? "border-zinc-950 text-zinc-950 font-semibold"
                : "border-transparent text-zinc-400 hover:text-zinc-700"
            }`}
          >
            2. Kamera &amp; Token API ({initialCameras.length})
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`pb-3 text-xs font-mono uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === "audit"
                ? "border-zinc-950 text-zinc-950 font-semibold"
                : "border-transparent text-zinc-400 hover:text-zinc-700"
            }`}
          >
            3. Log Audit Pemeriksaan ({initialEvents.length})
          </button>
        </div>

        {/* ── TAB 1: MANAJEMEN ATURAN BUSANA ───────────────────────── */}
        {activeTab === "rules" && (
          <div className="space-y-8 animate-in fade-in">
            {/* Tabel Aturan */}
            <div className="space-y-3">
              <h2 className="text-sm uppercase font-mono tracking-wider text-zinc-700">
                Aturan Busana yang Diberlakukan Saat Ini
              </h2>

              <div className="border border-zinc-200 overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 uppercase tracking-wider">
                    <tr>
                      <th className="p-3">Atribut Pakaian</th>
                      <th className="p-3">Kriteria Kewajiban</th>
                      <th className="p-3">Tingkat Penilaian</th>
                      <th className="p-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {rulesList.map((rule) => (
                      <tr key={rule.id} className="hover:bg-zinc-50/50">
                        <td className="p-3 font-semibold text-zinc-900">{rule.attribute}</td>
                        <td className="p-3 text-zinc-700">{rule.requiredValue}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 border ${
                              rule.severity === "violation"
                                ? "bg-red-50 text-red-800 border-red-200"
                                : "bg-amber-50 text-amber-800 border-amber-200"
                            }`}
                          >
                            {rule.severity}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleDeleteRule(rule.id)}
                            className="text-red-600 hover:text-red-900 font-mono text-xs underline"
                          >
                            Hapus
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Form Tambah Aturan */}
            <div className="border border-zinc-200 p-5 space-y-4 bg-zinc-50/20">
              <h3 className="text-xs uppercase font-mono tracking-wider text-zinc-700 font-semibold">
                + Tambah Aturan Busana Baru
              </h3>

              {formFeedback && (
                <div className="p-3 border border-zinc-300 bg-white text-xs font-mono text-zinc-900">
                  {formFeedback}
                </div>
              )}

              <form onSubmit={handleAddRule} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-zinc-500">
                    Atribut Target
                  </label>
                  <select
                    value={newAttribute}
                    onChange={(e) => setNewAttribute(e.target.value)}
                    className="w-full border border-zinc-300 bg-white p-2 text-xs font-mono text-zinc-900 focus:outline-none focus:border-zinc-950"
                  >
                    <option value="lower_garment">lower_garment (Kamen)</option>
                    <option value="sash">sash (Selendang / Senteng)</option>
                    <option value="upper_body">upper_body (Baju / Bahu)</option>
                    <option value="headwear">headwear (Destar / Udeng)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-zinc-500">
                    Nilai Wajib (Kriteria)
                  </label>
                  <input
                    type="text"
                    required
                    value={newRequiredValue}
                    onChange={(e) => setNewRequiredValue(e.target.value)}
                    placeholder="misal: covers_knees:true"
                    className="w-full border border-zinc-300 bg-white p-2 text-xs font-mono text-zinc-900 focus:outline-none focus:border-zinc-950"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-zinc-500">
                    Tingkat Severity
                  </label>
                  <select
                    value={newSeverity}
                    onChange={(e) => setNewSeverity(e.target.value as "violation" | "warning")}
                    className="w-full border border-zinc-300 bg-white p-2 text-xs font-mono text-zinc-900 focus:outline-none focus:border-zinc-950"
                  >
                    <option value="violation">violation (Wajib / Pelanggaran)</option>
                    <option value="warning">warning (Peringatan Halus)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingRule}
                  className="w-full border border-zinc-950 bg-zinc-950 p-2 text-xs font-mono uppercase text-white hover:bg-white hover:text-zinc-950 transition-colors disabled:opacity-50"
                >
                  {isSubmittingRule ? "Menyimpan..." : "Tambah Aturan →"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── TAB 2: KAMERA & TOKEN API ────────────────────────────── */}
        {activeTab === "cameras" && (
          <div className="space-y-6 animate-in fade-in">
            <div className="space-y-3">
              <h2 className="text-sm uppercase font-mono tracking-wider text-zinc-700">
                Kamera Pintu Masuk Terdaftar
              </h2>

              <div className="border border-zinc-200 overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 uppercase tracking-wider">
                    <tr>
                      <th className="p-3">Label Kamera</th>
                      <th className="p-3">ID Kamera</th>
                      <th className="p-3">Token Hash (SHA-256)</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {initialCameras.map((cam) => (
                      <tr key={cam.id} className="hover:bg-zinc-50/50">
                        <td className="p-3 font-semibold text-zinc-900">{cam.label}</td>
                        <td className="p-3 text-zinc-600">{cam.id}</td>
                        <td className="p-3 font-mono text-zinc-400">
                          {cam.apiTokenHash.slice(0, 16)}...
                        </td>
                        <td className="p-3">
                          <span className="bg-emerald-50 text-emerald-800 border border-emerald-300 px-2 py-0.5">
                            ● Terdaftar
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Kotak Penjelasan Mudah: Apa fungsi Kamera & Token API? */}
            <div className="border border-zinc-200 p-5 space-y-3 bg-zinc-50/40 text-xs font-mono text-zinc-700">
              <div className="font-semibold text-zinc-950 uppercase tracking-wider">
                💡 Cara Kerja Kamera Gerbang &amp; Token API (Otomatis):
              </div>
              <p className="leading-relaxed">
                1. <strong>Kenapa ada Token Kamera?</strong> Perangkat kamera/CCTV di gerbang pura berjalan 24 jam tanpa login akun email/password. Sebagai gantinya, kamera memakai &quot;PIN Mesin&quot; (<code>CAMERA_API_TOKEN</code>) agar orang luar tidak bisa mengirim data palsu ke server.
              </p>
              <p className="leading-relaxed">
                2. <strong>Apakah perlu diatur manual saat membuka halaman Kamera?</strong> <strong>Tidak perlu!</strong> Halaman <code>/camera</code> sudah otomatis mengirimkan token tersebut di balik layar setiap kali memindai pengunjung.
              </p>
              <pre className="p-3 bg-white border border-zinc-200 text-zinc-950 overflow-x-auto text-[11px]">
                Header Otomatis: x-camera-token: dev-camera-token-12345 (Terhubung ✓)
              </pre>
            </div>
          </div>
        )}

        {/* ── TAB 3: AUDIT LOG RIWAYAT DETEKSI ─────────────────────── */}
        {activeTab === "audit" && (
          <div className="space-y-4 animate-in fade-in">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm uppercase font-mono tracking-wider text-zinc-900 font-semibold">
                  Log Audit Pemeriksaan ({eventsList.length} / Maks. 100 Log)
                </h2>
                <p className="text-xs font-mono text-zinc-500 mt-0.5">
                  Privasi UU PDP: 0% penyimpanan foto di database &bull; Log di atas 100 otomatis dihapus agar database tetap ringan
                </p>
              </div>

              {eventsList.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllLogs}
                  disabled={isClearingLogs}
                  className="border border-rose-600 bg-white text-rose-700 hover:bg-rose-600 hover:text-white px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors disabled:opacity-50"
                >
                  {isClearingLogs ? "Menghapus..." : "🗑 Bersihkan Semua Log"}
                </button>
              )}
            </div>

            <div className="border border-zinc-200 overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 uppercase tracking-wider">
                  <tr>
                    <th className="p-3">Tanggal &amp; Waktu (WITA)</th>
                    <th className="p-3">Kamera &amp; ID</th>
                    <th className="p-3">Status Deteksi</th>
                    <th className="p-3">Alasan / Temuan</th>
                    <th className="p-3">Tindakan Pecalang</th>
                    <th className="p-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {eventsList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-zinc-400">
                        Belum ada riwayat deteksi yang tercatat di database.
                      </td>
                    </tr>
                  ) : (
                    eventsList.map((ev) => (
                      <tr key={ev.id} className="hover:bg-zinc-50/50">
                        <td className="p-3 text-zinc-600 whitespace-nowrap">
                          {formatDateTime(ev.ts)}
                        </td>
                        <td className="p-3 font-semibold text-zinc-900 whitespace-nowrap">
                          #{ev.trackId}{" "}
                          <span className="text-zinc-400 font-normal">
                            ({ev.cameraLabel || "Candi Bentar"})
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 border uppercase text-[11px] ${
                              ev.status === "violation"
                                ? "bg-red-50 text-red-800 border-red-200 font-semibold"
                                : ev.status === "uncertain"
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : "bg-emerald-50 text-emerald-800 border-emerald-200"
                            }`}
                          >
                            {ev.status}
                          </span>
                        </td>
                        <td className="p-3 text-zinc-700">
                          {ev.reasons.length > 0 ? ev.reasons.join(", ") : "Busana adat lengkap"}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {ev.officerAction ? (
                            <span className="text-zinc-900 font-semibold">
                              {ev.officerAction}{" "}
                              {ev.officerName ? `(${ev.officerName})` : ""}
                            </span>
                          ) : (
                            <span className="text-zinc-400 italic">Belum ditindak</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteSingleLog(ev.id)}
                            className="text-zinc-400 hover:text-rose-600 transition-colors"
                            title="Hapus baris log ini"
                          >
                            Hapus
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-200 bg-white py-6 mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-zinc-500 gap-2">
          <div>WastraJaga &copy; 2026 &bull; Panel Administrasi Pura</div>
          <div>Audit Log &bull; Kepatuhan UU PDP &amp; Awig-awig Desa Adat</div>
        </div>
      </footer>
    </main>
  );
}
