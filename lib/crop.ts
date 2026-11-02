import type { BoundingBox } from "@/lib/tracker";

export interface CropOptions {
  targetWidth?: number; // Target lebar crop (default: 256px)
  headRatio?: number; // Rasio tinggi bagian kepala yang di-blur (default: 0.2 atau 20% teratas)
  jpegQuality?: number; // Kualitas kompresi JPEG (default: 0.8)
}

/**
 * Mengambil crop tubuh dari elemen video atau canvas,
 * lalu mengaburkan (blur) area kepala untuk menjamin privasi (tanpa pengenalan wajah).
 * Menghasilkan string Base64 format image/jpeg.
 */
export function cropAndBlurHead(
  source: HTMLVideoElement | HTMLCanvasElement,
  box: BoundingBox,
  options: CropOptions = {}
): string | null {
  const targetWidth = options.targetWidth ?? 256;
  const headRatio = options.headRatio ?? 0.2;
  const jpegQuality = options.jpegQuality ?? 0.8;

  // Pastikan bounding box valid
  if (box.width <= 0 || box.height <= 0) {
    return null;
  }

  // Hitung aspek rasio agar proporsional
  const aspectRatio = box.height / box.width;
  const targetHeight = Math.round(targetWidth * aspectRatio);

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

  // 2. Terapkan blur Gaussian pada area kepala (20% tinggi bagian atas)
  const headHeight = Math.round(targetHeight * headRatio);
  if (headHeight > 0) {
    ctx.save();
    // Efek blur privasi kuat
    ctx.filter = "blur(8px)";
    // Gambar ulang area kepala dengan efek blur
    ctx.drawImage(
      canvas,
      0,
      0,
      targetWidth,
      headHeight,
      0,
      0,
      targetWidth,
      headHeight
    );
    ctx.restore();

    // Tambahan filter pixelate halus atau penutup semi-transparan untuk memastikan wajah tidak dapat direkonstruksi
    ctx.fillStyle = "rgba(113, 113, 122, 0.2)";
    ctx.fillRect(0, 0, targetWidth, headHeight);
  }

  // 3. Ekspor ke format data URL Base64 JPEG
  return canvas.toDataURL("image/jpeg", jpegQuality);
}
