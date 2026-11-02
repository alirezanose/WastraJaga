/**
 * tests/rules.test.ts
 * Unit test untuk rule engine busana adat pura.
 */

import { describe, it, expect } from "vitest";
import { applyRules, CONFIDENCE_THRESHOLD } from "../lib/rules";
import type { LLMOutput } from "../lib/llm/schema";

// Helper: busana sempurna (semua ok, confidence tinggi)
const perfectAttire: LLMOutput = {
  full_body_visible: true,
  lower_garment: { type: "kamen", covers_knees: true, confidence: 0.95 },
  sash: { present: true, confidence: 0.90 },
  upper_body: { shoulders_covered: true, confidence: 0.92 },
};

describe("applyRules — Rule Engine Busana Adat", () => {
  it("harus mengembalikan 'ok' saat semua atribut terpenuhi dengan confidence tinggi", () => {
    const result = applyRules(perfectAttire);
    expect(result.status).toBe("ok");
    expect(result.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });

  it("harus mengembalikan 'violation' saat kain bawah tidak menutupi lutut (confident)", () => {
    const attrs: LLMOutput = {
      ...perfectAttire,
      lower_garment: { type: "celana pendek", covers_knees: false, confidence: 0.85 },
    };
    const result = applyRules(attrs);
    expect(result.status).toBe("violation");
    expect(result.reasons.some((r) => r.includes("kain bawah"))).toBe(true);
  });

  it("harus mengembalikan 'violation' saat selendang tidak ada (confident)", () => {
    const attrs: LLMOutput = {
      ...perfectAttire,
      sash: { present: false, confidence: 0.80 },
    };
    const result = applyRules(attrs);
    expect(result.status).toBe("violation");
    expect(result.reasons.some((r) => r.includes("selendang"))).toBe(true);
  });

  it("harus mengembalikan 'violation' saat bahu terbuka (confident)", () => {
    const attrs: LLMOutput = {
      ...perfectAttire,
      upper_body: { shoulders_covered: false, confidence: 0.78 },
    };
    const result = applyRules(attrs);
    expect(result.status).toBe("violation");
    expect(result.reasons.some((r) => r.includes("bahu"))).toBe(true);
  });

  it("harus mengembalikan 'uncertain' saat full_body_visible = false", () => {
    const attrs: LLMOutput = {
      ...perfectAttire,
      full_body_visible: false,
      lower_garment: { ...perfectAttire.lower_garment, confidence: 0.3 },
    };
    const result = applyRules(attrs);
    expect(result.status).toBe("uncertain");
    expect(result.reasons.some((r) => r.includes("tidak terlihat penuh"))).toBe(true);
  });

  it("harus mengembalikan 'uncertain' saat confidence di bawah threshold", () => {
    const attrs: LLMOutput = {
      full_body_visible: true,
      lower_garment: { type: "unknown", covers_knees: false, confidence: 0.3 },
      sash: { present: false, confidence: 0.4 },
      upper_body: { shoulders_covered: false, confidence: 0.5 },
    };
    const result = applyRules(attrs);
    // Semua confidence < 0.6 → tidak ada violation yang pasti → uncertain
    expect(result.status).toBe("uncertain");
  });

  it("violation + uncertain: jika ada atribut melanggar DAN atribut lain uncertain → violation", () => {
    const attrs: LLMOutput = {
      full_body_visible: true,
      lower_garment: { type: "celana pendek", covers_knees: false, confidence: 0.85 },
      sash: { present: false, confidence: 0.2 }, // uncertain
      upper_body: { shoulders_covered: true, confidence: 0.90 },
    };
    const result = applyRules(attrs);
    // Tetap violation karena ada satu pelanggaran pasti
    expect(result.status).toBe("violation");
  });

  it("reasons harus berisi teks netral tanpa kata 'pelanggar' atau 'orang'", () => {
    const attrs: LLMOutput = {
      ...perfectAttire,
      sash: { present: false, confidence: 0.82 },
    };
    const result = applyRules(attrs);
    for (const reason of result.reasons) {
      expect(reason.toLowerCase()).not.toContain("pelanggar");
      expect(reason.toLowerCase()).not.toContain("orang ini");
    }
  });
});
