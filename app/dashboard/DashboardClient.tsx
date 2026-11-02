"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import type { DashboardEvent } from "@/lib/events";

interface DashboardClientProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: "officer" | "admin";
    templeId?: string | null;
  };
}

const ACTION_LABELS: Record<string, { label: string; badgeClass: string }> = {
  allowed: {
    label: "Diizinkan Masuk",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-300",
  },
  sarong_provided: {
    label: "Diberi Kain/Kamen",
    badgeClass: "bg-blue-50 text-blue-800 border-blue-300",
  },
  warned: {
    label: "Diberi Teguran",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-300",
  },
  dismissed: {
    label: "Diabaikan (False Positive)",
    badgeClass: "bg-zinc-100 text-zinc-700 border-zinc-300",
  },
};

export default function DashboardClient({ user }: DashboardClientProps) {
  const [eventsList, setEventsList] = useState<DashboardEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [filter, setFilter] = useState<"all" | "needs_action" | "resolved" | "ok">("all");
  const [loadingActions, setLoadingActions] = useState<Record<string, boolean>>({});
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const noticeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sambungkan ke Server-Sent Events (SSE)
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let isSubscribed = true;

    function connectSSE() {
      eventSource = new EventSource("/api/events");

      eventSource.onopen = () => {
        if (isSubscribed) setIsConnected(true);
      };

      eventSource.onerror = () => {
        if (isSubscribed) setIsConnected(false);
      };

      // Handler snapshot riwayat event awal
      eventSource.addEventListener("initial", (e: MessageEvent) => {
        try {
          const data: DashboardEvent[] = JSON.parse(e.data);
          if (isSubscribed) setEventsList(data);
        } catch (err) {
          console.error("Gagal parse initial events:", err);
        }
      });

      // Handler deteksi kamera baru masuk
      eventSource.addEventListener("detection", (e: MessageEvent) => {
        try {
          const newEvent: DashboardEvent = JSON.parse(e.data);
          if (isSubscribed) {
            setEventsList((prev) => {
              // Hindari duplikasi jika event sudah ada
              if (prev.some((item) => item.id === newEvent.id)) return prev;
              return [newEvent, ...prev.slice(0, 49)];
            });
          }
        } catch (err) {
          console.error("Gagal parse detection event:", err);
        }
      });

      // Handler pembaruan tindakan pecalang
      eventSource.addEventListener("action", (e: MessageEvent) => {
        try {
          const update = JSON.parse(e.data);
          if (isSubscribed) {
            setEventsList((prev) =>
              prev.map((item) =>
                item.id === update.eventId
                  ? {
                      ...item,
                      officerAction: update.officerAction,
                      officerName: update.officerName,
                    }
                  : item
              )
            );
          }
        } catch (err) {
          console.error("Gagal parse action event:", err);
        }
      });
    }

    connectSSE();

    return () => {
      isSubscribed = false;
      if (eventSource) eventSource.close();
    };
  }, []);

  // Handler kirim keputusan pecalang
  const handleOfficerDecision = async (
    eventId: string,
    action: "allowed" | "warned" | "sarong_provided" | "dismissed"
  ) => {
    setLoadingActions((prev) => ({ ...prev, [eventId]: true }));

    try {
      const res = await fetch(`/api/events/${eventId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        throw new Error("Gagal mengirim tindakan");
      }

      // Tampilkan feedback notifikasi halus
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      setActionNotice(
        `Keputusan dicatat: ${ACTION_LABELS[action]?.label ?? action} untuk #${eventId.slice(0, 6)}`
      );
      noticeTimerRef.current = setTimeout(() => setActionNotice(null), 3000);
    } catch {
      alert("Gagal menyimpan tindakan petugas. Pastikan koneksi server aktif.");
    } finally {
      setLoadingActions((prev) => ({ ...prev, [eventId]: false }));
    }
  };

  // Statistik Real-time
  const stats = useMemo(() => {
    const total = eventsList.length;
    const ok = eventsList.filter((e) => e.status === "ok").length;
    const violation = eventsList.filter((e) => e.status === "violation").length;
    const uncertain = eventsList.filter((e) => e.status === "uncertain").length;
    const handled = eventsList.filter((e) => !!e.officerAction).length;
    return { total, ok, violation, uncertain, handled };
  }, [eventsList]);

  // Filter daftar event
  const filteredEvents = useMemo(() => {
    if (filter === "needs_action") {
      return eventsList.filter(
        (e) => (e.status === "violation" || e.status === "uncertain") && !e.officerAction
      );
    }
    if (filter === "resolved") {
      return eventsList.filter((e) => !!e.officerAction);
    }
    if (filter === "ok") {
      return eventsList.filter((e) => e.status === "ok");
    }
    return eventsList;
  }, [eventsList, filter]);

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
              Pusat Kendali Pecalang
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Status SSE */}
            <div className="inline-flex items-center gap-1.5 border border-zinc-200 px-2.5 py-1 text-xs font-mono text-zinc-700 bg-zinc-50/50">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-400"
                }`}
              />
              <span className="hidden sm:inline">
                {isConnected ? "Live SSE Aktif" : "Menghubungkan..."}
              </span>
            </div>

            {/* Tombol Kamera */}
            <Link
              href="/camera"
              className="border border-zinc-300 px-3 py-1 text-xs font-mono uppercase tracking-wider text-zinc-800 hover:border-zinc-900 transition-colors"
            >
              Kamera &rarr;
            </Link>

            {/* Logout */}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="border border-zinc-200 px-2.5 py-1 text-xs font-mono uppercase text-zinc-500 hover:text-zinc-900 hover:border-zinc-900 transition-colors"
              title="Keluar dari sesi"
            >
              Keluar
            </button>
          </div>
        </div>
      </header>

      {/* ── Sub-header: Identitas Petugas & Lokasi Pura ─────────────── */}
      <div className="border-b border-zinc-100 bg-zinc-50/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-2.5 flex flex-wrap items-center justify-between text-xs font-mono text-zinc-600 gap-2">
          <div className="flex items-center gap-3">
            <span>
              Petugas: <strong className="text-zinc-900 font-medium">{user.name}</strong>
            </span>
            <span>&bull;</span>
            <span className="uppercase tracking-wider px-1.5 py-0.5 border border-zinc-200 bg-white text-[10px]">
              {user.role}
            </span>
          </div>
          <div>
            Lokasi: <span className="text-zinc-900 font-medium">Pura Agung Besakih (Pintu Utama)</span>
          </div>
        </div>
      </div>

      {/* ── Konten Utama ───────────────────────────────────────────── */}
      <div className="max-w-6xl w-full mx-auto px-4 sm:px-8 py-8 flex-1 space-y-8">
        {/* Notifikasi feedback aksi pecalang */}
        {actionNotice && (
          <div className="border border-zinc-900 bg-zinc-950 p-3 text-xs font-mono text-white flex items-center justify-between animate-in fade-in">
            <span>✓ {actionNotice}</span>
            <button
              onClick={() => setActionNotice(null)}
              className="text-zinc-400 hover:text-white font-mono text-xs"
            >
              Tutup ✕
            </button>
          </div>
        )}

        {/* ── Ringkasan Statistik ─────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="border border-zinc-200 p-4 space-y-1 bg-white">
            <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
              Total Deteksi
            </div>
            <div className="text-2xl font-light font-mono text-zinc-900">{stats.total}</div>
          </div>

          <div className="border border-emerald-200 bg-emerald-50/20 p-4 space-y-1">
            <div className="text-[10px] uppercase font-mono tracking-wider text-emerald-800">
              Sesuai (✓)
            </div>
            <div className="text-2xl font-light font-mono text-emerald-700">{stats.ok}</div>
          </div>

          <div className="border border-red-200 bg-red-50/20 p-4 space-y-1">
            <div className="text-[10px] uppercase font-mono tracking-wider text-red-800">
              Perlu Dicek (✗)
            </div>
            <div className="text-2xl font-light font-mono text-red-700">{stats.violation}</div>
          </div>

          <div className="border border-amber-200 bg-amber-50/20 p-4 space-y-1">
            <div className="text-[10px] uppercase font-mono tracking-wider text-amber-800">
              Ragu-ragu (?)
            </div>
            <div className="text-2xl font-light font-mono text-amber-700">{stats.uncertain}</div>
          </div>

          <div className="col-span-2 sm:col-span-1 border border-zinc-200 p-4 space-y-1 bg-white">
            <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
              Selesai Ditindak
            </div>
            <div className="text-2xl font-light font-mono text-zinc-900">{stats.handled}</div>
          </div>
        </div>

        {/* ── Filter Bar & Keterangan Prinsip AI ────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 pb-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors ${
                filter === "all"
                  ? "bg-zinc-950 text-white"
                  : "bg-white text-zinc-600 border border-zinc-200 hover:border-zinc-900"
              }`}
            >
              Semua ({stats.total})
            </button>
            <button
              onClick={() => setFilter("needs_action")}
              className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors ${
                filter === "needs_action"
                  ? "bg-red-600 text-white"
                  : "bg-white text-zinc-600 border border-zinc-200 hover:border-zinc-900"
              }`}
            >
              Perlu Tindakan ({stats.violation + stats.uncertain - stats.handled > 0 ? stats.violation + stats.uncertain - stats.handled : 0})
            </button>
            <button
              onClick={() => setFilter("resolved")}
              className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors ${
                filter === "resolved"
                  ? "bg-zinc-950 text-white"
                  : "bg-white text-zinc-600 border border-zinc-200 hover:border-zinc-900"
              }`}
            >
              Sudah Ditangani ({stats.handled})
            </button>
            <button
              onClick={() => setFilter("ok")}
              className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors ${
                filter === "ok"
                  ? "bg-emerald-600 text-white"
                  : "bg-white text-zinc-600 border border-zinc-200 hover:border-zinc-900"
              }`}
            >
              Sesuai ({stats.ok})
            </button>
          </div>

          <div className="text-xs font-mono text-zinc-500">
            Prinsip: <span className="text-zinc-900 font-medium">AI hanya menandai, pecalang memutuskan.</span>
          </div>
        </div>

        {/* ── Daftar Event Deteksi Real-Time ────────────────────────── */}
        <div className="space-y-3">
          {filteredEvents.length === 0 ? (
            <div className="border border-zinc-200 bg-zinc-50/30 p-12 text-center space-y-2">
              <div className="text-xs uppercase font-mono tracking-widest text-zinc-400">
                Belum Ada Deteksi
              </div>
              <p className="text-sm text-zinc-500 font-light">
                {filter === "needs_action"
                  ? "Tidak ada antrean pelanggaran yang memerlukan tindakan saat ini."
                  : "Menunggu deteksi dari kamera pintu masuk..."}
              </p>
            </div>
          ) : (
            filteredEvents.map((item) => {
              const isViolating = item.status === "violation";
              const isUncertain = item.status === "uncertain";
              const isOk = item.status === "ok";
              const isActionLoading = !!loadingActions[item.id];

              return (
                <div
                  key={item.id}
                  className={`border transition-all bg-white p-4 sm:p-5 space-y-4 ${
                    isViolating
                      ? "border-red-300 hover:border-red-600"
                      : isUncertain
                      ? "border-amber-300 hover:border-amber-600"
                      : isOk
                      ? "border-emerald-200"
                      : "border-zinc-200"
                  }`}
                >
                  {/* Baris Atas: Badge Status, ID, Waktu */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      {/* Status Badge */}
                      <span
                        className={`inline-flex items-center justify-center font-mono text-xs px-2.5 py-0.5 border ${
                          isViolating
                            ? "bg-red-600 text-white border-red-600"
                            : isUncertain
                            ? "bg-amber-500 text-white border-amber-500"
                            : isOk
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-zinc-200 text-zinc-800 border-zinc-300"
                        }`}
                      >
                        {isViolating
                          ? "✗ PERLU DICEK"
                          : isUncertain
                          ? "? RAGU-RAGU"
                          : isOk
                          ? "✓ SESUAI"
                          : "○ PENDING"}
                      </span>

                      {/* Track ID */}
                      <span className="font-mono text-xs font-semibold text-zinc-900">
                        #{item.trackId}
                      </span>

                      {/* Camera Label */}
                      <span className="text-xs font-mono text-zinc-500 hidden sm:inline">
                        &bull; {item.cameraLabel || "Kamera Pintu"}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs font-mono text-zinc-500">
                      <span>Keyakinan: {(item.confidence * 100).toFixed(0)}%</span>
                      <span>&bull;</span>
                      <span>
                        {new Date(item.ts).toLocaleTimeString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Baris Tengah: Temuan / Alasan Netral */}
                  <div className="space-y-1">
                    {item.reasons && item.reasons.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {item.reasons.map((reason, idx) => (
                          <span
                            key={idx}
                            className={`text-xs font-mono px-2 py-0.5 border ${
                              isViolating
                                ? "bg-red-50 text-red-900 border-red-200"
                                : isUncertain
                                ? "bg-amber-50 text-amber-900 border-amber-200"
                                : "bg-zinc-50 text-zinc-800 border-zinc-200"
                            }`}
                          >
                            {reason}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs font-mono text-emerald-800">
                        ✓ Busana adat lengkap (kamen menutupi lutut, selendang/senteng terikat, bahu tertutup).
                      </p>
                    )}
                  </div>

                  {/* Baris Bawah: Status Tindakan / Tombol Aksi Petugas */}
                  <div className="pt-2 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-3">
                    {item.officerAction ? (
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-mono px-2 py-0.5 border ${
                            ACTION_LABELS[item.officerAction]?.badgeClass || "border-zinc-300"
                          }`}
                        >
                          Tindakan: {ACTION_LABELS[item.officerAction]?.label || item.officerAction}
                        </span>
                        {item.officerName && (
                          <span className="text-xs font-mono text-zinc-500">
                            oleh {item.officerName}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs font-mono text-zinc-500 italic">
                        Menunggu keputusan petugas...
                      </div>
                    )}

                    {/* Tombol Keputusan Pecalang (Tersedia jika belum ditindak atau ingin diubah) */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => handleOfficerDecision(item.id, "allowed")}
                        disabled={isActionLoading || item.officerAction === "allowed"}
                        className="px-2.5 py-1 text-xs font-mono border border-emerald-600 text-emerald-700 bg-white hover:bg-emerald-600 hover:text-white transition-colors disabled:opacity-40"
                        title="Izinkan masuk ke area pura"
                      >
                        Izinkan ✓
                      </button>

                      <button
                        onClick={() => handleOfficerDecision(item.id, "sarong_provided")}
                        disabled={isActionLoading || item.officerAction === "sarong_provided"}
                        className="px-2.5 py-1 text-xs font-mono border border-blue-600 text-blue-700 bg-white hover:bg-blue-600 hover:text-white transition-colors disabled:opacity-40"
                        title="Beri pinjaman sarung atau selendang di posko"
                      >
                        Beri Kain/Selendang 🥋
                      </button>

                      <button
                        onClick={() => handleOfficerDecision(item.id, "warned")}
                        disabled={isActionLoading || item.officerAction === "warned"}
                        className="px-2.5 py-1 text-xs font-mono border border-amber-600 text-amber-700 bg-white hover:bg-amber-600 hover:text-white transition-colors disabled:opacity-40"
                        title="Beri peringatan sopan terkait etika busana"
                      >
                        Tegur ⚠️
                      </button>

                      <button
                        onClick={() => handleOfficerDecision(item.id, "dismissed")}
                        disabled={isActionLoading || item.officerAction === "dismissed"}
                        className="px-2.5 py-1 text-xs font-mono border border-zinc-300 text-zinc-600 bg-white hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-40"
                        title="Abaikan alert (kesalahan deteksi AI)"
                      >
                        Abaikan ✕
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Minimalist Footer ─────────────────────────────────────── */}
      <footer className="border-t border-zinc-200 bg-white py-6 mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-zinc-500 gap-2">
          <div>WastraJaga &copy; 2026 &bull; Kori Agung AI</div>
          <div>Server-Sent Events &bull; Privasi Terjamin (Zero Image Storage)</div>
        </div>
      </footer>
    </main>
  );
}
