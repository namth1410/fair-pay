// Cầu nối data app ↔ widget qua 1 file JSON trong documentDirectory.
// ĐỌC được từ headless task handler (không cần initDatabase) — dùng
// expo-file-system/legacy giống imageStaging.ts (documentDirectory + read/write
// string; SDK 55 new `File` class chưa expose persistent dir constants).

import * as FileSystem from 'expo-file-system/legacy';

import type { TripSnapshot, WidgetState } from './widgetTypes';

const STATE_FILE = `${FileSystem.documentDirectory}widget_state.json`;

function emptyState(): WidgetState {
  return { bindings: {}, snapshots: {} };
}

/**
 * Serialize mọi read-modify-write TRONG cùng process để tránh race giữa config
 * screen (chọn trip) và push updater (sync xong). KHÔNG bảo vệ cross-process —
 * headless chỉ đọc + xóa binding lúc WIDGET_DELETED, rất hiếm trùng thời điểm
 * ghi; nếu file hỏng, readState() nuốt lỗi parse → widget về placeholder tới
 * lần push kế.
 */
let writeLock: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeLock.then(fn, fn);
  writeLock = run.catch(() => undefined);
  return run;
}

export async function readState(): Promise<WidgetState> {
  try {
    const info = await FileSystem.getInfoAsync(STATE_FILE);
    if (!info.exists) return emptyState();
    const raw = await FileSystem.readAsStringAsync(STATE_FILE);
    const parsed = JSON.parse(raw) as Partial<WidgetState>;
    return {
      bindings: parsed.bindings ?? {},
      snapshots: parsed.snapshots ?? {},
    };
  } catch {
    return emptyState();
  }
}

async function writeState(state: WidgetState): Promise<void> {
  await FileSystem.writeAsStringAsync(STATE_FILE, JSON.stringify(state));
}

export async function setBinding(widgetId: number, tripId: string): Promise<void> {
  await serialize(async () => {
    const s = await readState();
    s.bindings[String(widgetId)] = tripId;
    await writeState(s);
  });
}

export async function removeBinding(widgetId: number): Promise<void> {
  await serialize(async () => {
    const s = await readState();
    delete s.bindings[String(widgetId)];
    await writeState(s);
  });
}

export async function setSnapshot(snapshot: TripSnapshot): Promise<void> {
  await serialize(async () => {
    const s = await readState();
    s.snapshots[snapshot.tripId] = snapshot;
    await writeState(s);
  });
}

/** Đọc tripId + snapshot cho 1 widget (dùng ở headless render). */
export async function getWidgetData(
  widgetId: number
): Promise<{ tripId: string | null; snapshot: TripSnapshot | null }> {
  const s = await readState();
  const tripId = s.bindings[String(widgetId)] ?? null;
  const snapshot = tripId ? s.snapshots[tripId] ?? null : null;
  return { tripId, snapshot };
}
