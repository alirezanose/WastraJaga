import type { BoundingBox } from "@/lib/tracker";

export interface CropOptions {
  targetWidth?: number; // Target lebar crop (default: 256px)
  headRatio?: number; // Rasio tinggi bagian kepala fallback yang di-blur (default: 0.30)
  jpegQuality?: number; // Kualitas kompresi JPEG (default: 0.8)
  includeDataUrlPrefix?: boolean; // Default false (Base64 murni untuk LLM)
}

/**
 * Mem-blur / mem-pixelate area tertentu pada canvas menggunakan piksel asli dari source (video/canvas).
 * Bekerja 100% di semua browser tanpa bergantung pada akselerasi hardware ctx.filter.
 */
export function pixelateRegionOnCanvas(
  ctx: CanvasRenderingContext2D,
  source: HTMLVideoElement | HTMLCanvasElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  blockSize = 12
): void {
  if (sw <= 1 || sh <= 1 || dw <= 1 || dh <= 1) return;

  const smallW = Math.max(2, Math.floor(dw / blockSize));
  const smallH = Math.max(2, Math.floor(dh / blockSize));

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = smallW;
  tempCanvas.height = smallH;
  const tempCtx = tempCanvas.getContext("2d");
  if (!tempCtx) return;

  // 1. Perkecil potongan wajah dari video ke ukuran sangat kecil
  tempCtx.imageSmoothingEnabled = false;
  tempCtx.drawImage(source, sx, sy, sw, sh, 0, 0, smallW, smallH);

  // 2. Gambar kembali ke canvas utama dalam ukuran penuh dengan efek mozaik/pixelate tebal
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tempCanvas, 0, 0, smallW, smallH, dx, dy, dw, dh);
  ctx.imageSmoothingEnabled = true;

  // 3. Lapisan tipis untuk memastikan fitur biometrik wajah tertutup rapat
  ctx.fillStyle = "rgba(24, 24, 27, 0.22)";
  ctx.fillRect(dx, dy, dw, dh);
  ctx.restore();
}

/**
 * Mengambil crop tubuh dari elemen video atau canvas,
 * lalu mengaburkan (blur/pixelate) area kepala & wajah untuk menjamin privasi (tanpa pengenalan wajah).
 * Menghasilkan string Base64 murni tanpa prefix (atau dengan prefix jika includeDataUrlPrefix: true).
 */
export function cropAndBlurHead(
  source: HTMLVideoElement | HTMLCanvasElement,
  box: BoundingBox,
  options: CropOptions = {},
  faceBoxes: BoundingBox[] = []
): string | null {
  const targetWidth = options.targetWidth ?? 256;
  const headRatio = options.headRatio ?? 0.3;
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

  const scaleX = targetWidth / box.width;
  const scaleY = targetHeight / box.height;
  const pixelBlock = Math.max(8, Math.floor(targetWidth / 14));

  // 2. Jika ada deteksi wajah presisi dari MediaPipe FaceDetector, blur semua wajah yang beririsan
  let anyFaceBlurred = false;
  for (const face of faceBoxes) {
    // Perluas kotak wajah sebesar 25% agar seluruh kepala ikut ter-blur
    const padX = face.width * 0.25;
    const padY = face.height * 0.25;
    const fx = Math.max(box.originX, face.originX - padX);
    const fy = Math.max(box.originY, face.originY - padY);
    const fw = Math.min(box.originX + box.width - fx, face.width + padX * 2);
    const fh = Math.min(box.originY + box.height - fy, face.height + padY * 2);

    if (fw > 4 && fh > 4) {
      const dx = Math.round((fx - box.originX) * scaleX);
      const dy = Math.round((fy - box.originY) * scaleY);
      const dw = Math.round(fw * scaleX);
      const dh = Math.round(fh * scaleY);

      pixelateRegionOnCanvas(ctx, canvas, dx, dy, dw, dh, dx, dy, dw, dh, pixelBlock);
      anyFaceBlurred = true;
    }
  }

  // 3. Fallback / pelengkap: tetap blur bagian atas kepala jika FaceDetector belum menangkap wajah (mis. menoleh/menunduk)
  if (!anyFaceBlurred) {
    const headHeight = Math.round(targetHeight * headRatio);
    if (headHeight > 0) {
      pixelateRegionOnCanvas(
        ctx,
        canvas,
        0,
        0,
        targetWidth,
        headHeight,
        0,
        0,
        targetWidth,
        headHeight,
        pixelBlock
      );
    }
  }

  // 4. Ekspor ke format Base64 JPEG
  const dataUrl = canvas.toDataURL("image/jpeg", jpegQuality);
  if (includeDataUrlPrefix) {
    return dataUrl;
  }

  // Bersihkan prefix data:image/jpeg;base64, untuk LLM
  return dataUrl.replace(/^data:image\/[a-z]+;base64,/, "");
}
