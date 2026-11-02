export interface BoundingBox {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export interface TrackedPerson {
  id: number;
  box: BoundingBox;
  missedFrames: number;
  isActive: boolean; // Menandakan apakah terdeteksi pada frame terkini
}

export interface TrackerOptions {
  iouThreshold?: number; // Ambang batas minimum IoU untuk dianggap orang yang sama (default: 0.3)
  maxMissedFrames?: number; // Jumlah frame tanpa deteksi sebelum ID dihapus (default: 30)
  maxCentroidDistance?: number; // Jarak Euclidean maksimum untuk fallback centroid (default: 150)
}

/**
 * Menghitung Intersection over Union (IoU) antara dua bounding box.
 */
export function calculateIoU(boxA: BoundingBox, boxB: BoundingBox): number {
  const x1 = Math.max(boxA.originX, boxB.originX);
  const y1 = Math.max(boxA.originY, boxB.originY);
  const x2 = Math.min(boxA.originX + boxA.width, boxB.originX + boxB.width);
  const y2 = Math.min(boxA.originY + boxA.height, boxB.originY + boxB.height);

  const intersectionWidth = Math.max(0, x2 - x1);
  const intersectionHeight = Math.max(0, y2 - y1);
  const intersectionArea = intersectionWidth * intersectionHeight;

  const areaA = boxA.width * boxA.height;
  const areaB = boxB.width * boxB.height;
  const unionArea = areaA + areaB - intersectionArea;

  if (unionArea <= 0) return 0;
  return intersectionArea / unionArea;
}

/**
 * Menghitung jarak Euclidean antar titik tengah (centroid) dua bounding box.
 */
export function calculateCentroidDistance(
  boxA: BoundingBox,
  boxB: BoundingBox
): number {
  const cAx = boxA.originX + boxA.width / 2;
  const cAy = boxA.originY + boxA.height / 2;
  const cBx = boxB.originX + boxB.width / 2;
  const cBy = boxB.originY + boxB.height / 2;

  return Math.hypot(cAx - cBx, cAy - cBy);
}

export class ObjectTracker {
  private tracks: TrackedPerson[] = [];
  private nextId = 1;
  private readonly iouThreshold: number;
  private readonly maxMissedFrames: number;
  private readonly maxCentroidDistance: number;

  constructor(options: TrackerOptions = {}) {
    this.iouThreshold = options.iouThreshold ?? 0.3;
    this.maxMissedFrames = options.maxMissedFrames ?? 30;
    this.maxCentroidDistance = options.maxCentroidDistance ?? 150;
  }

  /**
   * Reset semua track dan counter ID.
   */
  public reset(): void {
    this.tracks = [];
    this.nextId = 1;
  }

  /**
   * Mendapatkan daftar semua track yang saat ini tersimpan.
   */
  public getTracks(): TrackedPerson[] {
    return [...this.tracks];
  }

  /**
   * Memperbarui posisi deteksi frame terkini.
   * Mengembalikan daftar deteksi pada frame ini beserta ID stabil masing-masing.
   */
  public update(detections: BoundingBox[]): TrackedPerson[] {
    const matchedTrackIndices = new Set<number>();
    const matchedDetectionIndices = new Set<number>();
    const matches: Array<{ trackIndex: number; detectionIndex: number }> = [];

    // 1. Coba pencocokan berbasis IoU tertinggi terlebih dahulu
    const iouPairs: Array<{
      trackIdx: number;
      detIdx: number;
      iou: number;
    }> = [];

    for (let t = 0; t < this.tracks.length; t++) {
      for (let d = 0; d < detections.length; d++) {
        const iou = calculateIoU(this.tracks[t].box, detections[d]);
        if (iou >= this.iouThreshold) {
          iouPairs.push({ trackIdx: t, detIdx: d, iou });
        }
      }
    }

    // Urutkan berdasarkan IoU tertinggi secara greedy
    iouPairs.sort((a, b) => b.iou - a.iou);
    for (const pair of iouPairs) {
      if (
        !matchedTrackIndices.has(pair.trackIdx) &&
        !matchedDetectionIndices.has(pair.detIdx)
      ) {
        matchedTrackIndices.add(pair.trackIdx);
        matchedDetectionIndices.add(pair.detIdx);
        matches.push({
          trackIndex: pair.trackIdx,
          detectionIndex: pair.detIdx,
        });
      }
    }

    // 2. Fallback pencocokan berbasis jarak centroid untuk deteksi/track yang belum cocok
    const centroidPairs: Array<{
      trackIdx: number;
      detIdx: number;
      dist: number;
    }> = [];

    for (let t = 0; t < this.tracks.length; t++) {
      if (matchedTrackIndices.has(t)) continue;
      for (let d = 0; d < detections.length; d++) {
        if (matchedDetectionIndices.has(d)) continue;
        const dist = calculateCentroidDistance(
          this.tracks[t].box,
          detections[d]
        );
        if (dist <= this.maxCentroidDistance) {
          centroidPairs.push({ trackIdx: t, detIdx: d, dist });
        }
      }
    }

    // Urutkan berdasarkan jarak centroid terdekat
    centroidPairs.sort((a, b) => a.dist - b.dist);
    for (const pair of centroidPairs) {
      if (
        !matchedTrackIndices.has(pair.trackIdx) &&
        !matchedDetectionIndices.has(pair.detIdx)
      ) {
        matchedTrackIndices.add(pair.trackIdx);
        matchedDetectionIndices.add(pair.detIdx);
        matches.push({
          trackIndex: pair.trackIdx,
          detectionIndex: pair.detIdx,
        });
      }
    }

    // 3. Update track yang cocok
    for (const match of matches) {
      const track = this.tracks[match.trackIndex];
      track.box = detections[match.detectionIndex];
      track.missedFrames = 0;
      track.isActive = true;
    }

    // 4. Track yang sudah ada tapi tidak cocok di frame ini: naikkan missedFrames
    for (let t = 0; t < this.tracks.length; t++) {
      if (!matchedTrackIndices.has(t)) {
        this.tracks[t].missedFrames++;
        this.tracks[t].isActive = false;
      }
    }

    // 5. Hapus track yang missedFrames melebihi batas maxMissedFrames
    this.tracks = this.tracks.filter(
      (track) => track.missedFrames <= this.maxMissedFrames
    );

    // 6. Deteksi baru yang belum berpasangan mendapatkan ID baru
    const activeResults: TrackedPerson[] = [];
    for (const match of matches) {
      activeResults.push(this.tracks.find((t) => t.id === this.tracks[match.trackIndex]?.id) ?? this.tracks[match.trackIndex]);
    }

    for (let d = 0; d < detections.length; d++) {
      if (!matchedDetectionIndices.has(d)) {
        const newTrack: TrackedPerson = {
          id: this.nextId++,
          box: detections[d],
          missedFrames: 0,
          isActive: true,
        };
        this.tracks.push(newTrack);
        activeResults.push(newTrack);
      }
    }

    return activeResults;
  }
}
