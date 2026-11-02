import { EventEmitter } from "events";

export interface DashboardEvent {
  id: string;
  templeId: string;
  cameraId: string;
  cameraLabel?: string;
  trackId: number;
  ts: string;
  status: "pending" | "ok" | "violation" | "uncertain" | "error";
  reasons: string[];
  confidence: number;
  officerAction?: "allowed" | "warned" | "sarong_provided" | "dismissed" | null;
  officerId?: string | null;
  officerName?: string | null;
  notes?: string | null;
}

export interface ActionUpdatePayload {
  eventId: string;
  officerAction: "allowed" | "warned" | "sarong_provided" | "dismissed";
  officerId: string;
  officerName: string;
  ts: string;
}

// Global EventEmitter agar tidak dibuat ulang pada Hot Module Replacement (HMR) Next.js
const globalForEvents = globalThis as unknown as {
  eventBus: EventEmitter | undefined;
};

export const eventBus = globalForEvents.eventBus ?? new EventEmitter();
eventBus.setMaxListeners(100);

if (process.env.NODE_ENV !== "production") {
  globalForEvents.eventBus = eventBus;
}

// Nama event saluran
export const EVENT_CHANNELS = {
  NEW_DETECTION: "detection:new",
  OFFICER_ACTION: "officer:action",
} as const;

/**
 * Broadcast event deteksi baru ke seluruh subscriber SSE
 */
export function broadcastDetection(event: DashboardEvent) {
  eventBus.emit(EVENT_CHANNELS.NEW_DETECTION, event);
}

/**
 * Broadcast pembaruan tindakan petugas ke seluruh subscriber SSE
 */
export function broadcastAction(action: ActionUpdatePayload) {
  eventBus.emit(EVENT_CHANNELS.OFFICER_ACTION, action);
}
