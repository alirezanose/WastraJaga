/**
 * lib/llm/adapter.ts
 * Multi-provider Vision LLM adapter untuk analisis busana adat Bali.
 *
 * Provider dipilih lewat env var LLM_PROVIDER:
 *   mock      — deterministik, tidak butuh API key (wajib untuk demo/juri)
 *   gemini    — Google Gemini via @google/generative-ai
 *   openai    — OpenAI GPT-4o via fetch (tidak perlu SDK tambahan)
 *   anthropic — Anthropic Claude via fetch
 *
 * Semua error (timeout, JSON invalid, API gagal) di-fallback ke "uncertain".
 */

import { LLMOutputSchema, type LLMOutput } from "./schema";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompt";

// Timeout request LLM (ms)
const LLM_TIMEOUT_MS = 8000;

// ──────────────────────────────────────────────
// Mock Provider — deterministik untuk uji tanpa API key
// ──────────────────────────────────────────────
function mockAnalyze(imageBase64: string): LLMOutput {
  // Gunakan checksum sederhana dari 8 karakter pertama image untuk variasi
  const seed = imageBase64.slice(0, 8).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const isOk = seed % 3 !== 0; // ~67% ok, ~33% violation

  if (isOk) {
    return {
      full_body_visible: true,
      lower_garment: { type: "kamen", covers_knees: true, confidence: 0.92 },
      sash: { present: true, confidence: 0.88 },
      upper_body: { shoulders_covered: true, confidence: 0.95 },
    };
  } else {
    return {
      full_body_visible: true,
      lower_garment: { type: "celana pendek", covers_knees: false, confidence: 0.85 },
      sash: { present: false, confidence: 0.80 },
      upper_body: { shoulders_covered: false, confidence: 0.78 },
    };
  }
}

// ──────────────────────────────────────────────
// Helper: race timeout vs promise
// ──────────────────────────────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`LLM request timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// ──────────────────────────────────────────────
// Helper: parse JSON LLM output dengan validasi Zod
// ──────────────────────────────────────────────
function parseAndValidate(raw: string): LLMOutput {
  // Bersihkan markdown code fence jika ada
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  const parsed = JSON.parse(cleaned);
  return LLMOutputSchema.parse(parsed);
}

// Helper: bersihkan prefix base64 jika ada
function cleanBase64(input: string): string {
  return input.replace(/^data:image\/[a-z]+;base64,/, "").trim();
}

// ──────────────────────────────────────────────
// Gemini Provider
// ──────────────────────────────────────────────
async function geminiAnalyze(imageBase64: string): Promise<LLMOutput> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY tidak di-set");

  const sanitizedBase64 = cleanBase64(imageBase64);

  // Lazy import agar tidak error saat pakai mock/openai/anthropic
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: SYSTEM_PROMPT,
  });

  const result = await model.generateContent([
    buildUserMessage(),
    {
      inlineData: {
        mimeType: "image/jpeg",
        data: sanitizedBase64,
      },
    },
  ]);

  const text = result.response.text();
  return parseAndValidate(text);
}

// ──────────────────────────────────────────────
// OpenAI Provider (GPT-4o vision via fetch)
// ──────────────────────────────────────────────
async function openaiAnalyze(imageBase64: string): Promise<LLMOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY tidak di-set");

  const sanitizedBase64 = cleanBase64(imageBase64);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 512,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: buildUserMessage() },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${sanitizedBase64}`, detail: "low" },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  const text = data.choices[0]?.message?.content ?? "";
  return parseAndValidate(text);
}

// ──────────────────────────────────────────────
// Anthropic Provider (Claude via fetch)
// ──────────────────────────────────────────────
async function anthropicAnalyze(imageBase64: string): Promise<LLMOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY tidak di-set");

  const sanitizedBase64 = cleanBase64(imageBase64);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: sanitizedBase64 },
            },
            { type: "text", text: buildUserMessage() },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { content: Array<{ type: string; text: string }> };
  const text = data.content.find((c) => c.type === "text")?.text ?? "";
  return parseAndValidate(text);
}

// ──────────────────────────────────────────────
// Fallback: output "uncertain" saat semua error
// ──────────────────────────────────────────────
function uncertainFallback(): LLMOutput {
  return {
    full_body_visible: false,
    lower_garment: { type: "unknown", covers_knees: false, confidence: 0 },
    sash: { present: false, confidence: 0 },
    upper_body: { shoulders_covered: false, confidence: 0 },
  };
}

// ──────────────────────────────────────────────
// Fungsi utama yang dipanggil dari /api/scan
// ──────────────────────────────────────────────
export async function analyzeBusana(imageBase64: string): Promise<LLMOutput> {
  const provider = (process.env.LLM_PROVIDER ?? "mock").toLowerCase();

  try {
    switch (provider) {
      case "gemini":
        return await withTimeout(geminiAnalyze(imageBase64), LLM_TIMEOUT_MS);
      case "openai":
        return await withTimeout(openaiAnalyze(imageBase64), LLM_TIMEOUT_MS);
      case "anthropic":
        return await withTimeout(anthropicAnalyze(imageBase64), LLM_TIMEOUT_MS);
      case "mock":
      default:
        // Mock tidak perlu timeout — sinkron
        return mockAnalyze(imageBase64);
    }
  } catch (err) {
    console.error(`[LLM adapter] Provider "${provider}" gagal:`, err instanceof Error ? err.message : err);
    // Fallback ke uncertain agar /api/scan tetap merespons
    return uncertainFallback();
  }
}
