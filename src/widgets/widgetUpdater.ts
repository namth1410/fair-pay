// Push: app tính snapshot mới rồi đẩy sang mọi widget instance. Gọi sau
// syncEngine.run() + khi app vào foreground (SyncBridge). Android-only,
// fire-and-forget — KHÔNG được làm hỏng luồng sync.

import { Platform } from 'react-native';
import { requestWidgetUpdateById } from 'react-native-android-widget';

import { renderTripWidget } from './TripWidget';
import { readState, setSnapshot } from './widgetBridge';
import { buildTripSnapshot } from './widgetSnapshot';
import { WIDGET_NAME, type TripSnapshot } from './widgetTypes';

/**
 * Rebuild snapshot cho mọi trip đang được widget trỏ tới + push cập nhật.
 * No-op nếu không phải Android hoặc chưa có widget nào.
 */
export async function refreshAllTripWidgets(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const { bindings } = await readState();
  const widgetIds = Object.keys(bindings);
  if (widgetIds.length === 0) return;

  // Build snapshot 1 lần cho mỗi trip (nhiều widget có thể chung 1 trip).
  const uniqueTripIds = [...new Set(Object.values(bindings))];
  const snapByTrip = new Map<string, TripSnapshot | null>();
  for (const tripId of uniqueTripIds) {
    const snap = await buildTripSnapshot(tripId).catch(() => null);
    snapByTrip.set(tripId, snap);
    if (snap) await setSnapshot(snap).catch(() => undefined);
  }

  for (const idStr of widgetIds) {
    const tripId = bindings[idStr];
    if (!tripId) continue;
    const snap = snapByTrip.get(tripId) ?? null;
    await requestWidgetUpdateById({
      widgetName: WIDGET_NAME,
      widgetId: Number(idStr),
      renderWidget: () => renderTripWidget(snap, tripId),
    }).catch(() => undefined);
  }
}
