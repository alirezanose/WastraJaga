/**
 * lib/rules.ts
 * Rule engine busana adat pura (MVP).
 *
 * Input : output LLM (atribut busana) + aturan dasar
 * Output: verdict { status, reasons, confidence }
 *
 * Logika:
 *   - "violation" : atribut confident (>= CONFIDENCE_THRESHOLD) DAN melanggar aturan
 *   - "uncertain" : full_body_visible=false ATAU ada atribut penting dengan confidence < threshold
 *   - "ok"        : semua atribut wajib terpenuhi dengan confidence cukup
 */

import type { LLMOutput } from "./llm/schema";

// Batas confidence minimum untuk membuat keputusan (violation atau ok).
// Di bawah ini → "uncertain".
export const CONFIDENCE_THRESHOLD = 0.6;

export type VerdictStatus = "ok" | "violation" | "uncertain";

export interface Verdict {
  status: VerdictStatus;
  /** Daftar alasan dalam bahasa netral (bukan penghakiman, hanya observasi) */
  reasons: string[];
  /** Rata-rata confidence dari atribut yang diperiksa */
  confidence: number;
}

/**
 * Menerapkan rule engine pada output LLM dan menghasilkan verdict.
 * Petugas/pecalang yang membuat keputusan akhir; AI hanya menandai.
 */
export function applyRules(attrs: LLMOutput): Verdict {
  const reasons: string[] = [];
  const confidences: number[] = [];
  let hasViolation = false;
  let hasUncertain = false;

  // ── 1. Cek apakah seluruh tubuh terlihat ──────────────────────────────────
  if (!attrs.full_body_visible) {
    hasUncertain = true;
    reasons.push("tubuh tidak terlihat penuh — tidak dapat menilai kain bawah");
  }

  // ── 2. Kain bawah (kamen/sarung): harus menutupi lutut ───────────────────
  const lg = attrs.lower_garment;
  confidences.push(lg.confidence);

  if (lg.confidence >= CONFIDENCE_THRESHOLD) {
    if (!lg.covers_knees) {
      hasViolation = true;
      reasons.push(`perlu dicek: kain bawah (${lg.type}) tidak menutupi lutut`);
    }
  } else {
    hasUncertain = true;
    reasons.push("kain bawah tidak dapat dipastikan (confidence rendah)");
  }

  // ── 3. Selendang/senteng di pinggang ─────────────────────────────────────
  const sash = attrs.sash;
  confidences.push(sash.confidence);

  if (sash.confidence >= CONFIDENCE_THRESHOLD) {
    if (!sash.present) {
      hasViolation = true;
      reasons.push("perlu dicek: selendang/senteng tidak terlihat diikat di pinggang");
    }
  } else {
    hasUncertain = true;
    reasons.push("selendang/senteng tidak dapat dipastikan (confidence rendah)");
  }

  // ── 4. Pakaian atas: bahu harus tertutup ─────────────────────────────────
  const ub = attrs.upper_body;
  confidences.push(ub.confidence);

  if (ub.confidence >= CONFIDENCE_THRESHOLD) {
    if (!ub.shoulders_covered) {
      hasViolation = true;
      reasons.push("perlu dicek: bahu terbuka");
    }
  } else {
    hasUncertain = true;
    reasons.push("pakaian atas tidak dapat dipastikan (confidence rendah)");
  }

  // ── Hitung rata-rata confidence ───────────────────────────────────────────
  const avgConfidence =
    confidences.length > 0
      ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100
      : 0;

  // ── Tentukan status ───────────────────────────────────────────────────────
  let status: VerdictStatus;
  if (hasViolation) {
    status = "violation";
  } else if (hasUncertain) {
    status = "uncertain";
  } else {
    status = "ok";
    reasons.push("busana sesuai aturan adat pura");
  }

  return { status, reasons, confidence: avgConfidence };
}
