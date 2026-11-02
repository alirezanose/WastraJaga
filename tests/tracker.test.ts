import { describe, it, expect, beforeEach } from "vitest";
import { ObjectTracker, type BoundingBox } from "@/lib/tracker";

describe("ObjectTracker", () => {
  let tracker: ObjectTracker;

  beforeEach(() => {
    // maxMissedFrames diatur ke 3 untuk kemudahan pengujian
    tracker = new ObjectTracker({
      iouThreshold: 0.3,
      maxMissedFrames: 3,
      maxCentroidDistance: 100,
    });
  });

  it("memberikan ID yang sama untuk orang yang posisinya bergeser sedikit (orang tetap)", () => {
    const frame1Box: BoundingBox = {
      originX: 100,
      originY: 100,
      width: 80,
      height: 180,
    };
    const frame1 = tracker.update([frame1Box]);

    expect(frame1).toHaveLength(1);
    const initialId = frame1[0].id;

    // Orang sedikit bergeser di frame berikutnya (overlap IoU masih tinggi)
    const frame2Box: BoundingBox = {
      originX: 105,
      originY: 102,
      width: 80,
      height: 180,
    };
    const frame2 = tracker.update([frame2Box]);

    expect(frame2).toHaveLength(1);
    expect(frame2[0].id).toBe(initialId);
  });

  it("memberikan ID baru yang unik untuk orang baru yang masuk frame", () => {
    const person1Box: BoundingBox = {
      originX: 50,
      originY: 50,
      width: 60,
      height: 150,
    };
    const frame1 = tracker.update([person1Box]);
    expect(frame1).toHaveLength(1);
    const id1 = frame1[0].id;

    // Frame 2: person1 tetap ada, orang kedua masuk di area yang jauh
    const person2Box: BoundingBox = {
      originX: 400,
      originY: 50,
      width: 60,
      height: 150,
    };
    const frame2 = tracker.update([person1Box, person2Box]);

    expect(frame2).toHaveLength(2);
    const matchedP1 = frame2.find((p) => p.box.originX === 50);
    const matchedP2 = frame2.find((p) => p.box.originX === 400);

    expect(matchedP1?.id).toBe(id1);
    expect(matchedP2?.id).toBeDefined();
    expect(matchedP2?.id).not.toBe(id1);
  });

  it("membuang ID orang yang hilang setelah melebihi maxMissedFrames", () => {
    const personBox: BoundingBox = {
      originX: 100,
      originY: 100,
      width: 70,
      height: 160,
    };
    const frame1 = tracker.update([personBox]);
    const id = frame1[0].id;
    expect(tracker.getTracks()).toHaveLength(1);

    // Frame 2, 3, 4: orang tidak terdeteksi (missedFrames = 1, 2, 3)
    tracker.update([]);
    tracker.update([]);
    tracker.update([]);
    expect(tracker.getTracks()).toHaveLength(1); // masih disimpan hingga batas 3 frame

    // Frame 5: missedFrames menjadi 4 (> maxMissedFrames 3) -> track dibuang
    tracker.update([]);
    expect(tracker.getTracks()).toHaveLength(0);

    // Jika orang baru muncul di tempat yang sama setelah dibuang, mendapat ID baru
    const frame6 = tracker.update([personBox]);
    expect(frame6[0].id).not.toBe(id);
  });

  it("tidak menukar ID antara dua orang yang berdekatan", () => {
    // Dua orang berdiri berdampingan
    const personABox: BoundingBox = {
      originX: 100,
      originY: 100,
      width: 60,
      height: 160,
    };
    const personBBox: BoundingBox = {
      originX: 180,
      originY: 100,
      width: 60,
      height: 160,
    };

    const initial = tracker.update([personABox, personBBox]);
    const trackA = initial.find((p) => p.box.originX === 100)!;
    const trackB = initial.find((p) => p.box.originX === 180)!;

    expect(trackA.id).not.toBe(trackB.id);

    // Keduanya bergeser sedikit ke kanan secara bersamaan
    const personAShifted: BoundingBox = {
      originX: 110,
      originY: 100,
      width: 60,
      height: 160,
    };
    const personBShifted: BoundingBox = {
      originX: 190,
      originY: 100,
      width: 60,
      height: 160,
    };

    const nextFrame = tracker.update([personAShifted, personBShifted]);
    const matchedA = nextFrame.find((p) => p.box.originX === 110)!;
    const matchedB = nextFrame.find((p) => p.box.originX === 190)!;

    expect(matchedA.id).toBe(trackA.id);
    expect(matchedB.id).toBe(trackB.id);
  });
});
