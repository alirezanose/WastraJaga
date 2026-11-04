import type { BoundingBox } from "@/lib/tracker";

export interface CropOptions {
  targetWidth?: number; // Target lebar crop (default: 256px)
  headRatio?: number; // Rasio tinggi bagian kepala yang di-blur (default: 0.28 atau 28% teratas)
  jpegQuality?: number; // Kualitas kompresi JPEG (default: 0.8)
  includeDataUrlPrefix?: boolean; // Default false (Base64 murni untuk LLM)
}

/**
 * Mengambil crop tubuh dari elemen video atau canvas,
 * lalu mengaburkan (blur/pixelate) area kepala untuk menjamin privasi (tanpa pengenalan wajah).
 * Menghasilkan string Base64 murni tanpa prefix (atau dengan prefix jika includeDataUrlPrefix: true).
 */
export function cropAndBlurHead(
  source: HTMLVideoElement | HTMLCanvasElement,
  box: BoundingBox,
  options: CropOptions = {}
): string | null {
  const targetWidth = options.targetWidth ?? 256;
  const headRatio = options.headRatio ?? 0.28;
  const jpegQuality = options.jpegQuality ?? 0.8;
  const includeDataUrlPrefix = options.includeDataUrlPrefix ?? false;

  // Pastikan bounding box valid
  if (box.width <= 0 || box.height <= 0) {
    return null;
  }

  // Hitung aspek rasio agar proporsional
  const aspectRatio = box.height / box.width;
  const targetHeight = Math.max(32, Math.round(targetWidth * aspectRatio));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  // 1. Gambar seluruh badan ke canvas hasil resize
  ctx.drawImage(
    source,
    box.originX,
    box.originY,
    box.width,
    box.height,
    0,
    0,
    targetWidth,
    targetHeight
  );

  // 2. Terapkan blur privasi kuat pada area kepala (28% tinggi bagian atas)
  const headHeight = Math.round(targetHeight * headRatio);
  if (headHeight > 0) {
    // Buat canvas kecil sementara untuk efek pixelation kuat (wajah tidak bisa direkonstruksi)
    const pixelSize = Math.max(6, Math.floor(targetWidth / 16));
    const smallW = Math.max(2, Math.floor(targetWidth / pixelSize));
    const smallH = Math.max(2, Math.floor(headHeight / pixelSize));

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = smallW;
    tempCanvas.height = smallH;
    const tempCtx = tempCanvas.getContext("2d");

    if (tempCtx) {
      tempCtx.imageSmoothingEnabled = false;
      // Step A: perkecil area kepala ke resolusi sangat rendah
      tempCtx.drawImage(canvas, 0, 0, targetWidth, headHeight, 0, 0, smallW, smallH);

      // Step B: perbesar kembali dengan pixelation
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tempCanvas, 0, 0, smallW, smallH, 0, 0, targetWidth, headHeight);
      ctx.imageSmoothingEnabled = true;
    }

    // Step C: Lapisan penutup semi-transparan netral untuk menyamarkan kontur wajah sepenuhnya
    ctx.fillStyle = "rgba(63, 63, 70, 0.45)";
    ctx.fillRect(0, 0, targetWidth, headHeight);
  }

  // 3. Ekspor ke format Base64 JPEG
  const dataUrl = canvas.toDataURL("image/jpeg", jpegQuality);
  if (includeDataUrlPrefix) {
    return dataUrl;
  }

  // Bersihkan prefix data:image/jpeg;base64, untuk LLM
  return dataUrl.replace(/^data:image\/[a-z]+;base64,/, "");
}
