/**
 * lib/llm/schema.ts
 * Zod schema untuk output Vision LLM.
 * LLM diminta ATRIBUT busana (bukan vonis/keputusan) — rule engine yang memutuskan.
 */

import { z } from "zod";

/**
 * Confidence score: 0.0 (tidak yakin) sampai 1.0 (sangat yakin).
 * Rule engine: violation jika confidence >= 0.6 && atribut melanggar.
 *              uncertain jika confidence < 0.6 atau full_body_visible = false.
 */
const confidenceSchema = z.number().min(0).max(1);

export const LLMOutputSchema = z.object({
  /** Apakah seluruh tubuh (kepala hingga kaki) terlihat dalam frame */
  full_body_visible: z.boolean(),

  /** Kain bawah (kamen, sarung, rok adat) */
  lower_garment: z.object({
    /** Jenis kain bawah yang terdeteksi, mis. "kamen", "sarung", "celana" */
    type: z.string(),
    /** Apakah menutupi lutut */
    covers_knees: z.boolean(),
    confidence: confidenceSchema,
  }),

  /** Selendang/senteng yang diikat di pinggang */
  sash: z.object({
    /** Apakah selendang/senteng terlihat diikat di pinggang */
    present: z.boolean(),
    confidence: confidenceSchema,
  }),

  /** Pakaian atas (kebaya, kemeja safari, baju adat) */
  upper_body: z.object({
    /** Apakah bahu tertutup (tidak singlet, tanpa tali, dll.) */
    shoulders_covered: z.boolean(),
    confidence: confidenceSchema,
  }),
});

export type LLMOutput = z.infer<typeof LLMOutputSchema>;
